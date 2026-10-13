/**
 * The open project ("document"): its layers, basemap and globe setting, where
 * it's saved, and whether it has unsaved changes.
 *
 * The map view (centre, zoom, ...) isn't kept here: MapView owns it, and it's
 * read when saving and set after opening. Moving the map doesn't count as an
 * unsaved change, the same as in most GIS apps.
 *
 * Asking the user things (dialogs) is left to App.svelte; this class only
 * holds state and does the work, so it can be tested without a window.
 */
import type { LayerData, MapViewState, OfflineMap, Project, ProjectLayer, TileInfo } from "./api";
import { restoreAnnotations } from "./annotate/data";
import { LayerList } from "./layers.svelte";
import { DEFAULT_BASEMAP, OFFLINE_BASEMAP_ID } from "./map/basemaps";
import { flavorOrDefault } from "./map/offline";
import { restoreFilter } from "./filter";
import { basemapOrDefault, fileName, projectLayerFor, projectName, restoreStyle } from "./project";
import { defaultStyle } from "./style/layerStyle";

/** Reads a data file into layers: `openFile` from api.ts, or a stand-in in tests. */
export type FileOpener = (path: string) => Promise<LayerData[]>;
/** Opens an offline map file: `openTiles` from api.ts, or a stand-in in tests. */
export type TilesOpener = (path: string) => Promise<TileInfo>;

/** A layer from a project that couldn't be opened, and why. */
export interface LayerProblem {
  layer: ProjectLayer;
  reason: string;
}

export class MapDocument {
  readonly layers = new LayerList();
  /** A basemap id from lib/map/basemaps.ts, or OFFLINE_BASEMAP_ID for `offlineMap`. */
  basemapId = $state(DEFAULT_BASEMAP.id);
  /**
   * The project's offline map file and colour scheme. Kept (and saved) while
   * another basemap is showing, so switching back is one click.
   */
  offlineMap = $state<OfflineMap | null>(null);
  /** The open offline map file, or null when there's none or it couldn't be opened. */
  offlineInfo = $state.raw<TileInfo | null>(null);
  /** Why the project's offline map couldn't be opened, or null. */
  offlineProblem = $state<string | null>(null);
  globe = $state(false);
  /** Where the project is saved, or null if it never has been. */
  path = $state<string | null>(null);
  /**
   * Layers from the project file whose data couldn't be opened (moved or
   * deleted files). They're kept and written back on save, so opening a
   * project while a drive is unplugged doesn't quietly lose them.
   */
  missing = $state.raw<ProjectLayer[]>([]);

  /** The state at the last save/open, as text, to compare against. */
  #savedSnapshot = $state("");

  /** True when something has changed since the last save or open. */
  dirty = $derived(this.#snapshot() !== this.#savedSnapshot);
  /** Display name: the file name without ".smartmap", or "Untitled". */
  name = $derived(projectName(this.path));

  /** `basemapId`: what a new project starts with (the Preferences setting). */
  constructor(basemapId: string = DEFAULT_BASEMAP.id) {
    this.basemapId = basemapId;
    this.#savedSnapshot = this.#snapshot();
  }

  /**
   * Everything a save would write except the view, as one string. Two equal
   * snapshots mean nothing worth saving has changed (so undoing a change by
   * hand makes the project clean again).
   */
  #snapshot(): string {
    return JSON.stringify({
      basemap: this.basemapId,
      offlineMap: this.offlineMap,
      globe: this.globe,
      layers: this.layers.layers.map(projectLayerFor),
      missing: this.missing,
    });
  }

  /** The project to save, with the given map view. */
  toProject(view: MapViewState): Project {
    return {
      view,
      basemap: this.basemapId,
      offlineMap: this.offlineMap,
      globe: this.globe,
      // Missing layers go at the bottom: their exact place among the others
      // isn't tracked, and the bottom hides the least if they come back.
      layers: [...this.missing, ...this.layers.layers.map(projectLayerFor)],
    };
  }

  /** Records that the project is now saved at `path` (after Save or Save As). */
  markSaved(path: string | null) {
    this.path = path;
    this.#savedSnapshot = this.#snapshot();
  }

  /** File → New: an empty, untitled project with the given basemap. */
  reset(basemapId: string = DEFAULT_BASEMAP.id) {
    this.layers.clear();
    this.missing = [];
    this.basemapId = basemapId;
    this.offlineMap = null;
    this.offlineInfo = null;
    this.offlineProblem = null;
    this.globe = false;
    this.markSaved(null);
  }

  /** Shows an opened offline map file as the basemap, keeping the colour scheme if there was one. */
  useOfflineMap(info: TileInfo) {
    this.offlineMap = { path: info.path, flavor: flavorOrDefault(this.offlineMap?.flavor) };
    this.offlineInfo = info;
    this.offlineProblem = null;
    this.basemapId = OFFLINE_BASEMAP_ID;
  }

  /** Changes the offline map's colour scheme. */
  setFlavor(flavor: string) {
    if (this.offlineMap) this.offlineMap = { ...this.offlineMap, flavor: flavorOrDefault(flavor) };
  }

  /** Drops a missing layer from the project (the user doesn't want it any more). */
  forgetMissing(layer: ProjectLayer) {
    this.missing = this.missing.filter((l) => l !== layer);
  }

  /**
   * Replaces the current project with `project` (already read from `path`),
   * opening every layer's data file with `open` and the offline map (if any)
   * with `openTiles`. Layers that fail to open are kept in `missing` and
   * returned with the reason; an offline map that fails sets `offlineProblem`.
   */
  async load(project: Project, path: string, open: FileOpener, openTiles: TilesOpener): Promise<LayerProblem[]> {
    this.layers.clear();
    this.missing = [];
    const saved = project.offlineMap;
    this.offlineMap = saved ? { path: saved.path, flavor: flavorOrDefault(saved.flavor) } : null;
    this.offlineInfo = null;
    this.offlineProblem = null;
    this.basemapId =
      project.basemap === OFFLINE_BASEMAP_ID && this.offlineMap ? OFFLINE_BASEMAP_ID : basemapOrDefault(project.basemap).id;
    this.globe = project.globe;

    // The offline map opens alongside the layers. If it fails, the project keeps
    // the reference (so saving doesn't lose it) and the default basemap shows.
    const tiles = this.offlineMap
      ? openTiles(this.offlineMap.path).then(
          (info) => (this.offlineInfo = info),
          (error: unknown) => (this.offlineProblem = error instanceof Error ? error.message : String(error)),
        )
      : Promise.resolve();

    // Start reading every file at once (Rust reads them on background threads),
    // then add the layers in project order as their files arrive. Each file is
    // read once, even if several layers use it (tables of one GeoPackage).
    // Errors are turned into values so a failed read waiting its turn doesn't
    // count as an "unhandled" promise rejection.
    const reads = new Map<string, Promise<LayerData[] | Error>>();
    for (const { path: file, annotation } of project.layers) {
      if (!annotation && !reads.has(file)) {
        reads.set(
          file,
          open(file).catch((error: unknown) => (error instanceof Error ? error : new Error(String(error)))),
        );
      }
    }

    const problems: LayerProblem[] = [];
    for (const saved of project.layers) {
      const settings = {
        name: saved.name,
        visible: saved.visible,
        opacity: saved.opacity,
        style: restoreStyle(saved.style, defaultStyle(this.layers.layers.length)),
        filter: restoreFilter(saved.filter),
      };
      if (saved.annotation) {
        // Annotation layers carry their own features: nothing to read.
        this.layers.addAnnotationLayer(saved.name, restoreAnnotations(saved.annotation), settings);
        continue;
      }
      const result = await reads.get(saved.path)!;
      const data =
        result instanceof Error
          ? undefined
          : saved.table === null
            ? result[0]
            : result.find((layer) => layer.table === saved.table);
      if (!data) {
        const reason =
          result instanceof Error ? result.message : `${fileName(saved.path)} has no table "${saved.table}"`;
        problems.push({ layer: saved, reason });
        continue;
      }
      this.layers.add(data, settings);
    }

    this.missing = problems.map((p) => p.layer);
    await tiles;
    this.markSaved(path);
    return problems;
  }
}

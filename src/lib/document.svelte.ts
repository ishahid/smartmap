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
import type { LayerData, MapViewState, Project, ProjectLayer } from "./api";
import { LayerList } from "./layers.svelte";
import { DEFAULT_BASEMAP } from "./map/basemaps";
import { basemapOrDefault, fileName, projectLayerFor, projectName, restoreStyle } from "./project";
import { defaultStyle } from "./style/layerStyle";

/** Reads a data file into layers: `openFile` from api.ts, or a stand-in in tests. */
export type FileOpener = (path: string) => Promise<LayerData[]>;

/** A layer from a project that couldn't be opened, and why. */
export interface LayerProblem {
  layer: ProjectLayer;
  reason: string;
}

export class MapDocument {
  readonly layers = new LayerList();
  basemapId = $state(DEFAULT_BASEMAP.id);
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

  constructor() {
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
      globe: this.globe,
      // Missing layers go at the bottom: their exact place among the others
      // isn't tracked, and the bottom hides the least if they come back.
      layers: [...this.missing, ...this.layers.layers.map(projectLayerFor)],
      annotations: [],
    };
  }

  /** Records that the project is now saved at `path` (after Save or Save As). */
  markSaved(path: string | null) {
    this.path = path;
    this.#savedSnapshot = this.#snapshot();
  }

  /** File → New: an empty, untitled project. */
  reset() {
    this.layers.clear();
    this.missing = [];
    this.basemapId = DEFAULT_BASEMAP.id;
    this.globe = false;
    this.markSaved(null);
  }

  /** Drops a missing layer from the project (the user doesn't want it any more). */
  forgetMissing(layer: ProjectLayer) {
    this.missing = this.missing.filter((l) => l !== layer);
  }

  /**
   * Replaces the current project with `project` (already read from `path`),
   * opening every layer's data file with `open`. Layers that fail to open are
   * kept in `missing` and returned with the reason.
   */
  async load(project: Project, path: string, open: FileOpener): Promise<LayerProblem[]> {
    this.layers.clear();
    this.missing = [];
    this.basemapId = basemapOrDefault(project.basemap).id;
    this.globe = project.globe;

    // Start reading every file at once (Rust reads them on background threads),
    // then add the layers in project order as their files arrive. Each file is
    // read once, even if several layers use it (tables of one GeoPackage).
    // Errors are turned into values so a failed read waiting its turn doesn't
    // count as an "unhandled" promise rejection.
    const reads = new Map<string, Promise<LayerData[] | Error>>();
    for (const { path: file } of project.layers) {
      if (!reads.has(file)) {
        reads.set(
          file,
          open(file).catch((error: unknown) => (error instanceof Error ? error : new Error(String(error)))),
        );
      }
    }

    const problems: LayerProblem[] = [];
    for (const saved of project.layers) {
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
      this.layers.add(data, {
        name: saved.name,
        visible: saved.visible,
        opacity: saved.opacity,
        style: restoreStyle(saved.style, defaultStyle(this.layers.layers.length)),
      });
    }

    this.missing = problems.map((p) => p.layer);
    this.markSaved(path);
    return problems;
  }
}

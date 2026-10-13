/**
 * Typed wrappers around the Rust commands in src-tauri/src/commands.rs.
 * Keep every `invoke` call in this file so the Rust ↔ TypeScript contract lives in one place.
 */
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow, type CloseRequestedEvent } from "@tauri-apps/api/window";
import { message, open, save } from "@tauri-apps/plugin-dialog";
import type { FeatureCollection, Geometry } from "geojson";
import { sphericalMeasure } from "./measure/spherical";

export interface AppInfo {
  name: string;
  version: string;
  os: string;
  arch: string;
}

/**
 * A data file loaded by Rust. Mirrors `Layer` in src-tauri/src/io/mod.rs
 * (Rust's snake_case fields arrive here in camelCase).
 */
export interface LayerData {
  /** Display name: the file name, or "file: table" for a GeoPackage with several tables. */
  name: string;
  path: string;
  /** For a GeoPackage, which table this layer is; null for single-layer formats. */
  table: string | null;
  /** File format, e.g. "Shapefile", "GeoPackage", "CSV". */
  format: string;
  geometryType: "Point" | "Line" | "Polygon" | "Mixed" | "None";
  featureCount: number;
  /** Features with no usable geometry (kept, so their attributes still show). */
  emptyGeometries: number;
  /** [minLon, minLat, maxLon, maxLat], or null when there's no geometry. */
  bbox: [number, number, number, number] | null;
  /** Attribute column names, in file order. */
  fields: string[];
  /** The file's coordinate system, e.g. "EPSG:32643" or "unknown (assumed WGS 84)". */
  crs: string;
  /** True if Rust converted the coordinates to longitude/latitude. */
  reprojected: boolean;
  /** Things worth telling the user, e.g. "3 rows had no valid coordinates". */
  warnings: string[];
  /** Always WGS84 longitude/latitude, whatever the file used. Features may have no geometry. */
  geojson: FeatureCollection<Geometry | null>;
}

/**
 * File types the Open dialog offers. Keep in step with `EXTENSIONS` in src-tauri/src/io/mod.rs.
 * Upper-case variants are listed because Linux file dialogs match extensions case-sensitively.
 */
const FORMATS = [
  { name: "ESRI Shapefile", extensions: ["shp"] },
  { name: "GeoJSON", extensions: ["geojson", "json"] },
  { name: "GeoPackage", extensions: ["gpkg"] },
  { name: "FlatGeobuf", extensions: ["fgb"] },
  { name: "KML / KMZ", extensions: ["kml", "kmz"] },
  { name: "GPX", extensions: ["gpx"] },
  { name: "CSV with lat/lon columns", extensions: ["csv", "tsv", "txt"] },
];
const withUpperCase = (extensions: string[]) => extensions.flatMap((e) => [e, e.toUpperCase()]);

/** Extension of SmartMap project files. Keep in step with `EXTENSION` in src-tauri/src/project.rs. */
export const PROJECT_EXTENSION = "smartmap";
const PROJECT_FILTER = { name: "SmartMap project", extensions: withUpperCase([PROJECT_EXTENSION]) };

/** The Open dialog accepts projects and data files alike. */
const OPEN_FILTERS = [
  {
    name: "Projects and data files",
    extensions: withUpperCase([PROJECT_EXTENSION, ...FORMATS.flatMap((f) => f.extensions)]),
  },
  PROJECT_FILTER,
  ...FORMATS.map((f) => ({ name: f.name, extensions: withUpperCase(f.extensions) })),
];

/** True when running inside the desktop app (false in a plain browser via `npm run dev`). */
export const inDesktopApp = isTauri();

/** Returns build information from the Rust side, or a browser placeholder when run with `npm run dev`. */
export async function getAppInfo(): Promise<AppInfo> {
  if (!inDesktopApp) {
    return { name: "SmartMap", version: "dev (browser)", os: "web", arch: "-" };
  }
  return invoke<AppInfo>("app_info");
}

/** Shows the native Open dialog for projects and data files. Returns the chosen paths (empty if cancelled). */
export async function pickFilesToOpen(): Promise<string[]> {
  const chosen = await open({ multiple: true, directory: false, filters: OPEN_FILTERS });
  return chosen ?? [];
}

/**
 * Shows the native Save dialog for a project. Returns the chosen path, or null if cancelled.
 * `suggested` is the file name (or full path) the dialog starts with.
 */
export async function pickProjectSavePath(suggested: string): Promise<string | null> {
  return save({ defaultPath: suggested, filters: [PROJECT_FILTER] });
}

/** What the user chose when asked about unsaved changes. */
export type UnsavedChoice = "save" | "discard" | "cancel";

/** Asks "Save changes to <name>?" with Save, Don't Save and Cancel buttons. */
export async function askToSaveChanges(name: string): Promise<UnsavedChoice> {
  // In a plain browser (`npm run dev`) there's no saving, so only offer to discard.
  if (!inDesktopApp) return window.confirm(`Discard the changes to ${name}?`) ? "discard" : "cancel";
  const labels = { yes: "Save", no: "Don't Save", cancel: "Cancel" };
  const answer = await message(`Do you want to save the changes you made to ${name}?`, {
    title: "SmartMap",
    kind: "warning",
    buttons: labels,
  });
  // Depending on the OS, the answer is the button's label or its role ("Yes").
  if (answer === labels.yes || answer === "Yes") return "save";
  if (answer === labels.no || answer === "No") return "discard";
  return "cancel";
}

/** Sets the window title (or the browser tab title when run with `npm run dev`). */
export async function setWindowTitle(title: string): Promise<void> {
  document.title = title;
  if (inDesktopApp) await getCurrentWindow().setTitle(title);
}

/**
 * Runs `handler` when the user tries to close the window. The handler can call
 * `event.preventDefault()` to keep it open; otherwise the window closes once it
 * finishes. Returns a function that stops listening. Does nothing in a browser.
 */
export async function onWindowClose(handler: (event: CloseRequestedEvent) => Promise<void>): Promise<() => void> {
  if (!inDesktopApp) return () => {};
  return getCurrentWindow().onCloseRequested(handler);
}

/**
 * Reads a data file in Rust and returns its layers (usually one; a GeoPackage can hold several).
 * Throws an Error with a readable message on failure.
 */
export async function openFile(path: string): Promise<LayerData[]> {
  try {
    return await invoke<LayerData[]>("open_file", { path });
  } catch (message) {
    // Rust returns errors as plain strings; wrap them so callers can use `error.message`.
    throw new Error(String(message));
  }
}

/** Where the map is looking. Mirrors `View` in src-tauri/src/project.rs. */
export interface MapViewState {
  /** [longitude, latitude] */
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

/**
 * One layer in a project. Mirrors `ProjectLayer` in src-tauri/src/project.rs.
 * `path` is always absolute here; Rust makes it relative inside the file.
 * Annotation layers have no file: their features are in `annotation` and `path` is "".
 */
export interface ProjectLayer {
  path: string;
  table: string | null;
  name: string;
  visible: boolean;
  opacity: number;
  /** A LayerStyle as saved. Older or hand-edited files may miss fields, hence `unknown`. */
  style: unknown;
  /** A LayerFilter (lib/filter.ts) or null. `unknown` for the same reason as `style`. */
  filter: unknown;
  /** For annotation layers, a GeoJSON FeatureCollection of the drawn features. */
  annotation?: unknown;
}

/** An offline basemap in a project. Mirrors `OfflineMap` in src-tauri/src/project.rs. */
export interface OfflineMap {
  /** The PMTiles or MBTiles file (always absolute here, like layer paths). */
  path: string;
  /** Colour scheme for Protomaps maps, e.g. "light" (see FLAVORS in lib/map/offline.ts). */
  flavor: string;
}

/** A `.smartmap` project. Mirrors `Project` in src-tauri/src/project.rs. */
export interface Project {
  view: MapViewState;
  /** A basemap id from lib/map/basemaps.ts, or "offline" for `offlineMap`. */
  basemap: string;
  /** The local tile file, when the project has one. */
  offlineMap?: OfflineMap | null;
  globe: boolean;
  /** Bottom first, as drawn. Annotation layers are among them. */
  layers: ProjectLayer[];
}

/** Reads a project file. Layer paths come back absolute. Throws an Error with a readable message on failure. */
export async function loadProject(path: string): Promise<Project> {
  try {
    return await invoke<Project>("load_project", { path });
  } catch (message) {
    throw new Error(String(message));
  }
}

/** Writes a project file (paths are stored relative to it). Throws an Error with a readable message on failure. */
export async function saveProject(path: string, project: Project): Promise<void> {
  try {
    await invoke("save_project", { path, project });
  } catch (message) {
    throw new Error(String(message));
  }
}

/** Formats a layer can be exported to. Keep in step with src-tauri/src/export.rs. */
const EXPORT_FILTERS = [
  { name: "GeoPackage", extensions: ["gpkg"] },
  { name: "GeoJSON", extensions: ["geojson"] },
];

/** Shows the native Save dialog for exporting a layer. Returns the path, or null if cancelled. */
export async function pickExportPath(suggestedName: string): Promise<string | null> {
  return save({ defaultPath: `${suggestedName}.gpkg`, filters: EXPORT_FILTERS });
}

/**
 * Writes a layer to a GeoPackage or GeoJSON file (chosen by the extension).
 * Returns how many features were written. Throws an Error with a readable message on failure.
 */
export async function exportLayer(path: string, name: string, layer: FeatureCollection<Geometry | null>): Promise<number> {
  try {
    return await invoke<number>("export_layer", { path, name, layer });
  } catch (message) {
    throw new Error(String(message));
  }
}

/** What a shape measures. Mirrors `Measurement` in src-tauri/src/analysis.rs. */
export interface Measurement {
  /** Length of lines, in metres. */
  length: number;
  /** Area of polygons, in square metres. */
  area: number;
  /** Length of polygon edges, in metres. */
  perimeter: number;
}

/**
 * Measures a shape on the WGS84 ellipsoid (in Rust). In a plain browser
 * (`npm run dev`) it falls back to a rougher spherical calculation.
 */
export async function measureGeometry(geometry: Geometry): Promise<Measurement> {
  if (!inDesktopApp) return sphericalMeasure(geometry);
  try {
    return await invoke<Measurement>("measure_geometry", { geometry });
  } catch (message) {
    throw new Error(String(message));
  }
}

/** A local tile file opened as a basemap. Mirrors `TileInfo` in src-tauri/src/tiles/mod.rs. */
export interface TileInfo {
  /** The name its tiles are served under (see fetchTile). */
  id: string;
  path: string;
  /** The map's name from the file, or the file name. */
  name: string;
  format: "PMTiles" | "MBTiles";
  tileType: "vector" | "png" | "jpeg" | "webp" | "avif";
  minZoom: number;
  maxZoom: number;
  /** [west, south, east, north], if the file says. */
  bounds: [number, number, number, number] | null;
  /** [longitude, latitude, zoom], if the file says. */
  center: [number, number, number] | null;
  /** Credit for the map data (may contain HTML links). */
  attribution: string | null;
  /** The map's version from its metadata; for Protomaps maps, their layer scheme ("4.x" is current). */
  version: string | null;
  /** For vector tiles, the names of their layers (e.g. "earth", "water", "roads"). */
  vectorLayers: string[];
}

/**
 * In a plain browser (`npm run dev`) there's no Rust in the page, so offline
 * maps come from the development tile server instead:
 * `cargo run --example tile_server` in src-tauri.
 */
const DEV_TILE_SERVER = "http://localhost:1422/";

/** Where tiles are served: tiles://localhost/ (http://tiles.localhost/ on Windows), or the dev server. */
function tileServerBase(): string {
  return inDesktopApp ? convertFileSrc("", "tiles") : DEV_TILE_SERVER;
}

const TILE_FILTER = { name: "Offline maps (PMTiles, MBTiles)", extensions: withUpperCase(["pmtiles", "mbtiles"]) };

/** Asks for a PMTiles or MBTiles file. Returns its path, or null if cancelled. */
export async function pickTilesFile(): Promise<string | null> {
  if (!inDesktopApp) {
    // No file dialog in a browser; the dev tile server opens any path it's given.
    return window.prompt("Full path of a .pmtiles or .mbtiles file (needs `cargo run --example tile_server`):") || null;
  }
  const chosen = await open({ multiple: false, directory: false, filters: [TILE_FILTER] });
  return chosen ?? null;
}

/** Opens a PMTiles or MBTiles file to use as a basemap. Throws an Error with a readable message on failure. */
export async function openTiles(path: string): Promise<TileInfo> {
  if (!inDesktopApp) {
    const response = await fetch(`${DEV_TILE_SERVER}open?path=${encodeURIComponent(path)}`).catch(() => {
      throw new Error("Offline maps in the browser need the tile server: run `cargo run --example tile_server` in src-tauri.");
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }
  try {
    return await invoke<TileInfo>("open_tiles", { path });
  } catch (message) {
    throw new Error(String(message));
  }
}

/**
 * Reads one tile of an open offline map (from Rust, through the tiles://
 * protocol). Returns null when the file has no such tile.
 */
export async function fetchTile(id: string, z: number, x: number, y: number, signal?: AbortSignal): Promise<ArrayBuffer | null> {
  const response = await fetch(`${tileServerBase()}${id}/${z}/${x}/${y}`, { signal });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`Tile ${z}/${x}/${y}: ${await response.text()}`);
  return response.arrayBuffer();
}

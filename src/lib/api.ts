/**
 * Typed wrappers around the Rust commands in src-tauri/src/commands.rs.
 * Keep every `invoke` call in this file so the Rust ↔ TypeScript contract lives in one place.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { FeatureCollection } from "geojson";

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
  /** Always WGS84 longitude/latitude, whatever the file used. */
  geojson: FeatureCollection;
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
const DATA_FILE_FILTERS = [
  { name: "All supported files", extensions: withUpperCase(FORMATS.flatMap((f) => f.extensions)) },
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

/** Shows the native Open dialog. Returns the chosen file paths (empty if cancelled). */
export async function pickDataFiles(): Promise<string[]> {
  const chosen = await open({ multiple: true, directory: false, filters: DATA_FILE_FILTERS });
  return chosen ?? [];
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

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
  name: string;
  path: string;
  /** Shapefile geometry type, e.g. "Point", "Polyline", "Polygon". */
  geometryType: string;
  featureCount: number;
  /** Records with no usable geometry (kept, so record numbers line up). */
  emptyGeometries: number;
  /** [minX, minY, maxX, maxY], or null when the file has no extent. */
  bbox: [number, number, number, number] | null;
  /** Attribute column names, in file order. */
  fields: string[];
  /** Coordinate system text from a .prj file, if any. */
  crsWkt: string | null;
  geojson: FeatureCollection;
}

/** File types the Open dialog offers. Grows as step 3 adds readers. */
const DATA_FILE_FILTERS = [{ name: "ESRI Shapefile", extensions: ["shp", "SHP"] }];

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

/** Reads a data file in Rust. Throws an Error with a readable message on failure. */
export async function openLayer(path: string): Promise<LayerData> {
  try {
    return await invoke<LayerData>("open_layer", { path });
  } catch (message) {
    // Rust returns errors as plain strings; wrap them so callers can use `error.message`.
    throw new Error(String(message));
  }
}

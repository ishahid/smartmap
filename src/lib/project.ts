/**
 * Helpers for project files that don't need Svelte or Tauri, so they're easy
 * to test. The project store is in document.svelte.ts, and reading and writing
 * the file happens in Rust (src-tauri/src/project.rs).
 */
import { PROJECT_EXTENSION, type ProjectLayer } from "./api";
import { BASEMAPS, DEFAULT_BASEMAP, type Basemap } from "./map/basemaps";
import type { MapLayer } from "./map/types";
import { POINT_SHAPES, type LayerStyle } from "./style/types";

/** Name shown for a project that hasn't been saved yet. */
export const UNTITLED = "Untitled";

/** What a project file stores about a layer. */
export function projectLayerFor(layer: MapLayer): ProjectLayer {
  const saved: ProjectLayer = {
    path: layer.data.path,
    table: layer.data.table,
    name: layer.name,
    visible: layer.visible,
    opacity: layer.opacity,
    style: layer.style,
    filter: layer.filter,
  };
  // Annotation layers have no file, so their features go in the project.
  if (layer.annotations) saved.annotation = { type: "FeatureCollection", features: layer.annotations };
  return saved;
}

/** The last part of a path, e.g. "trip.smartmap". Handles both `/` and `\`. */
export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** The project's display name: its file name without ".smartmap", or "Untitled". */
export function projectName(path: string | null): string {
  if (!path) return UNTITLED;
  const name = fileName(path);
  return isProjectFile(name) ? name.slice(0, -(PROJECT_EXTENSION.length + 1)) : name;
}

/** True for paths ending in ".smartmap" (any case). */
export function isProjectFile(path: string): boolean {
  return path.toLowerCase().endsWith(`.${PROJECT_EXTENSION}`);
}

/** Adds ".smartmap" if missing (some Linux Save dialogs don't add the extension). */
export function withProjectExtension(path: string): string {
  return isProjectFile(path) ? path : `${path}.${PROJECT_EXTENSION}`;
}

/** The basemap with this id, or the default one if it's unknown (e.g. removed since the project was saved). */
export function basemapOrDefault(id: string): Basemap {
  return BASEMAPS.find((b) => b.id === id) ?? DEFAULT_BASEMAP;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * True if `value` can stand in for `example`: same JavaScript type, any array
 * for an array, and a string or null where the default is null (field names).
 */
function sameKind(value: unknown, example: unknown): boolean {
  if (example === null) return value === null || typeof value === "string";
  if (Array.isArray(example)) return Array.isArray(value);
  return typeof value === typeof example;
}

/**
 * Takes each setting from `saved` when it has the right type, and from
 * `defaults` otherwise. Nested objects (like `label`) are merged the same way.
 */
function mergeLike<T extends object>(defaults: T, saved: Record<string, unknown>): T {
  const result: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = saved[key];
    if (isPlainObject(fallback) && isPlainObject(value)) result[key] = mergeLike(fallback, value);
    else if (key in saved && sameKind(value, fallback)) result[key] = value;
  }
  return result as T;
}

/**
 * Rebuilds a LayerStyle from a project file. Settings that are missing (a
 * project saved before they existed) or have the wrong type (a hand-edited
 * file) fall back to `defaults`, so a layer always gets a complete, usable style.
 */
export function restoreStyle(saved: unknown, defaults: LayerStyle): LayerStyle {
  if (!isPlainObject(saved)) return defaults;
  const style = mergeLike(defaults, saved);
  if (!POINT_SHAPES.includes(style.pointShape)) style.pointShape = defaults.pointShape;
  return style;
}

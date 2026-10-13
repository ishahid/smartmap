/**
 * Small helpers for working with a layer's features: showing attribute values,
 * naming features, and measuring their extent.
 *
 * Feature ids: Rust numbers every feature by its position in the file
 * (io::finish), so `features[id]` is the feature with that id. The table,
 * selection and map highlighting all rely on that.
 */
import type { Feature, Geometry, Position } from "geojson";
import type { LayerData } from "./api";
import { numericFields } from "./style/classify";

/** A feature that may have no geometry (readers keep those for their attributes). */
export type AnyFeature = Feature<Geometry | null>;

/** A bounding box: [minLon, minLat, maxLon, maxLat]. */
export type Bbox = [number, number, number, number];

/**
 * An attribute value as text, the way MapLibre's `["to-string", …]` shows it:
 * "" for missing values, JSON for lists and objects.
 */
export function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// Working out which fields are numeric reads every feature, so remember the
// answer per layer. A WeakMap forgets it when the layer's data is dropped.
const numericCache = new WeakMap<LayerData, ReadonlySet<string>>();

/** The layer's fields whose values are all numbers (blanks allowed). */
export function numericFieldsOf(data: LayerData): ReadonlySet<string> {
  let fields = numericCache.get(data);
  if (!fields) {
    fields = new Set(numericFields(data.geojson.features, data.fields));
    numericCache.set(data, fields);
  }
  return fields;
}

/**
 * A short name for a feature, for lists: the first non-empty field with "name"
 * in it, else "title" or "label", else the first non-empty text value, else "Feature 12".
 */
export function featureLabel(feature: AnyFeature, fields: string[]): string {
  const properties = feature.properties ?? {};
  const textOf = (field: string) => toText(properties[field]).trim();
  const preferred =
    fields.find((f) => /name/i.test(f) && textOf(f) !== "") ??
    fields.find((f) => /title|label/i.test(f) && textOf(f) !== "") ??
    fields.find((f) => typeof properties[f] === "string" && textOf(f) !== "");
  return preferred ? textOf(preferred) : `Feature ${feature.id ?? "?"}`;
}

/** Calls `visit` for every coordinate in a geometry. */
function eachPosition(geometry: Geometry, visit: (position: Position) => void) {
  switch (geometry.type) {
    case "Point":
      visit(geometry.coordinates);
      break;
    case "MultiPoint":
    case "LineString":
      geometry.coordinates.forEach(visit);
      break;
    case "MultiLineString":
    case "Polygon":
      geometry.coordinates.forEach((ring) => ring.forEach(visit));
      break;
    case "MultiPolygon":
      geometry.coordinates.forEach((polygon) => polygon.forEach((ring) => ring.forEach(visit)));
      break;
    case "GeometryCollection":
      geometry.geometries.forEach((g) => eachPosition(g, visit));
      break;
  }
}

/** The box around some features, or null if none of them has geometry. */
export function featuresBbox(features: AnyFeature[]): Bbox | null {
  const box: Bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const feature of features) {
    if (!feature.geometry) continue;
    eachPosition(feature.geometry, ([x, y]) => {
      box[0] = Math.min(box[0], x);
      box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x);
      box[3] = Math.max(box[3], y);
    });
  }
  return box[0] === Infinity ? null : box;
}

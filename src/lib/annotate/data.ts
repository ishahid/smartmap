/**
 * Pure helpers for annotation features: building a layer's data from them,
 * reading them back from project files, copy/paste, and merging edits made in
 * terra-draw. No Svelte, map or terra-draw here, so it's all easy to test.
 */
import type { Geometry, Position } from "geojson";
import type { LayerData } from "../api";
import { featureLabel, featuresBbox, type AnyFeature } from "../features";
import { POINT_SHAPES } from "../style/types";
import {
  ANNOTATION_FIELDS,
  ANNOTATION_KINDS,
  type AnnotationFeature,
  type AnnotationGeometry,
  type AnnotationKind,
  type AnnotationProperties,
} from "./types";

/** A fresh id for a new annotation. */
export const newId = () => crypto.randomUUID();

/** Default properties for a newly drawn annotation. */
export function newProperties(kind: AnnotationKind): AnnotationProperties {
  const properties: AnnotationProperties = { kind, name: "", description: "" };
  if (kind === "text") properties.text = "Text";
  return properties;
}

/** The kind that suits a geometry, for features pasted from data layers or old files. */
export function kindForGeometry(geometry: AnnotationGeometry): AnnotationKind {
  return geometry.type === "Point" ? "point" : geometry.type === "LineString" ? "line" : "polygon";
}

/**
 * The LayerData for an annotation layer, so the rest of the app (map, table,
 * identify, search) can treat it like any other layer. Features get numeric
 * ids by position, like everywhere else; the UUIDs stay in `annotations`.
 */
export function annotationLayerData(name: string, features: AnnotationFeature[]): LayerData {
  return {
    name,
    path: "",
    table: null,
    format: "Annotations",
    // "Mixed" so the style editor offers every control: any kind can be drawn.
    geometryType: "Mixed",
    featureCount: features.length,
    emptyGeometries: 0,
    bbox: featuresBbox(features),
    fields: [...ANNOTATION_FIELDS],
    crs: "EPSG:4326",
    reprojected: false,
    warnings: [],
    geojson: {
      type: "FeatureCollection",
      features: features.map((feature, index) => ({ ...feature, id: index })),
    },
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** True for a usable [x, y] position. */
const isPosition = (p: unknown): p is Position =>
  Array.isArray(p) && p.length >= 2 && p.every((n) => typeof n === "number" && Number.isFinite(n));

/** Checks a geometry is one annotations support and its coordinates are numbers. */
function asGeometry(value: unknown): AnnotationGeometry | null {
  if (!isRecord(value)) return null;
  const { type, coordinates } = value;
  if (type === "Point" && isPosition(coordinates)) return { type, coordinates };
  if (type === "LineString" && Array.isArray(coordinates) && coordinates.length >= 2 && coordinates.every(isPosition)) {
    return { type, coordinates };
  }
  if (
    type === "Polygon" &&
    Array.isArray(coordinates) &&
    coordinates.length >= 1 &&
    coordinates.every((ring) => Array.isArray(ring) && ring.length >= 4 && ring.every(isPosition))
  ) {
    return { type, coordinates: coordinates as Position[][] };
  }
  return null;
}

/** Keeps the known properties with the right types, dropping anything else. */
function asProperties(value: unknown, geometry: AnnotationGeometry): AnnotationProperties {
  const p = isRecord(value) ? value : {};
  const kind = ANNOTATION_KINDS.includes(p.kind as AnnotationKind) ? (p.kind as AnnotationKind) : kindForGeometry(geometry);
  const properties: AnnotationProperties = {
    kind,
    name: typeof p.name === "string" ? p.name : "",
    description: typeof p.description === "string" ? p.description : "",
  };
  if (typeof p.text === "string") properties.text = p.text;
  for (const key of ["color", "strokeColor"] as const) {
    if (typeof p[key] === "string") properties[key] = p[key];
  }
  for (const key of ["width", "fillOpacity", "size"] as const) {
    if (typeof p[key] === "number" && Number.isFinite(p[key])) properties[key] = p[key];
  }
  if (POINT_SHAPES.includes(p.shape as never)) properties.shape = p.shape as AnnotationProperties["shape"];
  return properties;
}

/**
 * Rebuilds annotations from a project file's FeatureCollection, skipping
 * anything malformed. Features keep their ids when they have one.
 */
export function restoreAnnotations(saved: unknown): AnnotationFeature[] {
  if (!isRecord(saved) || !Array.isArray(saved.features)) return [];
  const result: AnnotationFeature[] = [];
  const seen = new Set<string>();
  for (const item of saved.features) {
    if (!isRecord(item)) continue;
    const geometry = asGeometry(item.geometry);
    if (!geometry) continue;
    const id = typeof item.id === "string" && !seen.has(item.id) ? item.id : newId();
    seen.add(id);
    result.push({ type: "Feature", id, geometry, properties: asProperties(item.properties, geometry) });
  }
  return result;
}

/** Splits multi-part geometries into single parts; drops empty ones and collections. */
function singleParts(geometry: Geometry | null): AnnotationGeometry[] {
  if (!geometry) return [];
  switch (geometry.type) {
    case "Point":
    case "LineString":
    case "Polygon":
      return [geometry];
    case "MultiPoint":
      return geometry.coordinates.map((coordinates) => ({ type: "Point", coordinates }));
    case "MultiLineString":
      return geometry.coordinates.map((coordinates) => ({ type: "LineString", coordinates }));
    case "MultiPolygon":
      return geometry.coordinates.map((coordinates) => ({ type: "Polygon", coordinates }));
    default:
      return [];
  }
}

/**
 * Turns features copied from a data layer into annotations: multi-part shapes
 * become several annotations, each named after the original feature.
 */
export function annotationsFromFeatures(features: AnyFeature[], fields: string[]): AnnotationFeature[] {
  return features.flatMap((feature) =>
    singleParts(feature.geometry).map((geometry) => ({
      type: "Feature" as const,
      id: newId(),
      geometry,
      properties: { ...newProperties(kindForGeometry(geometry)), name: featureLabel(feature, fields) },
    })),
  );
}

/** Copies of annotations with new ids (for paste and duplicate). */
export function withNewIds(features: AnnotationFeature[]): AnnotationFeature[] {
  return features.map((feature) => ({ ...structuredClone(feature), id: newId() }));
}

/** Moves every coordinate by dx, dy degrees (duplicate puts the copy beside the original). */
export function offset(features: AnnotationFeature[], dx: number, dy: number): AnnotationFeature[] {
  const move = ([x, y, ...rest]: Position): Position => [x + dx, y + dy, ...rest];
  return features.map((feature) => {
    const g = feature.geometry;
    const geometry: AnnotationGeometry =
      g.type === "Point"
        ? { type: "Point", coordinates: move(g.coordinates) }
        : g.type === "LineString"
          ? { type: "LineString", coordinates: g.coordinates.map(move) }
          : { type: "Polygon", coordinates: g.coordinates.map((ring) => ring.map(move)) };
    return { ...feature, geometry };
  });
}

/** A feature as terra-draw holds it: the parts the merge needs. */
export interface EditedFeature {
  id: string;
  geometry: AnnotationGeometry;
  /** terra-draw's mode name, which for a new feature is the tool it was drawn with. */
  mode: string;
}

/** The annotation kind for a terra-draw mode (tool) name. */
export function kindForMode(mode: string): AnnotationKind {
  if (mode === "linestring") return "line";
  return ANNOTATION_KINDS.includes(mode as AnnotationKind) ? (mode as AnnotationKind) : "polygon";
}

/**
 * Applies what terra-draw holds to the layer's features:
 * - features terra-draw has get its geometry (they may have moved);
 * - features in `kept` stay as they are (terra-draw couldn't load them);
 * - other old features were deleted in terra-draw, so they go;
 * - features only terra-draw has are new and are added at the end.
 * Properties (name, style, ...) always come from the layer, as terra-draw only edits shapes.
 */
export function mergeEdits(
  previous: AnnotationFeature[],
  edited: EditedFeature[],
  kept: ReadonlySet<string>,
): AnnotationFeature[] {
  const byId = new Map(edited.map((e) => [e.id, e]));
  const result: AnnotationFeature[] = [];
  for (const feature of previous) {
    const e = byId.get(feature.id);
    if (e) {
      result.push({ ...feature, geometry: e.geometry });
      byId.delete(feature.id);
    } else if (kept.has(feature.id)) {
      result.push(feature);
    }
  }
  for (const e of byId.values()) {
    result.push({ type: "Feature", id: e.id, geometry: e.geometry, properties: newProperties(kindForMode(e.mode)) });
  }
  return result;
}

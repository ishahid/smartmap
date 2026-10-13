/**
 * Annotations: shapes and text the user draws on the map (the 2004 app's
 * "cosmetic layer"). They live in annotation layers, which sit in the layer
 * list like data layers, show in the attribute table, and are saved inside
 * the project file.
 */
import type { Feature, LineString, Point, Polygon } from "geojson";
import type { PointShape } from "../style/types";

/** What was drawn. Kept in the feature's properties, so it survives editing and saving. */
export const ANNOTATION_KINDS = ["point", "marker", "text", "line", "polygon", "rectangle", "circle", "freehand"] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

export interface AnnotationProperties {
  kind: AnnotationKind;
  name: string;
  description: string;
  /** The words shown by a text annotation. */
  text?: string;

  // Style overrides for this feature. Missing ones use the layer's style.
  /** Fill colour of shapes, colour of lines, markers, points and text. */
  color?: string;
  /** Outline colour of shapes, points and markers. */
  strokeColor?: string;
  /** Line width, or outline width for shapes, in pixels. */
  width?: number;
  /** Fill opacity of shapes, 0–1. */
  fillOpacity?: number;
  /** Point radius, marker radius or text size, in pixels. */
  size?: number;
  /** Marker shape. */
  shape?: PointShape;
}

/** Annotations are single points, lines and polygons (multi-part shapes are split when pasted). */
export type AnnotationGeometry = Point | LineString | Polygon;

/**
 * One annotation. Unlike data-layer features, its `id` is a stable UUID
 * (terra-draw tracks features by it while editing). The layer's LayerData
 * still numbers features by position, like every other layer.
 */
export interface AnnotationFeature extends Feature<AnnotationGeometry, AnnotationProperties> {
  id: string;
}

/** The attribute-table columns of an annotation layer. Style overrides are left out. */
export const ANNOTATION_FIELDS = ["name", "description", "kind", "text"];

/** The style properties a feature can override (see AnnotationProperties). */
export const STYLE_OVERRIDES = ["color", "strokeColor", "width", "fillOpacity", "size", "shape"] as const;

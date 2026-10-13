/**
 * How a layer is drawn. Plain data (no functions), so it can be saved in a
 * project file later (step 5) and compared with JSON.stringify.
 */

/** Marker shapes for point features. */
export const POINT_SHAPES = ["circle", "square", "triangle", "diamond", "star"] as const;
export type PointShape = (typeof POINT_SHAPES)[number];

/**
 * - single: every feature looks the same
 * - categorized: a colour per distinct value of an attribute (e.g. land-use type)
 * - graduated: a colour ramp over numeric ranges of an attribute (e.g. population)
 */
export type StyleKind = "single" | "categorized" | "graduated";

/** One colour in a categorized style. `value` is the attribute value as text. */
export interface Category {
  value: string;
  color: string;
}

/** One range in a graduated style: features with min <= value < max (the last class includes max). */
export interface GradClass {
  min: number;
  max: number;
  color: string;
}

export type ClassMethod = "equal" | "quantile";

export interface LabelStyle {
  /** Attribute to show as a label, or null for no labels. */
  field: string | null;
  size: number;
  color: string;
}

export interface LayerStyle {
  kind: StyleKind;
  /** Fill colour for polygons, line colour for lines, marker colour for points (single style). */
  color: string;
  /** Polygon fill opacity, 0–1. Layer opacity multiplies this. */
  fillOpacity: number;
  /** Outline colour of polygons and point markers. */
  strokeColor: string;
  /** Outline width of polygons and point markers, in pixels (0 = no outline). */
  strokeWidth: number;
  /** Width of line features, in pixels. */
  lineWidth: number;
  /** Marker radius in pixels. */
  pointSize: number;
  pointShape: PointShape;

  /** Attribute used by categorized and graduated styles. */
  field: string | null;
  categories: Category[];
  /** Colour for values not in `categories` (or missing). */
  otherColor: string;
  classes: GradClass[];
  ramp: string;
  method: ClassMethod;
  classCount: number;

  label: LabelStyle;
}

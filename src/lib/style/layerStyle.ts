/**
 * Turns a data layer and its LayerStyle into MapLibre style layers.
 *
 * MapLibre draws a GeoJSON "source" through one or more style "layers", each of
 * which draws one kind of thing (fills, lines, circles, icons or text). One data
 * file can contain mixed geometry, so we add a layer for each kind and let
 * filters pick which features each one draws.
 *
 * Colours that depend on attributes (categorized and graduated styles) become
 * MapLibre *expressions*: small JSON programs MapLibre evaluates per feature.
 * See https://maplibre.org/maplibre-style-spec/expressions/
 */
// Type-only import: these describe MapLibre's style JSON and add no code.
import type {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
} from "@maplibre/maplibre-gl-style-spec";
import { colorForIndex, darken, mix } from "./colors";
import { SHAPE_SCREEN_RADIUS, shapeImageId } from "./shapes";
import type { LayerStyle } from "./types";

/** What styleLayersFor needs to know about a layer. */
export interface StyledLayer {
  id: string;
  style: LayerStyle;
  /** 0–1, multiplies every opacity in the style. */
  opacity: number;
  visible: boolean;
  /** Only draw features matching this (from filterExpression in lib/filter.ts), or null for all. */
  filter?: FilterSpecification | null;
  /**
   * True for annotation layers, whose features can override the layer style
   * one by one and come in kinds (point, marker, text...). See annotationLayersFor.
   */
  annotation?: boolean;
}

/** The style a newly opened layer gets: a single colour from the palette. */
export function defaultStyle(index: number): LayerStyle {
  const color = colorForIndex(index);
  return {
    kind: "single",
    color,
    fillOpacity: 0.35,
    strokeColor: darken(color),
    strokeWidth: 1,
    lineWidth: 1.5,
    pointSize: 4,
    pointShape: "circle",
    field: null,
    categories: [],
    otherColor: "#bbbbbb",
    classes: [],
    ramp: "YlOrRd",
    method: "quantile",
    classCount: 5,
    label: { field: null, size: 12, color: "#222222" },
  };
}

/** Source id for a layer. Kept in one place so adding and removing agree. */
export function sourceId(layerId: string): string {
  return `sm-${layerId}`;
}

/** The layer id a source belongs to (the reverse of sourceId), or null for other sources (the basemap's). */
export function layerIdFromSource(source: string): string | null {
  return source.startsWith("sm-") ? source.slice(3) : null;
}

/** Fonts served by OpenFreeMap's glyph server (the basemap styles point MapLibre there). */
const LABEL_FONT = ["Noto Sans Regular"];

// `geometry-type` reports "Polygon" or "MultiPolygon" (and so on); match both.
const isPolygon: FilterSpecification = ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]];
const isLine: FilterSpecification = ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]];
const isPoint: FilterSpecification = ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]];
const isPointOrPolygon: FilterSpecification = ["!", isLine];

/** A filter that matches only when all `parts` match. */
const allOf = (...parts: FilterSpecification[]): FilterSpecification => ["all", ...parts] as FilterSpecification;

/**
 * The colour of each feature: a plain colour for single styles, or an
 * expression that looks at the feature's attribute.
 */
export function colorExpression(style: LayerStyle): DataDrivenPropertyValueSpecification<string> {
  const field = style.field;
  if (style.kind === "categorized" && field && style.categories.length > 0) {
    // ["match", input, label1, output1, label2, output2, ..., fallback]
    const pairs = style.categories.flatMap((c) => [c.value, c.color]);
    // TypeScript can't check expressions built with `...`, hence the `as unknown as`.
    return ["match", ["to-string", ["get", field]], ...pairs, style.otherColor] as unknown as ExpressionSpecification;
  }
  if (style.kind === "graduated" && field && style.classes.length > 0) {
    // ["step", input, colour0, edge1, colour1, edge2, colour2, ...]: colour_n applies from edge_n up.
    const steps = style.classes.slice(1).flatMap((c) => [c.min, c.color]);
    const step = ["step", ["get", field], style.classes[0].color, ...steps] as unknown as ExpressionSpecification;
    // Features with no number (blank or text) get the "other" colour.
    return ["case", ["==", ["typeof", ["get", field]], "number"], step, style.otherColor];
  }
  return style.color;
}

/** White halo behind dark text, dark halo behind light text, so labels read on any basemap. */
function haloFor(color: string): string {
  const n = parseInt(color.slice(1), 16);
  const luminance = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return luminance > 140 ? mix(color, "#000000", 0.85) : "#ffffff";
}

/** The MapLibre style layers that draw one data layer, bottom to top. */
export function styleLayersFor(layer: StyledLayer): LayerSpecification[] {
  if (layer.annotation) return annotationLayersFor(layer);
  const { style, opacity } = layer;
  const source = sourceId(layer.id);
  const color = colorExpression(style);
  const visibility = layer.visible ? "visible" : "none";
  // Each style layer already filters by geometry type; a user filter is added on top.
  const userFilter = layer.filter ?? null;
  const only = (geometry: FilterSpecification): FilterSpecification =>
    userFilter ? allOf(geometry, userFilter) : geometry;

  const layers: LayerSpecification[] = [
    {
      id: `${source}-fill`,
      type: "fill",
      source,
      filter: only(isPolygon),
      layout: { visibility },
      paint: { "fill-color": color, "fill-opacity": style.fillOpacity * opacity },
    },
    {
      id: `${source}-outline`,
      type: "line",
      source,
      filter: only(isPolygon),
      layout: { visibility },
      paint: { "line-color": style.strokeColor, "line-width": style.strokeWidth, "line-opacity": opacity },
    },
    {
      id: `${source}-line`,
      type: "line",
      source,
      filter: only(isLine),
      layout: { visibility, "line-cap": "round", "line-join": "round" },
      paint: { "line-color": color, "line-width": style.lineWidth, "line-opacity": opacity },
    },
  ];

  // Circle and icon markers get different ids on purpose. MapLibre caches each
  // layer's processed tile data by id; re-adding an id as a different layer type
  // makes its symbol placement read stale circle data and crash.
  if (style.pointShape === "circle") {
    layers.push({
      id: `${source}-point-circle`,
      type: "circle",
      source,
      filter: only(isPoint),
      layout: { visibility },
      paint: {
        "circle-color": color,
        "circle-radius": style.pointSize,
        "circle-stroke-color": style.strokeColor,
        "circle-stroke-width": style.strokeWidth,
        "circle-opacity": opacity,
        "circle-stroke-opacity": opacity,
      },
    });
  } else {
    // Other shapes are SDF images (see shapes.ts); MapView adds them on demand.
    layers.push({
      id: `${source}-point-icon`,
      type: "symbol",
      source,
      filter: only(isPoint),
      layout: {
        visibility,
        "icon-image": shapeImageId(style.pointShape),
        "icon-size": style.pointSize / SHAPE_SCREEN_RADIUS,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {
        "icon-color": color,
        "icon-halo-color": style.strokeColor,
        "icon-halo-width": style.strokeWidth,
        "icon-opacity": opacity,
      },
    });
  }

  const labelField = style.label.field;
  if (labelField) {
    const text: ExpressionSpecification = ["to-string", ["get", labelField]];
    const paint = {
      "text-color": style.label.color,
      "text-halo-color": haloFor(style.label.color),
      "text-halo-width": 1.5,
      "text-opacity": opacity,
    };
    // Points and polygons get a label beside the marker / in the middle...
    layers.push({
      id: `${source}-label`,
      type: "symbol",
      source,
      filter: only(isPointOrPolygon),
      layout: {
        visibility,
        "text-field": text,
        "text-font": LABEL_FONT,
        "text-size": style.label.size,
        // Try below, above, right, then left of the point, whichever has room.
        "text-variable-anchor": ["top", "bottom", "left", "right"],
        "text-radial-offset": style.pointSize / style.label.size + 0.4,
      },
      paint,
    });
    // ...and lines get theirs along the line.
    layers.push({
      id: `${source}-label-line`,
      type: "symbol",
      source,
      filter: only(isLine),
      layout: {
        visibility,
        "text-field": text,
        "text-font": LABEL_FONT,
        "text-size": style.label.size,
        "symbol-placement": "line",
      },
      paint,
    });
  }

  return layers;
}

// --- Selection highlight -----------------------------------------------------

/** Colour of selected features. Bright cyan stands out on all three basemaps. */
export const SELECTION_COLOR = "#00b4ff";

/** Ids of the selection highlight layers all start with this. */
export const SELECTION_PREFIX = "selection-";

/**
 * Style layers that outline the selected features of one data layer, drawn on
 * top of everything. They use the data layer's source and pick the features by
 * id, so the data isn't copied.
 */
export function selectionLayersFor(layerId: string, featureIds: number[]): LayerSpecification[] {
  if (featureIds.length === 0) return [];
  const source = sourceId(layerId);
  const selected: FilterSpecification = ["in", ["id"], ["literal", featureIds]];
  const notPoint = ["!", isPoint] as FilterSpecification;
  return [
    {
      id: `${SELECTION_PREFIX}fill`,
      type: "fill",
      source,
      filter: allOf(isPolygon, selected),
      paint: { "fill-color": SELECTION_COLOR, "fill-opacity": 0.25 },
    },
    {
      // A white edge under the coloured line keeps it visible on any background.
      id: `${SELECTION_PREFIX}casing`,
      type: "line",
      source,
      filter: allOf(notPoint, selected),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 5 },
    },
    {
      id: `${SELECTION_PREFIX}line`,
      type: "line",
      source,
      filter: allOf(notPoint, selected),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": SELECTION_COLOR, "line-width": 2.5 },
    },
    {
      id: `${SELECTION_PREFIX}point`,
      type: "circle",
      source,
      filter: allOf(isPoint, selected),
      paint: {
        "circle-radius": 9,
        "circle-color": "rgba(0, 0, 0, 0)",
        "circle-stroke-color": SELECTION_COLOR,
        "circle-stroke-width": 3,
      },
    },
  ];
}

// --- Annotation layers -------------------------------------------------------

/**
 * A feature's own value for a style setting, or the layer's when it has none.
 * `["get", …]` gives null for a missing property and "coalesce" takes the
 * first non-null value.
 */
function own(property: string, layerValue: string | number): ExpressionSpecification {
  return ["coalesce", ["get", property], layerValue];
}

/** Matches annotations of one kind (see lib/annotate/types.ts). */
const kindIs = (kind: string): FilterSpecification => ["==", ["get", "kind"], kind];

/**
 * The MapLibre style layers for an annotation layer. Like styleLayersFor, but
 * every colour, width and size can be overridden per feature (properties
 * `color`, `strokeColor`, `width`, `fillOpacity`, `size`, `shape`), and point
 * features come in three kinds: plain points (circles), markers (shape icons)
 * and text. The layer ids and types never change, so edits never need a rebuild.
 */
export function annotationLayersFor(layer: StyledLayer): LayerSpecification[] {
  const { style, opacity } = layer;
  const source = sourceId(layer.id);
  const visibility = layer.visible ? "visible" : "none";
  const userFilter = layer.filter ?? null;
  const only = (...parts: FilterSpecification[]): FilterSpecification =>
    allOf(...parts, ...(userFilter ? [userFilter] : []));
  const color = own("color", style.color);
  const strokeColor = own("strokeColor", style.strokeColor);

  const layers: LayerSpecification[] = [
    {
      id: `${source}-fill`,
      type: "fill",
      source,
      filter: only(isPolygon),
      layout: { visibility },
      paint: { "fill-color": color, "fill-opacity": ["*", own("fillOpacity", style.fillOpacity), opacity] },
    },
    {
      id: `${source}-outline`,
      type: "line",
      source,
      filter: only(isPolygon),
      layout: { visibility, "line-join": "round" },
      paint: { "line-color": strokeColor, "line-width": own("width", style.strokeWidth), "line-opacity": opacity },
    },
    {
      id: `${source}-line`,
      type: "line",
      source,
      filter: only(isLine),
      layout: { visibility, "line-cap": "round", "line-join": "round" },
      paint: { "line-color": color, "line-width": own("width", style.lineWidth), "line-opacity": opacity },
    },
    {
      id: `${source}-point-circle`,
      type: "circle",
      source,
      filter: only(isPoint, kindIs("point")),
      layout: { visibility },
      paint: {
        "circle-color": color,
        "circle-radius": own("size", style.pointSize),
        "circle-stroke-color": strokeColor,
        "circle-stroke-width": style.strokeWidth,
        "circle-opacity": opacity,
        "circle-stroke-opacity": opacity,
      },
    },
    {
      id: `${source}-marker`,
      type: "symbol",
      source,
      filter: only(isPoint, kindIs("marker")),
      layout: {
        visibility,
        // Markers default to a star; MapView makes the shape images on demand.
        "icon-image": ["concat", "sm-shape-", own("shape", "star")],
        "icon-size": ["/", own("size", Math.max(style.pointSize, 8)), SHAPE_SCREEN_RADIUS],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {
        "icon-color": color,
        "icon-halo-color": strokeColor,
        "icon-halo-width": style.strokeWidth,
        "icon-opacity": opacity,
      },
    },
    {
      id: `${source}-text`,
      type: "symbol",
      source,
      filter: only(isPoint, kindIs("text")),
      layout: {
        visibility,
        "text-field": ["coalesce", ["get", "text"], ""],
        "text-font": LABEL_FONT,
        "text-size": own("size", style.label.size),
        // Text annotations are placed on purpose, so never hide them to avoid overlaps.
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": own("color", style.label.color),
        "text-halo-color": haloFor(style.label.color),
        "text-halo-width": 1.5,
        "text-opacity": opacity,
      },
    },
  ];

  // Labels from a field (usually "name"), as for data layers. Text annotations already show their text.
  const labelField = style.label.field;
  if (labelField) {
    const text: ExpressionSpecification = ["to-string", ["get", labelField]];
    const paint = {
      "text-color": style.label.color,
      "text-halo-color": haloFor(style.label.color),
      "text-halo-width": 1.5,
      "text-opacity": opacity,
    };
    layers.push({
      id: `${source}-label`,
      type: "symbol",
      source,
      filter: only(isPointOrPolygon, ["!=", ["get", "kind"], "text"]),
      layout: {
        visibility,
        "text-field": text,
        "text-font": LABEL_FONT,
        "text-size": style.label.size,
        "text-variable-anchor": ["top", "bottom", "left", "right"],
        "text-radial-offset": style.pointSize / style.label.size + 0.6,
      },
      paint,
    });
    layers.push({
      id: `${source}-label-line`,
      type: "symbol",
      source,
      filter: only(isLine),
      layout: { visibility, "text-field": text, "text-font": LABEL_FONT, "text-size": style.label.size, "symbol-placement": "line" },
      paint,
    });
  }
  return layers;
}

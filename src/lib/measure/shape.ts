/**
 * The shape being measured, as GeoJSON: what gets measured, and what gets
 * drawn on the map. Pure functions, so they're easy to test.
 */
import type { LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";

export type MeasureMode = "distance" | "area";

/**
 * The points to measure: the clicked points, plus the mouse position while
 * the shape is still being drawn, so the reading follows the mouse.
 */
function pointsWithCursor(points: Position[], cursor: Position | null): Position[] {
  return cursor ? [...points, cursor] : points;
}

/** The geometry to measure, or null when there aren't enough points yet. */
export function measuredGeometry(mode: MeasureMode, points: Position[], cursor: Position | null): Geometry | null {
  const all = pointsWithCursor(points, cursor);
  if (mode === "distance") return all.length >= 2 ? { type: "LineString", coordinates: all } : null;
  // A polygon needs three corners; the ring ends where it starts.
  return all.length >= 3 ? { type: "Polygon", coordinates: [[...all, all[0]]] } : null;
}

/** What to draw: the area (if any), the line along the edges, and a dot per clicked point. */
export function measureFeatures(mode: MeasureMode, points: Position[], cursor: Position | null): FeatureCollection {
  const features: Feature[] = [];
  const geometry = measuredGeometry(mode, points, cursor);
  if (geometry?.type === "Polygon") {
    features.push({ type: "Feature", properties: { part: "area" }, geometry });
    features.push({ type: "Feature", properties: { part: "edge" }, geometry: { type: "LineString", coordinates: geometry.coordinates[0] } });
  } else if (geometry) {
    features.push({ type: "Feature", properties: { part: "edge" }, geometry });
  } else if (points.length === 2 && mode === "area" && !cursor) {
    // Two clicks in area mode: still show the first edge.
    features.push({ type: "Feature", properties: { part: "edge" }, geometry: { type: "LineString", coordinates: points } });
  }
  for (const coordinates of points) {
    features.push({ type: "Feature", properties: { part: "vertex" }, geometry: { type: "Point", coordinates } });
  }
  return { type: "FeatureCollection", features };
}

/** Source and layer ids. MapView keeps layers starting with "measure-" on top. */
export const MEASURE_SOURCE = "measure";
const COLOR = "#e8590c";

/** The map layers that draw the measured shape: a light fill, a dashed edge, white dots. */
export const MEASURE_LAYERS: LayerSpecification[] = [
  {
    id: "measure-area",
    type: "fill",
    source: MEASURE_SOURCE,
    filter: ["==", ["get", "part"], "area"],
    paint: { "fill-color": COLOR, "fill-opacity": 0.15 },
  },
  {
    id: "measure-edge",
    type: "line",
    source: MEASURE_SOURCE,
    filter: ["==", ["get", "part"], "edge"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": COLOR, "line-width": 2.5, "line-dasharray": [2, 1.5] },
  },
  {
    id: "measure-vertex",
    type: "circle",
    source: MEASURE_SOURCE,
    filter: ["==", ["get", "part"], "vertex"],
    paint: { "circle-radius": 4, "circle-color": "#ffffff", "circle-stroke-color": COLOR, "circle-stroke-width": 2 },
  },
];

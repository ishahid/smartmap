/**
 * Turns a loaded data layer into MapLibre style layers.
 *
 * MapLibre draws a GeoJSON "source" through one or more style "layers", each of
 * which draws one kind of thing (fills, lines or circles). One data file can
 * contain mixed geometry, so we add all three and let filters pick what each draws.
 */
import type { FilterSpecification, LayerSpecification } from "./maplibre";

/** Colours handed out to layers in turn. Picked to show up on light basemaps. */
export const LAYER_COLORS = ["#e4572e", "#2e86ab", "#57a773", "#f3a712", "#8e5572", "#29335c", "#a8c256", "#d81159"];

/** Picks a colour for the n-th layer opened. */
export function colorForIndex(index: number): string {
  return LAYER_COLORS[index % LAYER_COLORS.length];
}

/** Source id for a layer. Kept in one place so adding and removing agree. */
export function sourceId(layerId: string): string {
  return `sm-${layerId}`;
}

// `geometry-type` reports "Polygon" or "MultiPolygon" (and so on); match both.
const isPolygon: FilterSpecification = ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]];
const isLine: FilterSpecification = ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]];
const isPoint: FilterSpecification = ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]];

/** The MapLibre style layers that draw one data layer, bottom to top. */
export function styleLayersFor(layerId: string, color: string): LayerSpecification[] {
  const source = sourceId(layerId);
  return [
    {
      id: `${source}-fill`,
      type: "fill",
      source,
      filter: isPolygon,
      paint: { "fill-color": color, "fill-opacity": 0.35 },
    },
    {
      id: `${source}-outline`,
      type: "line",
      source,
      filter: isPolygon,
      paint: { "line-color": color, "line-width": 1 },
    },
    {
      id: `${source}-line`,
      type: "line",
      source,
      filter: isLine,
      paint: { "line-color": color, "line-width": 1.5 },
    },
    {
      id: `${source}-point`,
      type: "circle",
      source,
      filter: isPoint,
      paint: {
        "circle-color": color,
        "circle-radius": 4,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1,
      },
    },
  ];
}

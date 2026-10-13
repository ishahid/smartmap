/**
 * Search: find features whose attributes contain some text, across the
 * visible layers. Features hidden by a layer's filter are skipped, so results
 * match what's on the map.
 */
import { featureLabel, numericFieldsOf, toText } from "../features";
import { filterPredicate } from "../filter";
import type { MapLayer } from "../map/types";

export interface SearchHit {
  layerId: string;
  layerName: string;
  featureId: number;
  /** The feature's name (featureLabel). */
  label: string;
  /** The first attribute that matched, e.g. "CNTRY_NAME: Pakistan". */
  match: string;
}

export interface SearchResult {
  hits: SearchHit[];
  /** True when there were more matches than `limit`. */
  truncated: boolean;
}

/**
 * Finds features with any attribute containing `query` (any case), top layer
 * first, at most `limit` of them. `layers` is bottom first, as in LayerList.
 */
export function searchLayers(layers: MapLayer[], query: string, limit = 100): SearchResult {
  const needle = query.trim().toLowerCase();
  const hits: SearchHit[] = [];
  if (needle === "") return { hits, truncated: false };

  for (const layer of [...layers].reverse()) {
    if (!layer.visible) continue;
    const { fields, geojson } = layer.data;
    const keep = filterPredicate(layer.filter, numericFieldsOf(layer.data));
    for (const [featureId, feature] of geojson.features.entries()) {
      if (!keep(feature.properties)) continue;
      const field = fields.find((f) => toText(feature.properties?.[f]).toLowerCase().includes(needle));
      if (field === undefined) continue;
      if (hits.length === limit) return { hits, truncated: true };
      hits.push({
        layerId: layer.id,
        layerName: layer.name,
        featureId,
        label: featureLabel(feature, fields),
        match: `${field}: ${toText(feature.properties?.[field])}`,
      });
    }
  }
  return { hits, truncated: false };
}

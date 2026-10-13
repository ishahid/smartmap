/**
 * The one-line status-bar note shown after a layer loads.
 */
import type { LayerData } from "../api";

type Summary = Pick<LayerData, "name" | "format" | "featureCount" | "emptyGeometries" | "crs" | "reprojected" | "warnings">;

/** E.g. "Loaded roads (GeoPackage): 1,204 features, converted from EPSG:32643". */
export function describeLayer(layer: Summary): string {
  let note = `Loaded ${layer.name} (${layer.format}): ${layer.featureCount.toLocaleString("en")} features`;
  if (layer.emptyGeometries > 0) note += ` (${layer.emptyGeometries.toLocaleString("en")} without geometry)`;
  if (layer.reprojected) note += `, converted from ${layer.crs}`;
  for (const warning of layer.warnings) note += `. Warning: ${warning}`;
  return note;
}

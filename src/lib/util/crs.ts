/**
 * Quick checks on a layer's coordinates. Real reprojection arrives in step 3;
 * until then we warn when a layer probably isn't in longitude/latitude.
 */
import type { LayerData } from "../api";

/** Returns a warning to show the user, or null if the layer looks like plain lon/lat. */
export function coordinateWarning(layer: Pick<LayerData, "crsWkt" | "bbox">): string | null {
  const wkt = layer.crsWkt?.trim().toUpperCase() ?? "";
  if (wkt.startsWith("PROJCS") || wkt.startsWith("PROJCRS")) {
    return "uses projected coordinates, which SmartMap can't reproject yet, so it may appear in the wrong place";
  }
  if (layer.bbox) {
    const [minX, minY, maxX, maxY] = layer.bbox;
    const looksLikeDegrees = minX >= -180.5 && maxX <= 360.5 && minY >= -90.5 && maxY <= 90.5;
    if (!looksLikeDegrees) {
      return "has coordinates outside longitude/latitude range, so it may appear in the wrong place";
    }
  }
  return null;
}

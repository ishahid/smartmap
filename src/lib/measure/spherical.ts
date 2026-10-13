/**
 * A rough stand-in for the Rust measuring code, used only when the UI runs in
 * a plain browser (`npm run dev`), where Rust isn't available. It treats the
 * Earth as a sphere, so results are off by up to about 0.5%. The desktop app
 * always measures on the WGS84 ellipsoid in Rust (src-tauri/src/analysis.rs).
 */
import type { Geometry, Position } from "geojson";
import type { Measurement } from "../api";

/** Mean Earth radius in metres. */
const R = 6_371_008.8;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance between two positions (haversine formula). */
function distance([lng1, lat1]: Position, [lng2, lat2]: Position): number {
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const pathLength = (points: Position[]) => points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);

/** Area enclosed by a ring on the sphere, in m². */
function ringArea(ring: Position[]): number {
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[i + 1];
    total += rad(lng2 - lng1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((total * R * R) / 2);
}

export function sphericalMeasure(geometry: Geometry): Measurement {
  const none: Measurement = { length: 0, area: 0, perimeter: 0 };
  const polygon = (rings: Position[][]): Measurement => ({
    length: 0,
    area: Math.max(0, ringArea(rings[0]) - rings.slice(1).reduce((sum, r) => sum + ringArea(r), 0)),
    perimeter: rings.reduce((sum, r) => sum + pathLength(r), 0),
  });
  const add = (a: Measurement, b: Measurement): Measurement => ({
    length: a.length + b.length,
    area: a.area + b.area,
    perimeter: a.perimeter + b.perimeter,
  });
  switch (geometry.type) {
    case "LineString":
      return { ...none, length: pathLength(geometry.coordinates) };
    case "MultiLineString":
      return { ...none, length: geometry.coordinates.reduce((sum, l) => sum + pathLength(l), 0) };
    case "Polygon":
      return polygon(geometry.coordinates);
    case "MultiPolygon":
      return geometry.coordinates.map(polygon).reduce(add, none);
    case "GeometryCollection":
      return geometry.geometries.map(sphericalMeasure).reduce(add, none);
    default:
      return none;
  }
}

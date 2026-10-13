/**
 * Marker images for point shapes other than circles.
 *
 * MapLibre draws circles natively, but squares, triangles and so on have to be
 * images ("icons"). To let one image be drawn in any colour, with any outline,
 * we make it a *signed distance field* (SDF): each pixel stores how far it is
 * from the shape's edge instead of a colour. MapLibre then paints the inside
 * with `icon-color` and an outline with `icon-halo-color`/`icon-halo-width`.
 *
 * The distances are computed exactly from each shape's outline, so this needs
 * no canvas and can be unit-tested.
 */
import type { PointShape } from "./types";

/** Image size in pixels. Drawn at pixel ratio 2, so it covers 32 screen pixels. */
const SIZE = 64;
export const SHAPE_PIXEL_RATIO = 2;
/** Space around the shape for the outline, in image pixels. */
const BUFFER = 8;
/** Shape radius in image pixels. */
const RADIUS = SIZE / 2 - BUFFER;
/** Shape radius in screen pixels, used to scale icons to the chosen point size. */
export const SHAPE_SCREEN_RADIUS = RADIUS / SHAPE_PIXEL_RATIO;

/** MapLibre image id for a shape. */
export function shapeImageId(shape: PointShape): string {
  return `sm-shape-${shape}`;
}

/** The shape for an image id made by `shapeImageId`, or null for other ids. */
export function shapeFromImageId(id: string): PointShape | null {
  const match = /^sm-shape-(\w+)$/.exec(id);
  return match && match[1] in OUTLINES ? (match[1] as PointShape) : null;
}

type Point = [number, number];

/** Polygon from points on a circle of radius 1, starting at the top, going clockwise. */
function regular(count: number, innerRadius?: number): Point[] {
  const points: Point[] = [];
  const steps = innerRadius === undefined ? count : count * 2;
  for (let i = 0; i < steps; i++) {
    const r = innerRadius !== undefined && i % 2 === 1 ? innerRadius : 1;
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / steps;
    points.push([r * Math.cos(angle), r * Math.sin(angle)]);
  }
  return points;
}

/** Shape outlines in a -1..1 box (y points down, like image rows). Circle is handled separately. */
const OUTLINES: Record<PointShape, Point[]> = {
  circle: [],
  square: [
    [-0.82, -0.82],
    [0.82, -0.82],
    [0.82, 0.82],
    [-0.82, 0.82],
  ],
  // Nudged down so it looks centred (a triangle's area sits low).
  triangle: regular(3).map(([x, y]) => [x * 1.05, y * 1.05 + 0.15]),
  diamond: regular(4),
  star: regular(5, 0.45),
};

function distanceToSegment([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** True if the point is inside the polygon (ray casting). */
function inside([px, py]: Point, polygon: Point[]): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) result = !result;
  }
  return result;
}

/** Distance from a point to the shape's edge, in shape units: negative inside, positive outside. */
export function signedDistance(shape: PointShape, point: Point): number {
  if (shape === "circle") return Math.hypot(point[0], point[1]) - 1;
  const polygon = OUTLINES[shape];
  let nearest = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    nearest = Math.min(nearest, distanceToSegment(point, polygon[i], polygon[(i + 1) % polygon.length]));
  }
  return inside(point, polygon) ? -nearest : nearest;
}

/**
 * The SDF image for a shape, ready for `map.addImage(id, image, { sdf: true, pixelRatio })`.
 * Uses the same encoding as MapLibre's own glyphs: alpha 191 (0.75) is the edge,
 * higher is inside, and alpha falls to 0 at BUFFER pixels outside.
 */
export function shapeImage(shape: PointShape): { width: number; height: number; data: Uint8Array } {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // Pixel centre in shape units (the shape spans -1..1).
      const point: Point = [(x + 0.5 - SIZE / 2) / RADIUS, (y + 0.5 - SIZE / 2) / RADIUS];
      const distancePx = signedDistance(shape, point) * RADIUS;
      const alpha = 255 - 255 * (distancePx / BUFFER + 0.25);
      const offset = (y * SIZE + x) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = 255;
      data[offset + 3] = Math.max(0, Math.min(255, Math.round(alpha)));
    }
  }
  return { width: SIZE, height: SIZE, data };
}

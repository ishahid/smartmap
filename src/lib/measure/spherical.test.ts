import { describe, expect, it } from "vitest";
import { sphericalMeasure } from "./spherical";

// The browser fallback only needs to be close (it treats the Earth as a sphere);
// the Rust tests check the real, ellipsoidal numbers.
describe("sphericalMeasure", () => {
  it("is within half a percent of the ellipsoidal answers", () => {
    const london = sphericalMeasure({ type: "LineString", coordinates: [[-73.8, 40.6], [-0.5, 51.6]] });
    expect(Math.abs(london.length / 5_551_759.4 - 1)).toBeLessThan(0.005);
    const cell = sphericalMeasure({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] });
    expect(Math.abs(cell.area / 12_308_778_361 - 1)).toBeLessThan(0.005);
    expect(sphericalMeasure({ type: "Point", coordinates: [1, 2] })).toEqual({ length: 0, area: 0, perimeter: 0 });
  });
});

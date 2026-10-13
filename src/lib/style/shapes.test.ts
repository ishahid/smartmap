import { describe, expect, it } from "vitest";
import { shapeFromImageId, shapeImage, shapeImageId, signedDistance } from "./shapes";
import { POINT_SHAPES } from "./types";

describe("shapes", () => {
  it("round-trips image ids", () => {
    for (const shape of POINT_SHAPES) expect(shapeFromImageId(shapeImageId(shape))).toBe(shape);
    expect(shapeFromImageId("sm-shape-blob")).toBeNull();
    expect(shapeFromImageId("road-icon")).toBeNull();
  });

  it("measures signed distance: negative inside, positive outside", () => {
    for (const shape of POINT_SHAPES) {
      expect(signedDistance(shape, [0, 0])).toBeLessThan(0);
      expect(signedDistance(shape, [2, 2])).toBeGreaterThan(0);
    }
    expect(signedDistance("square", [0.82, 0])).toBeCloseTo(0);
    expect(signedDistance("circle", [0, -1])).toBeCloseTo(0);
  });

  it("encodes an SDF image: opaque inside, transparent in the corners", () => {
    const image = shapeImage("diamond");
    const alpha = (x: number, y: number) => image.data[(y * image.width + x) * 4 + 3];
    expect(image.data).toHaveLength(image.width * image.height * 4);
    expect(alpha(32, 32)).toBe(255);
    expect(alpha(0, 0)).toBe(0);
    // A pixel on the diamond's top point (radius 24 above the centre) sits near the 0.75 edge value.
    expect(Math.abs(alpha(31, 8) - 191)).toBeLessThan(30);
  });
});

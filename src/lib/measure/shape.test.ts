import { describe, expect, it } from "vitest";
import { measuredGeometry, measureFeatures } from "./shape";

describe("measure shape", () => {
  it("measures a line once there are two points, including the mouse", () => {
    expect(measuredGeometry("distance", [[0, 0]], null)).toBeNull();
    expect(measuredGeometry("distance", [[0, 0]], [1, 1])).toEqual({ type: "LineString", coordinates: [[0, 0], [1, 1]] });
  });

  it("measures an area once there are three corners, closing the ring", () => {
    expect(measuredGeometry("area", [[0, 0], [1, 0]], null)).toBeNull();
    expect(measuredGeometry("area", [[0, 0], [1, 0]], [1, 1])).toEqual({
      type: "Polygon",
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    });
  });

  it("draws the area, its edge and a dot per clicked point", () => {
    const parts = (mode: "distance" | "area", points: number[][], cursor: number[] | null) =>
      measureFeatures(mode, points, cursor).features.map((f) => f.properties?.part);
    expect(parts("area", [[0, 0], [1, 0], [1, 1]], null)).toEqual(["area", "edge", "vertex", "vertex", "vertex"]);
    expect(parts("distance", [[0, 0]], [1, 1])).toEqual(["edge", "vertex"]);
    expect(parts("area", [[0, 0], [1, 0]], null)).toEqual(["edge", "vertex", "vertex"]);
    expect(parts("distance", [], null)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import type { LayerData } from "./api";
import { featureLabel, featuresBbox, numericFieldsOf, toText, unionBbox, type AnyFeature } from "./features";

const point = (x: number, y: number, properties: Record<string, unknown> = {}, id = 0): AnyFeature => ({
  type: "Feature",
  id,
  properties,
  geometry: { type: "Point", coordinates: [x, y] },
});

describe("features", () => {
  it("shows values as text like MapLibre does", () => {
    expect(toText(null)).toBe("");
    expect(toText(undefined)).toBe("");
    expect(toText(12.5)).toBe("12.5");
    expect(toText(true)).toBe("true");
    expect(toText([1, 2])).toBe("[1,2]");
  });

  it("names features after a name-like field, then any text", () => {
    const fields = ["ID", "CODE", "CNTRY_NAME", "TITLE"];
    expect(featureLabel(point(0, 0, { ID: 1, CODE: "PK", CNTRY_NAME: "Pakistan", TITLE: "x" }), fields)).toBe("Pakistan");
    expect(featureLabel(point(0, 0, { ID: 1, CODE: "PK", CNTRY_NAME: "", TITLE: "Capital" }), fields)).toBe("Capital");
    expect(featureLabel(point(0, 0, { ID: 1, CODE: "PK" }), fields)).toBe("PK");
    expect(featureLabel(point(0, 0, { ID: 1 }, 7), fields)).toBe("Feature 7");
  });

  it("measures the box around features of any geometry", () => {
    const line: AnyFeature = {
      type: "Feature",
      properties: {},
      geometry: { type: "MultiLineString", coordinates: [[[-5, 2], [3, 9]], [[10, -1], [0, 0]]] },
    };
    const empty: AnyFeature = { type: "Feature", properties: {}, geometry: null };
    expect(featuresBbox([point(1, 1), line, empty])).toEqual([-5, -1, 10, 9]);
    expect(featuresBbox([empty])).toBeNull();
  });

  it("remembers numeric fields per layer", () => {
    const data = {
      fields: ["A", "B"],
      geojson: { type: "FeatureCollection", features: [point(0, 0, { A: 1, B: "x" }), point(0, 0, { A: null, B: 2 })] },
    } as unknown as LayerData;
    const first = numericFieldsOf(data);
    expect([...first]).toEqual(["A"]);
    expect(numericFieldsOf(data)).toBe(first);
  });
});

describe("unionBbox", () => {
  it("covers every box and skips missing ones", () => {
    expect(
      unionBbox([
        [0, 0, 10, 10],
        null,
        [-5, 2, 3, 20],
      ]),
    ).toEqual([-5, 0, 10, 20]);
    expect(unionBbox([null, undefined])).toBeNull();
    expect(unionBbox([])).toBeNull();
  });
});

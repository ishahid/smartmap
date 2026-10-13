import { describe, expect, it } from "vitest";
import { LAYER_COLORS, colorForIndex, sourceId, styleLayersFor } from "./layerStyle";

describe("colorForIndex", () => {
  it("cycles through the palette", () => {
    expect(colorForIndex(0)).toBe(LAYER_COLORS[0]);
    expect(colorForIndex(LAYER_COLORS.length)).toBe(LAYER_COLORS[0]);
    expect(colorForIndex(LAYER_COLORS.length + 2)).toBe(LAYER_COLORS[2]);
  });
});

describe("styleLayersFor", () => {
  const layers = styleLayersFor("abc", "#ff0000");

  it("draws fills, outlines, lines and points from the layer's source", () => {
    expect(layers.map((l) => l.type)).toEqual(["fill", "line", "line", "circle"]);
    for (const layer of layers) {
      expect("source" in layer && layer.source).toBe(sourceId("abc"));
    }
  });

  it("gives every style layer a unique id", () => {
    const ids = layers.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses the layer colour", () => {
    expect(JSON.stringify(layers)).toContain("#ff0000");
  });
});

import { describe, expect, it } from "vitest";
import { LAYER_COLORS, colorForIndex, darken, mix, rampColors, RAMPS } from "./colors";

describe("colours", () => {
  it("cycles through the layer palette", () => {
    expect(colorForIndex(0)).toBe(LAYER_COLORS[0]);
    expect(colorForIndex(LAYER_COLORS.length + 2)).toBe(LAYER_COLORS[2]);
  });

  it("mixes and darkens", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(darken("#ffffff", 1)).toBe("#000000");
  });

  it("spreads ramp colours from the first to the last stop", () => {
    const colors = rampColors("Blues", 3);
    expect(colors).toEqual([RAMPS.Blues[0], RAMPS.Blues[2], RAMPS.Blues[4]]);
    expect(rampColors("Blues", 9)).toHaveLength(9);
    expect(rampColors("no such ramp", 2)).toHaveLength(2);
  });
});

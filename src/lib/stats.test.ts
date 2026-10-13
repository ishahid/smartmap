import { describe, expect, it } from "vitest";
import { fieldStats, formatStat } from "./stats";

describe("fieldStats", () => {
  it("summarises the numbers and counts the rest as missing", () => {
    expect(fieldStats([4, null, 1, "x", 3, 2, undefined, ""])).toEqual({
      count: 4,
      missing: 4,
      min: 1,
      max: 4,
      mean: 2.5,
      median: 2.5,
      stdDev: Math.sqrt(1.25),
      sum: 10,
    });
    expect(fieldStats([5, 1, 9])?.median).toBe(5);
  });

  it("has nothing to say about text-only values", () => {
    expect(fieldStats(["a", null])).toBeNull();
    expect(fieldStats([])).toBeNull();
  });

  it("formats values readably", () => {
    expect(formatStat(1234567.891)).toBe("1,234,568");
    expect(formatStat(12.3456)).toBe("12.35");
    expect(formatStat(0.000123456)).toBe("0.0001");
  });
});

import { describe, expect, it } from "vitest";
import type { Feature, Geometry } from "geojson";
import { breaks, formatRange, makeClasses, numericFields, uniqueCategories } from "./classify";

const features = (rows: Record<string, unknown>[]): Feature<Geometry | null>[] =>
  rows.map((properties) => ({ type: "Feature", geometry: null, properties }));

describe("uniqueCategories", () => {
  it("lists values most common first, with blanks as empty text", () => {
    const data = features([{ t: "b" }, { t: "a" }, { t: "b" }, { t: null }, {}]);
    expect(uniqueCategories(data, "t").map((c) => c.value)).toEqual(["", "b", "a"]);
  });

  it("gives each category a different colour", () => {
    const colors = uniqueCategories(features([{ t: 1 }, { t: 2 }, { t: 3 }]), "t").map((c) => c.color);
    expect(new Set(colors).size).toBe(3);
  });
});

describe("numericFields", () => {
  it("keeps fields whose values are all numbers or blank", () => {
    const data = features([
      { pop: 5, name: "a", code: 1 },
      { pop: null, name: "b", code: "x" },
    ]);
    expect(numericFields(data, ["pop", "name", "code", "missing"])).toEqual(["pop"]);
  });
});

describe("breaks", () => {
  it("splits evenly for equal intervals", () => {
    expect(breaks([0, 10, 5, 2], 2, "equal")).toEqual([0, 5, 10]);
  });

  it("puts the same number of values in each quantile class", () => {
    expect(breaks([1, 2, 3, 4, 5, 6, 7, 8], 4, "quantile")).toEqual([1, 3, 5, 7, 8]);
  });

  it("copes with identical or no values", () => {
    expect(breaks([3, 3, 3], 5, "quantile")).toEqual([3, 3]);
    expect(breaks([], 5, "equal")).toEqual([]);
  });
});

describe("makeClasses", () => {
  it("builds ascending classes with ramp colours", () => {
    const data = features([{ v: 0 }, { v: 50 }, { v: 100 }, { v: "n/a" }]);
    const classes = makeClasses(data, "v", 2, "equal", "Blues");
    expect(classes.map((c) => [c.min, c.max])).toEqual([
      [0, 50],
      [50, 100],
    ]);
    expect(classes[0].color).not.toBe(classes[1].color);
  });
});

describe("formatRange", () => {
  it("rounds to a sensible precision", () => {
    expect(formatRange({ min: 1000, max: 2500.4, color: "" })).toBe("1,000 – 2,500");
    expect(formatRange({ min: 0.25, max: 0.5, color: "" })).toBe("0.25 – 0.5");
  });
});

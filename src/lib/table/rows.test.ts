import { describe, expect, it } from "vitest";
import type { AnyFeature } from "../features";
import { columnWidth, compareValues, nextSort, rowRange, tableRows, type RowOptions } from "./rows";

const feature = (properties: Record<string, unknown>): AnyFeature => ({ type: "Feature", properties, geometry: null });
const FEATURES = [
  feature({ NAME: "item 10", POP: 5 }),
  feature({ NAME: "Item 2", POP: null }),
  feature({ NAME: "apple", POP: 50 }),
  feature({ NAME: "", POP: 1 }),
];
const options = (more: Partial<RowOptions> = {}): RowOptions => ({ keep: () => true, searches: {}, sort: null, ...more });

describe("attribute table rows", () => {
  it("shows every row in file order by default", () => {
    expect(tableRows(FEATURES, options())).toEqual([0, 1, 2, 3]);
  });

  it("applies the layer filter and column searches", () => {
    const keep = (p: Record<string, unknown> | null) => p?.POP !== 50;
    expect(tableRows(FEATURES, options({ keep, searches: { NAME: " ITEM " } }))).toEqual([0, 1]);
  });

  it("sorts numbers by size and text naturally, with blanks last both ways", () => {
    expect(tableRows(FEATURES, options({ sort: { field: "POP", descending: false } }))).toEqual([3, 0, 2, 1]);
    expect(tableRows(FEATURES, options({ sort: { field: "POP", descending: true } }))).toEqual([2, 0, 3, 1]);
    expect(tableRows(FEATURES, options({ sort: { field: "NAME", descending: false } }))).toEqual([2, 1, 0, 3]);
    expect(tableRows(FEATURES, options({ sort: { field: "NAME", descending: true } }))).toEqual([0, 1, 2, 3]);
  });

  it("orders mixed values: numbers, then text, then blanks", () => {
    expect([null, "b", 3, "a", undefined, 1].sort(compareValues)).toEqual([1, 3, "a", "b", null, undefined]);
  });

  it("cycles the sort order on header clicks", () => {
    const asc = nextSort(null, "A");
    expect(asc).toEqual({ field: "A", descending: false });
    const desc = nextSort(asc, "A");
    expect(desc).toEqual({ field: "A", descending: true });
    expect(nextSort(desc, "A")).toBeNull();
    expect(nextSort(desc, "B")).toEqual({ field: "B", descending: false });
  });

  it("selects a range in display order", () => {
    expect(rowRange([4, 2, 9, 7], 9, 4)).toEqual([4, 2, 9]);
    expect(rowRange([4, 2], 5, 2)).toEqual([2]);
  });

  it("sizes columns to their content, within limits", () => {
    expect(columnWidth("ID", [feature({ ID: 1 })])).toBe(64);
    expect(columnWidth("NAME", [feature({ NAME: "x".repeat(100) })])).toBe(280);
  });
});

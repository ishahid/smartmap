import { featureFilter } from "@maplibre/maplibre-gl-style-spec";
import { describe, expect, it } from "vitest";
import {
  filterExpression,
  filterPredicate,
  isActive,
  isIncomplete,
  restoreFilter,
  type Condition,
  type LayerFilter,
} from "./filter";

/** Attribute rows covering numbers, text, blanks and missing values. */
const ROWS: Record<string, unknown>[] = [
  { NAME: "Lahore", POP: 11_000_000, TYPE: "City", CODE: "042" },
  { NAME: "lahore cantt", POP: 400_000, TYPE: "town", CODE: "42" },
  { NAME: "Murree", POP: 30_000, TYPE: "Town", CODE: null },
  { NAME: "", POP: null, TYPE: "village" },
  { NAME: "Gilgit", POP: 0, TYPE: "", CODE: "5811" },
  { POP: 1000 },
];
const NUMERIC = new Set(["POP"]);

const filterOf = (conditions: Condition[], match: "all" | "any" = "all"): LayerFilter => ({ match, conditions });
const c = (field: string, operator: Condition["operator"], value = ""): Condition => ({ field, operator, value });

/** Which rows match, by the JavaScript predicate. */
function jsMatches(filter: LayerFilter): number[] {
  const keep = filterPredicate(filter, NUMERIC);
  return ROWS.flatMap((row, i) => (keep(row) ? [i] : []));
}

/** Which rows match, by MapLibre's own evaluator running our expression. */
function mapLibreMatches(filter: LayerFilter): number[] {
  const expression = filterExpression(filter, NUMERIC);
  if (!expression) return ROWS.map((_, i) => i);
  const compiled = featureFilter(expression, "test");
  return ROWS.flatMap((properties, i) =>
    compiled.filter({ zoom: 0 }, { type: 1, properties, geometry: [] } as never) ? [i] : [],
  );
}

describe("layer filters", () => {
  const cases: [string, LayerFilter, number[]][] = [
    ["number =", filterOf([c("POP", "=", "30000")]), [2]],
    ["number ≠ keeps blanks", filterOf([c("POP", "!=", "0")]), [0, 1, 2, 3, 5]],
    ["number <", filterOf([c("POP", "<", "30000")]), [4, 5]],
    ["number ≥", filterOf([c("POP", ">=", "400000")]), [0, 1]],
    ["text = ignores case", filterOf([c("TYPE", "=", "TOWN")]), [1, 2]],
    ["text ≠", filterOf([c("TYPE", "!=", "town")]), [0, 3, 4, 5]],
    ["text field holding digits stays text", filterOf([c("CODE", "=", "42")]), [1]],
    ["text < compares alphabetically", filterOf([c("NAME", "<", "m")]), [0, 1, 3, 4, 5]],
    ["contains", filterOf([c("NAME", "contains", "LAHORE")]), [0, 1]],
    ["starts with", filterOf([c("TYPE", "startsWith", "t")]), [1, 2]],
    ["contains on a number", filterOf([c("POP", "contains", "000")]), [0, 1, 2, 5]],
    ["is empty (blank, null or missing)", filterOf([c("CODE", "isEmpty")]), [2, 3, 5]],
    ["is not empty", filterOf([c("NAME", "isNotEmpty")]), [0, 1, 2, 4]],
    ["all (AND)", filterOf([c("TYPE", "contains", "town"), c("POP", ">", "100000")]), [1]],
    ["any (OR)", filterOf([c("TYPE", "=", "city"), c("POP", "<", "1")], "any"), [0, 4]],
    ["unfinished conditions are ignored", filterOf([c("", "="), c("NAME", "=", " "), c("POP", ">", "abc")]), [0, 1, 2, 3, 4, 5]],
  ];

  for (const [name, filter, expected] of cases) {
    it(`${name}: JavaScript and MapLibre agree`, () => {
      expect(jsMatches(filter)).toEqual(expected);
      expect(mapLibreMatches(filter)).toEqual(expected);
    });
  }

  it("has no expression when nothing is finished", () => {
    expect(filterExpression(null, NUMERIC)).toBeNull();
    expect(filterExpression(filterOf([c("POP", ">", "")]), NUMERIC)).toBeNull();
    expect(isActive(filterOf([c("POP", ">", "x")]), NUMERIC)).toBe(false);
    expect(isActive(filterOf([c("POP", ">", "5")]), NUMERIC)).toBe(true);
  });

  it("flags unfinished conditions", () => {
    expect(isIncomplete(c("POP", ">", "lots"), NUMERIC)).toBe(true);
    expect(isIncomplete(c("NAME", "isEmpty"), NUMERIC)).toBe(false);
    expect(isIncomplete(c("NAME", "=", "x"), NUMERIC)).toBe(false);
  });

  it("restores saved filters and drops malformed parts", () => {
    expect(restoreFilter(null)).toBeNull();
    expect(restoreFilter({ conditions: "nope" })).toBeNull();
    expect(
      restoreFilter({
        match: "any",
        conditions: [c("A", "=", "1"), { field: "B", operator: "~~", value: "x" }, { field: 3 }, null],
      }),
    ).toEqual(filterOf([c("A", "=", "1")], "any"));
    expect(restoreFilter({ match: "weird", conditions: [] })).toEqual(filterOf([]));
  });
});

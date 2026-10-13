/**
 * Layer filters: "show only features where POP > 1000 and TYPE contains road".
 *
 * A filter is plain data (saved in project files). It's used in two places:
 * - `filterExpression()` turns it into a MapLibre filter expression, so the map
 *   only draws matching features;
 * - `filterPredicate()` turns it into a JavaScript function, so the attribute
 *   table and search show the same features.
 * The two must agree; filter.test.ts checks them against MapLibre's own evaluator.
 *
 * Rules:
 * - Comparisons (=, ≠, <, ≤, >, ≥) on a *numeric* field compare numbers;
 *   blank or text values never match (except ≠, which is "not =").
 * - Everything else compares text, ignoring upper/lower case. A missing value
 *   counts as empty text "".
 * - Conditions that aren't finished (no field, no value, or a non-number for a
 *   numeric comparison) are ignored, so a half-typed filter doesn't hide everything.
 */
import type { ExpressionSpecification, FilterSpecification } from "@maplibre/maplibre-gl-style-spec";
import { toText } from "./features";

export const OPERATORS = [
  { id: "=", label: "=" },
  { id: "!=", label: "≠" },
  { id: "<", label: "<" },
  { id: "<=", label: "≤" },
  { id: ">", label: ">" },
  { id: ">=", label: "≥" },
  { id: "contains", label: "contains" },
  { id: "startsWith", label: "starts with" },
  { id: "isEmpty", label: "is empty" },
  { id: "isNotEmpty", label: "is not empty" },
] as const;
export type Operator = (typeof OPERATORS)[number]["id"];

export interface Condition {
  field: string;
  operator: Operator;
  /** As typed by the user. */
  value: string;
}

export interface LayerFilter {
  /** "all": every condition must match (AND). "any": at least one (OR). */
  match: "all" | "any";
  conditions: Condition[];
}

const COMPARISONS = new Set<Operator>(["=", "!=", "<", "<=", ">", ">="]);

/** True for operators that need a value typed in. */
export const needsValue = (operator: Operator) => operator !== "isEmpty" && operator !== "isNotEmpty";

/** A condition reduced to what's needed to test it. */
type Prepared =
  | { kind: "number"; field: string; operator: Operator; number: number }
  | { kind: "text"; field: string; operator: Operator; text: string };

/**
 * Works out whether each condition compares numbers or text, and drops
 * unfinished ones. `numericFields` are the layer's fields that hold numbers.
 */
function prepare(filter: LayerFilter | null, numericFields: ReadonlySet<string>): Prepared[] {
  const prepared: Prepared[] = [];
  for (const { field, operator, value } of filter?.conditions ?? []) {
    if (!field) continue;
    const typed = value.trim();
    if (needsValue(operator) && typed === "") continue;
    if (COMPARISONS.has(operator) && numericFields.has(field)) {
      const number = Number(typed);
      if (Number.isFinite(number)) prepared.push({ kind: "number", field, operator, number });
      continue; // a word in a number comparison: ignore until it's fixed
    }
    prepared.push({ kind: "text", field, operator, text: typed.toLowerCase() });
  }
  return prepared;
}

/** True if the filter has at least one finished condition (so it hides something). */
export function isActive(filter: LayerFilter | null, numericFields: ReadonlySet<string>): boolean {
  return prepare(filter, numericFields).length > 0;
}

/** True if `condition` will be ignored because it isn't finished (for a hint in the editor). */
export function isIncomplete(condition: Condition, numericFields: ReadonlySet<string>): boolean {
  return prepare({ match: "all", conditions: [condition] }, numericFields).length === 0;
}

// --- MapLibre expression ----------------------------------------------------

function conditionExpression(c: Prepared): ExpressionSpecification {
  const value: ExpressionSpecification = ["get", c.field];
  const asText: ExpressionSpecification = ["to-string", value];

  if (c.operator === "isEmpty") return ["==", asText, ""];
  if (c.operator === "isNotEmpty") return ["!=", asText, ""];

  if (c.kind === "number") {
    // Check the type first: MapLibre can't compare a number with text or null.
    // "all" stops at the first false, so the comparison only runs on numbers.
    const isNumber: ExpressionSpecification = ["==", ["typeof", value], "number"];
    const equal: ExpressionSpecification = ["all", isNumber, ["==", value, c.number]];
    switch (c.operator) {
      case "=":
        return equal;
      case "!=":
        return ["!", equal];
      default:
        return ["all", isNumber, [c.operator as "<", value, c.number]];
    }
  }

  const lower: ExpressionSpecification = ["downcase", asText];
  switch (c.operator) {
    case "contains":
      return ["in", c.text, lower];
    case "startsWith":
      return ["==", ["index-of", c.text, lower], 0];
    case "=":
      // MapLibre spells equality "==".
      return ["==", lower, c.text];
    case "!=":
    case "<":
    case "<=":
    case ">":
    case ">=":
      return [c.operator as "<", lower, c.text];
    default:
      return ["boolean", true];
  }
}

/** The filter as a MapLibre expression, or null when it has no finished conditions. */
export function filterExpression(
  filter: LayerFilter | null,
  numericFields: ReadonlySet<string>,
): FilterSpecification | null {
  const prepared = prepare(filter, numericFields);
  if (prepared.length === 0) return null;
  return [filter!.match, ...prepared.map(conditionExpression)] as FilterSpecification;
}

// --- JavaScript predicate ---------------------------------------------------

type Properties = Record<string, unknown> | null | undefined;

function compare(a: number | string, operator: Operator, b: number | string): boolean {
  switch (operator) {
    case "=":
      return a === b;
    case "!=":
      return a !== b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    default:
      return false;
  }
}

function conditionMatches(c: Prepared, properties: Properties): boolean {
  const value = properties?.[c.field];
  const text = toText(value);
  if (c.operator === "isEmpty") return text === "";
  if (c.operator === "isNotEmpty") return text !== "";

  if (c.kind === "number") {
    const isNumber = typeof value === "number";
    if (c.operator === "!=") return !(isNumber && value === c.number);
    return isNumber && compare(value, c.operator, c.number);
  }

  const lower = text.toLowerCase();
  if (c.operator === "contains") return lower.includes(c.text);
  if (c.operator === "startsWith") return lower.startsWith(c.text);
  return compare(lower, c.operator, c.text);
}

/**
 * The filter as a function of a feature's properties. With no finished
 * conditions, everything matches.
 */
export function filterPredicate(
  filter: LayerFilter | null,
  numericFields: ReadonlySet<string>,
): (properties: Properties) => boolean {
  const prepared = prepare(filter, numericFields);
  if (prepared.length === 0) return () => true;
  if (filter!.match === "any") return (p) => prepared.some((c) => conditionMatches(c, p));
  return (p) => prepared.every((c) => conditionMatches(c, p));
}

// --- Project files ----------------------------------------------------------

const OPERATOR_IDS = new Set<string>(OPERATORS.map((o) => o.id));

/** Rebuilds a filter from a project file, dropping anything malformed. */
export function restoreFilter(saved: unknown): LayerFilter | null {
  if (typeof saved !== "object" || saved === null) return null;
  const { match, conditions } = saved as Record<string, unknown>;
  if (!Array.isArray(conditions)) return null;
  const valid = conditions.filter(
    (c): c is Condition =>
      typeof c === "object" &&
      c !== null &&
      typeof c.field === "string" &&
      typeof c.value === "string" &&
      OPERATOR_IDS.has(c.operator),
  );
  return {
    match: match === "any" ? "any" : "all",
    conditions: valid.map(({ field, operator, value }) => ({ field, operator, value })),
  };
}

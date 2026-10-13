/**
 * The attribute table's logic, kept apart from the component so it can be
 * tested: which rows to show, in what order, and how wide each column is.
 *
 * A row is a feature id (its position in the layer's feature list).
 */
import { toText, type AnyFeature } from "../features";

export interface SortOrder {
  field: string;
  descending: boolean;
}

export interface RowOptions {
  /** The layer filter as a function (filterPredicate); rows it rejects are hidden. */
  keep: (properties: Record<string, unknown> | null) => boolean;
  /** Per-column search text: only rows whose value contains it (any case) are shown. */
  searches: Record<string, string>;
  sort: SortOrder | null;
}

// Compares text the way people expect: "a" next to "A", and "item 2" before "item 10".
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/**
 * Orders two attribute values: numbers by size, text alphabetically, numbers
 * before text, and empty values last.
 */
export function compareValues(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "number") return -1;
  if (typeof b === "number") return 1;
  return collator.compare(toText(a), toText(b));
}

/** The ids of the rows to show, in display order. */
export function tableRows(features: AnyFeature[], options: RowOptions): number[] {
  const searches = Object.entries(options.searches)
    .map(([field, text]) => [field, text.trim().toLowerCase()] as const)
    .filter(([, text]) => text !== "");

  const rows: number[] = [];
  features.forEach((feature, id) => {
    const properties = feature.properties;
    if (!options.keep(properties)) return;
    for (const [field, text] of searches) {
      if (!toText(properties?.[field]).toLowerCase().includes(text)) return;
    }
    rows.push(id);
  });

  const sort = options.sort;
  if (sort) {
    const value = (id: number) => features[id].properties?.[sort.field];
    rows.sort((a, b) => {
      const order = compareValues(value(a), value(b));
      // Empty values stay last either way; ties keep file order.
      const isEmpty = (id: number) => toText(value(id)) === "";
      const flip = sort.descending && !isEmpty(a) && !isEmpty(b) ? -1 : 1;
      return order * flip || a - b;
    });
  }
  return rows;
}

/** The next sort order when a column header is clicked: ascending → descending → off. */
export function nextSort(current: SortOrder | null, field: string): SortOrder | null {
  if (current?.field !== field) return { field, descending: false };
  return current.descending ? null : { field, descending: true };
}

/** The rows from one id to another inclusive, in display order (for Shift+click). */
export function rowRange(rows: number[], from: number, to: number): number[] {
  const a = rows.indexOf(from);
  const b = rows.indexOf(to);
  if (a < 0 || b < 0) return [to];
  return rows.slice(Math.min(a, b), Math.max(a, b) + 1);
}

/**
 * A column width in pixels that fits the field name and typical values,
 * judged from the first 200 features.
 */
export function columnWidth(field: string, features: AnyFeature[]): number {
  let longest = field.length + 2; // room for the sort arrow
  for (const feature of features.slice(0, 200)) {
    longest = Math.max(longest, toText(feature.properties?.[field]).length);
  }
  return Math.round(Math.min(280, Math.max(64, longest * 8 + 20)));
}

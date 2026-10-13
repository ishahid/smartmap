/**
 * Working out categories and numeric classes from a layer's attribute values.
 */
import type { Feature, Geometry } from "geojson";
import { categoryColor, rampColors } from "./colors";
import type { Category, ClassMethod, GradClass } from "./types";

/** A feature that may have no geometry (readers keep those for their attributes). */
type AnyFeature = Feature<Geometry | null>;

/** Most categories a style gets; rarer values share the "other" colour. */
export const MAX_CATEGORIES = 24;

/**
 * The text used to match a value in a categorized style. MapLibre compares
 * `["to-string", value]`, which turns null/missing into "", so we do the same.
 */
export function categoryKey(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * One category per distinct value of `field`, most common first (ties in
 * alphabetical order), at most MAX_CATEGORIES of them.
 */
export function uniqueCategories(features: AnyFeature[], field: string): Category[] {
  const counts = new Map<string, number>();
  for (const feature of features) {
    const key = categoryKey(feature.properties?.[field]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_CATEGORIES)
    .map(([value], index) => ({ value, color: categoryColor(index) }));
}

/** All finite numbers of `field`, skipping blanks and text. */
export function numericValues(features: AnyFeature[], field: string): number[] {
  const values: number[] = [];
  for (const feature of features) {
    const value = feature.properties?.[field];
    if (typeof value === "number" && Number.isFinite(value)) values.push(value);
  }
  return values;
}

/** Fields that hold numbers (every non-blank value is a number, and there is at least one). */
export function numericFields(features: AnyFeature[], fields: string[]): string[] {
  return fields.filter((field) => {
    let sawNumber = false;
    for (const feature of features) {
      const value = feature.properties?.[field];
      if (value === null || value === undefined || value === "") continue;
      if (typeof value !== "number") return false;
      sawNumber = true;
    }
    return sawNumber;
  });
}

/**
 * Class boundaries, `count + 1` numbers from the minimum to the maximum.
 *
 * - equal: same-width ranges. Good when values are spread evenly.
 * - quantile: same number of features per range. Good for skewed data like
 *   population, where equal ranges would put nearly everything in one class.
 */
export function breaks(values: number[], count: number, method: ClassMethod): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (min === max) return [min, max];

  const result = [min];
  for (let i = 1; i < count; i++) {
    const edge =
      method === "equal" ? min + ((max - min) * i) / count : sorted[Math.floor((sorted.length * i) / count)];
    // Quantiles can repeat on data with many equal values; skip duplicates.
    if (edge > result[result.length - 1] && edge < max) result.push(edge);
  }
  result.push(max);
  return result;
}

/** Builds graduated classes for `field`, coloured along `ramp`. */
export function makeClasses(
  features: AnyFeature[],
  field: string,
  count: number,
  method: ClassMethod,
  ramp: string,
): GradClass[] {
  const edges = breaks(numericValues(features, field), count, method);
  const colors = rampColors(ramp, Math.max(edges.length - 1, 1));
  return edges.slice(0, -1).map((min, i) => ({ min, max: edges[i + 1], color: colors[i] }));
}

/** "1,000 – 2,500" style text for a class, with sensible rounding. */
export function formatRange(cls: GradClass): string {
  const span = Math.abs(cls.max - cls.min);
  const digits = span === 0 || span >= 10 ? 0 : span >= 1 ? 1 : 3;
  const format = (n: number) => n.toLocaleString("en", { maximumFractionDigits: digits });
  return `${format(cls.min)} – ${format(cls.max)}`;
}

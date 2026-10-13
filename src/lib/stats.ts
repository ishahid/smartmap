/**
 * Basic statistics of a numeric field: count, minimum, maximum, mean,
 * median, standard deviation and sum. Values that aren't numbers (blank,
 * text) are counted as missing and left out.
 */

export interface FieldStats {
  /** How many values are numbers. */
  count: number;
  /** How many values aren't (blank or text). */
  missing: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  /** Population standard deviation: how spread out the values are around the mean. */
  stdDev: number;
  sum: number;
}

/** Statistics of some values, or null if none of them is a number. */
export function fieldStats(values: unknown[]): FieldStats | null {
  const numbers = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((total, n) => total + n, 0);
  const mean = sum / count;
  const middle = Math.floor(count / 2);
  const median = count % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const variance = sorted.reduce((total, n) => total + (n - mean) ** 2, 0) / count;
  return {
    count,
    missing: values.length - count,
    min: sorted[0],
    max: sorted[count - 1],
    mean,
    median,
    stdDev: Math.sqrt(variance),
    sum,
  };
}

/** A statistic for display: up to 4 significant decimals, with thousands separators. */
export function formatStat(value: number): string {
  const digits = Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 1 ? 2 : 4;
  return value.toLocaleString("en", { maximumFractionDigits: digits });
}

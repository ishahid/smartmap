/**
 * Colour helpers: palettes for categories and ramps for graduated styles.
 * Colours are "#rrggbb" strings throughout, which is what <input type="color"> uses.
 */

/** Colours handed out to new layers in turn. Picked to show up on light basemaps. */
export const LAYER_COLORS = ["#e4572e", "#2e86ab", "#57a773", "#f3a712", "#8e5572", "#29335c", "#a8c256", "#d81159"];

/** Distinct colours for categories (Tableau 10, then 2 extras). */
export const CATEGORY_COLORS = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc948",
  "#b07aa1",
  "#ff9da7",
  "#9c755f",
  "#bab0ac",
  "#1f77b4",
  "#8c564b",
];

/**
 * Colour ramps for graduated styles, light to dark. The stops are from
 * ColorBrewer (Blues, Reds, Greens, YlOrRd) and matplotlib (Viridis).
 */
export const RAMPS: Record<string, string[]> = {
  Blues: ["#eff3ff", "#bdd7e7", "#6baed6", "#3182bd", "#08519c"],
  Reds: ["#fee5d9", "#fcae91", "#fb6a4a", "#de2d26", "#a50f15"],
  Greens: ["#edf8e9", "#bae4b3", "#74c476", "#31a354", "#006d2c"],
  YlOrRd: ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"],
  Viridis: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
};
export const DEFAULT_RAMP = "YlOrRd";

/** Picks a colour for the n-th layer opened. */
export function colorForIndex(index: number): string {
  return LAYER_COLORS[index % LAYER_COLORS.length];
}

/** Picks a colour for the n-th category. */
export function categoryColor(index: number): string {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: number[]): string {
  return "#" + [r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("");
}

/** Mixes two colours: t = 0 gives `a`, t = 1 gives `b`. */
export function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  return toHex(ca.map((c, i) => c + (cb[i] - c) * t));
}

/** A darker shade of a colour, for outlines. */
export function darken(hex: string, amount = 0.35): string {
  return mix(hex, "#000000", amount);
}

/** `count` evenly spaced colours along a ramp (interpolating between its stops). */
export function rampColors(name: string, count: number): string[] {
  const stops = RAMPS[name] ?? RAMPS[DEFAULT_RAMP];
  if (count <= 1) return [stops[stops.length - 1]];
  return Array.from({ length: count }, (_, i) => {
    const position = (i / (count - 1)) * (stops.length - 1);
    const lower = Math.floor(position);
    const upper = Math.min(lower + 1, stops.length - 1);
    return mix(stops[lower], stops[upper], position - lower);
  });
}

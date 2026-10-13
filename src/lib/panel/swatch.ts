import type { LayerStyle } from "../style/types";

/**
 * CSS background for a layer's swatch in the panel: its colour, or stripes of
 * its category/class colours.
 */
export function swatchBackground(style: LayerStyle): string {
  const colors =
    style.kind === "categorized" && style.field
      ? style.categories.map((c) => c.color)
      : style.kind === "graduated" && style.field
        ? style.classes.map((c) => c.color)
        : [];
  if (colors.length === 0) return style.color;
  const shown = colors.slice(0, 5);
  const stops = shown.map((color, i) => `${color} ${(i * 100) / shown.length}% ${((i + 1) * 100) / shown.length}%`);
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

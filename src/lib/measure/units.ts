/**
 * Showing lengths and areas in the user's choice of units. Measurements
 * arrive in metres and square metres; these pick a sensible unit for the size
 * (metres or kilometres, say) and round to a sensible number of digits.
 */

export const UNIT_SYSTEMS = [
  { id: "metric", label: "Metric (m, km, ha)" },
  { id: "imperial", label: "Imperial (ft, mi, acres)" },
  { id: "nautical", label: "Nautical (nmi)" },
] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number]["id"];

const FOOT = 0.3048;
const MILE = 1609.344;
const NAUTICAL_MILE = 1852;
const ACRE = 4046.8564224;

/** 2 decimals below 10, 1 below 100, none above, with thousands separators: 1,234 / 56.7 / 8.91. */
function number(value: number): string {
  const digits = value < 10 ? 2 : value < 100 ? 1 : 0;
  return value.toLocaleString("en", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** A length in metres, e.g. "850 m", "12.4 km", "3.21 mi", "1,520 ft", "4.05 nmi". */
export function formatLength(metres: number, units: UnitSystem): string {
  switch (units) {
    case "imperial":
      return metres < MILE ? `${number(metres / FOOT)} ft` : `${number(metres / MILE)} mi`;
    case "nautical":
      return `${number(metres / NAUTICAL_MILE)} nmi`;
    default:
      return metres < 1000 ? `${number(metres)} m` : `${number(metres / 1000)} km`;
  }
}

/** An area in square metres, e.g. "640 m²", "3.20 ha", "1,250 km²", "12.5 acres", "4.10 mi²". */
export function formatArea(squareMetres: number, units: UnitSystem): string {
  if (units === "metric") {
    if (squareMetres < 10_000) return `${number(squareMetres)} m²`;
    if (squareMetres < 1_000_000) return `${number(squareMetres / 10_000)} ha`;
    return `${number(squareMetres / 1_000_000)} km²`;
  }
  // Imperial and nautical both use acres and square miles for areas.
  if (squareMetres < ACRE) return `${number(squareMetres / (FOOT * FOOT))} ft²`;
  if (squareMetres < MILE * MILE) return `${number(squareMetres / ACRE)} acres`;
  return `${number(squareMetres / (MILE * MILE))} mi²`;
}

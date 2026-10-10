/** Helpers for showing coordinates in the status bar. */

export type CoordFormat = "decimal" | "dms";

/** Wrap a longitude into [-180, 180). MapLibre reports unwrapped values when the world repeats. */
export function wrapLongitude(lng: number): number {
  const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
  return wrapped;
}

/** Format one angle as degrees°minutes′seconds″ with a hemisphere letter. */
export function toDms(value: number, positive: string, negative: string): string {
  const hemi = value < 0 ? negative : positive;
  let abs = Math.abs(value);
  let deg = Math.floor(abs);
  let min = Math.floor((abs - deg) * 60);
  let sec = Math.round(((abs - deg) * 60 - min) * 60 * 10) / 10;
  // Rounding can produce 60″ or 60′; carry it over.
  if (sec >= 60) {
    sec -= 60;
    min += 1;
  }
  if (min >= 60) {
    min -= 60;
    deg += 1;
  }
  return `${deg}°${String(min).padStart(2, "0")}′${sec.toFixed(1).padStart(4, "0")}″${hemi}`;
}

/** Format a longitude/latitude pair for display. */
export function formatLngLat(lng: number, lat: number, format: CoordFormat): string {
  const x = wrapLongitude(lng);
  if (format === "dms") {
    return `${toDms(lat, "N", "S")}  ${toDms(x, "E", "W")}`;
  }
  return `Lat ${lat.toFixed(5)}  Lon ${x.toFixed(5)}`;
}

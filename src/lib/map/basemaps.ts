/** Online basemap styles. Offline PMTiles basemaps arrive in build step 9. */

export interface Basemap {
  id: string;
  label: string;
  /** A MapLibre style URL. */
  style: string;
}

// OpenFreeMap: free, no API key, OpenStreetMap data. https://openfreemap.org
export const BASEMAPS: Basemap[] = [
  { id: "liberty", label: "OpenFreeMap Liberty", style: "https://tiles.openfreemap.org/styles/liberty" },
  { id: "bright", label: "OpenFreeMap Bright", style: "https://tiles.openfreemap.org/styles/bright" },
  { id: "positron", label: "OpenFreeMap Positron", style: "https://tiles.openfreemap.org/styles/positron" },
];

export const DEFAULT_BASEMAP = BASEMAPS[0];

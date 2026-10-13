/** The basemaps to choose from: none, OpenFreeMap (online), or an offline file (offline.ts). */
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";

export interface Basemap {
  /** Unique per style: MapView only switches styles when the id changes. */
  id: string;
  label: string;
  /** A MapLibre style URL, or a style object. */
  style: string | StyleSpecification;
}

/**
 * No basemap: a plain background. Without a `glyphs` URL, MapLibre draws
 * label text with the computer's own fonts, so this works offline too.
 */
export const NO_BASEMAP: Basemap = {
  id: "none",
  label: "None",
  style: {
    version: 8,
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": "#f2efe9" } }],
  },
};

// OpenFreeMap: free, no API key, OpenStreetMap data. https://openfreemap.org
export const ONLINE_BASEMAPS: Basemap[] = [
  { id: "liberty", label: "OpenFreeMap Liberty", style: "https://tiles.openfreemap.org/styles/liberty" },
  { id: "bright", label: "OpenFreeMap Bright", style: "https://tiles.openfreemap.org/styles/bright" },
  { id: "positron", label: "OpenFreeMap Positron", style: "https://tiles.openfreemap.org/styles/positron" },
];

/** Every built-in basemap. A local file (offline.ts) is chosen with the id OFFLINE_BASEMAP_ID. */
export const BASEMAPS: Basemap[] = [NO_BASEMAP, ...ONLINE_BASEMAPS];

export const DEFAULT_BASEMAP = ONLINE_BASEMAPS[0];

/** The basemap id meaning "the project's offline map file". */
export const OFFLINE_BASEMAP_ID = "offline";

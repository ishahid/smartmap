/**
 * Offline basemaps: turning a local tile file (PMTiles or MBTiles, opened by
 * Rust) into a MapLibre style. Pure functions, so they're easy to test.
 *
 * - **Protomaps** vector files (the usual offline basemap, made with
 *   `pmtiles extract`) get the full Protomaps style from @protomaps/basemaps,
 *   in one of five colour schemes ("flavors"). That style is for the current
 *   layer scheme (version 4).
 * - **Other vector** files, including older Protomaps files (version 3, whose
 *   attributes are named differently), get a plain grey style that draws every layer.
 * - **Image** (raster) files are drawn as they are.
 *
 * The styles have no `glyphs` URL on purpose: MapLibre then draws label text
 * with the computer's own fonts, so labels need no network either. The icons
 * (sprites) for Protomaps maps are bundled with the app in public/basemap/.
 */
import type { LayerSpecification, SourceSpecification, StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import { language_script_pairs, layers, namedFlavor } from "@protomaps/basemaps";
import type { TileInfo } from "../api";
import type { Basemap } from "./basemaps";

/**
 * MapLibre asks for offline tiles at `smartmap-tiles://<id>/<z>/<x>/<y>`;
 * tileProtocol.ts answers by fetching them from Rust.
 */
export const TILE_PROTOCOL = "smartmap-tiles";

/** The tile address template for an open tile file. */
export function tileUrl(id: string): string {
  return `${TILE_PROTOCOL}://${id}/{z}/{x}/{y}`;
}

/** Colour schemes for Protomaps maps. Each has its own icon sheet in public/basemap/sprites/v4/. */
export const FLAVORS = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "white", label: "White" },
  { id: "grayscale", label: "Grey" },
  { id: "black", label: "Black" },
] as const;
export const DEFAULT_FLAVOR = "light";

/** `name` if it's a known colour scheme, otherwise the default one (e.g. a hand-edited project). */
export function flavorOrDefault(name: string | null | undefined): string {
  return FLAVORS.some((f) => f.id === name) ? name! : DEFAULT_FLAVOR;
}

/** Languages the Protomaps style can label in, e.g. "en", "ar", "zh-Hans". */
const LABEL_LANGUAGES = new Set(language_script_pairs.map((p) => p.lang));

/**
 * The label language for a browser language such as "de-AT" or "ur": the
 * whole tag or its first part if Protomaps knows it, otherwise English.
 */
export function labelLanguage(browserLanguage: string): string {
  if (LABEL_LANGUAGES.has(browserLanguage)) return browserLanguage;
  const primary = browserLanguage.split("-")[0];
  return LABEL_LANGUAGES.has(primary) ? primary : "en";
}

/**
 * Which Protomaps layer scheme a file uses: "current" (version 4 or later,
 * or no version given), "old" (version 3 and earlier), or null for files that
 * aren't Protomaps maps.
 */
export function protomapsScheme(info: TileInfo): "current" | "old" | null {
  const layersMatch = ["earth", "water", "roads"].every((name) => info.vectorLayers.includes(name));
  if (info.tileType !== "vector" || !layersMatch) return null;
  const major = parseInt(info.version ?? "", 10);
  return major < 4 ? "old" : "current";
}

/** True if the file gets the full Protomaps style. */
export function isProtomaps(info: TileInfo): boolean {
  return protomapsScheme(info) === "current";
}

/** Background for maps without one of their own, and outside the file's area. */
const PAPER = "#f2efe9";

/** The MapLibre source for a tile file. */
function sourceFor(info: TileInfo): SourceSpecification {
  const common = {
    tiles: [tileUrl(info.id)],
    minzoom: info.minZoom,
    maxzoom: info.maxZoom,
    // MapLibre only asks for tiles inside the bounds (and zooms in on the last zoom level's tiles).
    ...(info.bounds ? { bounds: info.bounds } : {}),
    ...(info.attribution ? { attribution: info.attribution } : {}),
  };
  return info.tileType === "vector" ? { type: "vector", ...common } : { type: "raster", tileSize: 256, ...common };
}

/** A plain style for vector tiles we don't have a style for: every layer in greys (water in blue). */
function genericVectorLayers(source: string, info: TileInfo): LayerSpecification[] {
  return info.vectorLayers.flatMap((name): LayerSpecification[] => {
    const water = /water|ocean|sea|river/i.test(name);
    return [
      {
        id: `${name}-fill`,
        type: "fill",
        source,
        "source-layer": name,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: water
          ? { "fill-color": "#a8cfe0" }
          : { "fill-color": "#d8d3c6", "fill-opacity": 0.6, "fill-outline-color": "#b5ae9e" },
      },
      {
        id: `${name}-line`,
        type: "line",
        source,
        "source-layer": name,
        filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": water ? "#7fb2cc" : "#9a9384", "line-width": 1 },
      },
      {
        id: `${name}-point`,
        type: "circle",
        source,
        "source-layer": name,
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-color": "#7a7468", "circle-radius": 2 },
      },
    ];
  });
}

/**
 * The MapLibre style for a tile file.
 *
 * @param flavor colour scheme (Protomaps maps only), see FLAVORS
 * @param spriteBase absolute URL of the bundled icon sheets, e.g. "tauri://localhost/basemap/sprites/v4"
 * @param language label language (Protomaps maps only), see labelLanguage()
 */
export function offlineStyle(info: TileInfo, flavor: string, spriteBase: string, language = "en"): StyleSpecification {
  const source = "offline";
  const background: LayerSpecification = { id: "background", type: "background", paint: { "background-color": PAPER } };
  const style: StyleSpecification = { version: 8, sources: { [source]: sourceFor(info) }, layers: [] };

  if (isProtomaps(info)) {
    const scheme = flavorOrDefault(flavor);
    style.sprite = `${spriteBase}/${scheme}`;
    // Protomaps' own layers start with a background in the scheme's colour.
    style.layers = layers(source, namedFlavor(scheme), { lang: language });
  } else if (info.tileType === "vector") {
    style.layers = [background, ...genericVectorLayers(source, info)];
  } else {
    style.layers = [background, { id: "tiles", type: "raster", source }];
  }
  return style;
}

/** The basemap for a tile file. Its id changes with the file and scheme, so MapView knows to switch. */
export function offlineBasemap(info: TileInfo, flavor: string, spriteBase: string, language = "en"): Basemap {
  return {
    id: `offline:${info.id}:${flavorOrDefault(flavor)}:${language}`,
    label: info.name,
    style: offlineStyle(info, flavor, spriteBase, language),
  };
}

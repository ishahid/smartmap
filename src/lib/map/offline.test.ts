import { validateStyleMin, type StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import { describe, expect, it } from "vitest";
import type { TileInfo } from "../api";
import { NO_BASEMAP } from "./basemaps";
import { flavorOrDefault, isProtomaps, labelLanguage, offlineBasemap, offlineStyle, protomapsScheme, tileUrl } from "./offline";

const SPRITES = "tauri://localhost/basemap/sprites/v4";

const info = (overrides: Partial<TileInfo> = {}): TileInfo => ({
  id: "t1",
  path: "/maps/firenze.pmtiles",
  name: "Firenze",
  format: "PMTiles",
  tileType: "vector",
  minZoom: 0,
  maxZoom: 15,
  bounds: [11.22, 43.74, 11.29, 43.79],
  center: [11.25, 43.77, 0],
  attribution: '<a href="https://openstreetmap.org/copyright">© OpenStreetMap</a>',
  version: "4.13.4",
  vectorLayers: ["boundaries", "buildings", "earth", "landcover", "landuse", "places", "pois", "roads", "transit", "water"],
  ...overrides,
});

describe("offline basemaps", () => {
  it("styles Protomaps files with the Protomaps layers and bundled icons", () => {
    const style = offlineStyle(info(), "dark", SPRITES);
    expect(validateStyleMin(style)).toEqual([]);
    expect(style.sprite).toBe(`${SPRITES}/dark`);
    // No glyphs URL: MapLibre draws label text with the computer's fonts, offline.
    expect(style.glyphs).toBeUndefined();
    expect(style.sources.offline).toMatchObject({
      type: "vector",
      tiles: ["smartmap-tiles://t1/{z}/{x}/{y}"],
      minzoom: 0,
      maxzoom: 15,
      bounds: [11.22, 43.74, 11.29, 43.79],
    });
    expect(style.layers.length).toBeGreaterThan(50);
    expect(style.layers.some((l) => l.type === "symbol")).toBe(true);
  });

  it("draws other vector files in plain greys, one set of layers each", () => {
    const style = offlineStyle(info({ vectorLayers: ["water", "transportation"] }), "dark", SPRITES);
    expect(validateStyleMin(style)).toEqual([]);
    expect(style.sprite).toBeUndefined();
    expect(style.layers.map((l) => l.id)).toEqual([
      "background",
      "water-fill",
      "water-line",
      "water-point",
      "transportation-fill",
      "transportation-line",
      "transportation-point",
    ]);
  });

  it("draws old Protomaps files in plain greys (their attributes have other names)", () => {
    const style = offlineStyle(info({ version: "3.7.1" }), "light", SPRITES);
    expect(validateStyleMin(style)).toEqual([]);
    expect(style.sprite).toBeUndefined();
    expect(style.layers.map((l) => l.id)).toContain("roads-line");
  });

  it("draws image tiles as they are", () => {
    const style = offlineStyle(info({ tileType: "png", vectorLayers: [], bounds: null, attribution: null }), "light", SPRITES);
    expect(validateStyleMin(style)).toEqual([]);
    expect(style.sources.offline).toEqual({
      type: "raster",
      tileSize: 256,
      tiles: ["smartmap-tiles://t1/{z}/{x}/{y}"],
      minzoom: 0,
      maxzoom: 15,
    });
    expect(style.layers.map((l) => l.type)).toEqual(["background", "raster"]);
  });

  it("recognises Protomaps files by their layers, and old ones by their version", () => {
    expect(protomapsScheme(info())).toBe("current");
    expect(protomapsScheme(info({ version: null }))).toBe("current");
    expect(protomapsScheme(info({ version: "3.7.1" }))).toBe("old");
    expect(protomapsScheme(info({ vectorLayers: ["water"] }))).toBeNull();
    expect(isProtomaps(info({ version: "3.7.1" }))).toBe(false);
    expect(isProtomaps(info())).toBe(true);
    expect(isProtomaps(info({ vectorLayers: ["water", "transportation"] }))).toBe(false);
    expect(isProtomaps(info({ tileType: "png" }))).toBe(false);
  });

  it("gives each file, colour scheme and language its own basemap id", () => {
    const a = offlineBasemap(info(), "light", SPRITES);
    expect(a.label).toBe("Firenze");
    expect(offlineBasemap(info(), "light", SPRITES).id).toBe(a.id);
    expect(offlineBasemap(info(), "dark", SPRITES).id).not.toBe(a.id);
    expect(offlineBasemap(info({ id: "t2" }), "light", SPRITES).id).not.toBe(a.id);
    expect(offlineBasemap(info(), "light", SPRITES, "de").id).not.toBe(a.id);
  });

  it("falls back to known colour schemes and languages", () => {
    expect(flavorOrDefault("black")).toBe("black");
    expect(flavorOrDefault("neon")).toBe("light");
    expect(flavorOrDefault(null)).toBe("light");
    expect(labelLanguage("de-AT")).toBe("de");
    expect(labelLanguage("ur")).toBe("ur");
    expect(labelLanguage("xx-YY")).toBe("en");
  });

  it("builds tile addresses and a valid empty basemap", () => {
    expect(tileUrl("t3")).toBe("smartmap-tiles://t3/{z}/{x}/{y}");
    expect(validateStyleMin(NO_BASEMAP.style as StyleSpecification)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import type { LayerData } from "../api";
import type { MapLayer } from "../map/types";
import { searchLayers } from "./search";
import { defaultStyle } from "../style/layerStyle";

const layer = (id: string, rows: Record<string, unknown>[], extra: Partial<MapLayer> = {}): MapLayer => ({
  id,
  name: `Layer ${id}`,
  visible: true,
  opacity: 1,
  style: defaultStyle(0),
  filter: null,
  annotations: null,
  data: {
    fields: Object.keys(rows[0] ?? {}),
    geojson: {
      type: "FeatureCollection",
      features: rows.map((properties, i) => ({ type: "Feature", id: i, properties, geometry: null })),
    },
  } as unknown as LayerData,
  ...extra,
});

describe("searchLayers", () => {
  const cities = layer("c", [
    { NAME: "Lahore", POP: 11 },
    { NAME: "Karachi", POP: 16 },
  ]);
  const rivers = layer("r", [{ NAME: "Ravi", CITY: "Lahore" }]);

  it("finds text in any attribute, top layer first", () => {
    const { hits, truncated } = searchLayers([cities, rivers], "LAHORE");
    expect(truncated).toBe(false);
    expect(hits.map((h) => [h.layerId, h.featureId, h.label, h.match])).toEqual([
      ["r", 0, "Ravi", "CITY: Lahore"],
      ["c", 0, "Lahore", "NAME: Lahore"],
    ]);
  });

  it("skips hidden layers and filtered-out features", () => {
    const hidden = { ...rivers, visible: false };
    const filtered = {
      ...cities,
      filter: { match: "all" as const, conditions: [{ field: "POP", operator: ">" as const, value: "12" }] },
    };
    expect(searchLayers([filtered, hidden], "a").hits.map((h) => h.label)).toEqual(["Karachi"]);
  });

  it("stops at the limit and ignores blank queries", () => {
    expect(searchLayers([cities], "a", 1)).toMatchObject({ truncated: true, hits: [{ label: "Lahore" }] });
    expect(searchLayers([cities], "  ").hits).toEqual([]);
  });
});

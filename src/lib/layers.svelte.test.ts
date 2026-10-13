import { describe, expect, it } from "vitest";
import type { LayerData } from "./api";
import { LayerList } from "./layers.svelte";

const data = (name: string): LayerData => ({
  name,
  path: `/data/${name}.shp`,
  table: null,
  format: "Shapefile",
  geometryType: "Point",
  featureCount: 0,
  emptyGeometries: 0,
  bbox: null,
  fields: [],
  crs: "EPSG:4326",
  reprojected: false,
  warnings: [],
  geojson: { type: "FeatureCollection", features: [] },
});

const names = (list: LayerList) => list.layers.map((l) => l.name);

describe("LayerList", () => {
  it("adds layers on top with their own ids and colours", () => {
    const list = new LayerList();
    const a = list.add(data("a"));
    const b = list.add(data("b"));
    expect(names(list)).toEqual(["a", "b"]);
    expect(a.id).not.toBe(b.id);
    expect(a.style.color).not.toBe(b.style.color);
  });

  it("moves layers, clamping the target index", () => {
    const list = new LayerList();
    const [a] = ["a", "b", "c"].map((n) => list.add(data(n)));
    list.move(a.id, 2);
    expect(names(list)).toEqual(["b", "c", "a"]);
    list.move(a.id, -5);
    expect(names(list)).toEqual(["a", "b", "c"]);
  });

  it("updates by replacing, never mutating", () => {
    const list = new LayerList();
    const a = list.add(data("a"));
    const before = list.layers;
    list.update(a.id, { name: "renamed", opacity: 0.5 });
    list.updateStyle(a.id, { lineWidth: 3 });
    expect(list.layers).not.toBe(before);
    expect(before[0].name).toBe("a");
    expect(list.layers[0]).toMatchObject({ name: "renamed", opacity: 0.5, style: { lineWidth: 3 } });
  });

  it("clears the selection when the selected layer is removed", () => {
    const list = new LayerList();
    const a = list.add(data("a"));
    list.selectedId = a.id;
    expect(list.selected?.id).toBe(a.id);
    list.remove(a.id);
    expect(list.layers).toEqual([]);
    expect(list.selected).toBeNull();
  });

  it("clear() restarts colours but never reuses ids", () => {
    const list = new LayerList();
    const first = list.add(data("a"));
    list.selectedId = first.id;
    list.clear();
    expect(list.layers).toEqual([]);
    expect(list.selectedId).toBeNull();
    const again = list.add(data("a"));
    expect(again.id).not.toBe(first.id);
    expect(again.style.color).toBe(first.style.color);
  });

  it("add() takes saved settings", () => {
    const list = new LayerList();
    const style = { ...list.add(data("x")).style, lineWidth: 7 };
    const layer = list.add(data("a"), { name: "Roads", visible: false, opacity: 0.3, style });
    expect(layer).toMatchObject({ name: "Roads", visible: false, opacity: 0.3, style: { lineWidth: 7 } });
  });

  it("keeps annotation layers' data in step with their features", () => {
    const list = new LayerList();
    const notes = list.addAnnotationLayer("Notes");
    expect(notes.annotations).toEqual([]);
    expect(list.layers[0]).toMatchObject({ name: "Notes", annotations: [], data: { format: "Annotations" } });
    const feature = {
      type: "Feature" as const,
      id: "x",
      geometry: { type: "Point" as const, coordinates: [1, 2] },
      properties: { kind: "point" as const, name: "", description: "" },
    };
    list.setAnnotations(notes.id, [feature]);
    expect(list.layers[0].data.featureCount).toBe(1);
    expect(list.layers[0].data.geojson.features[0].id).toBe(0);

    // Data layers are left alone.
    const plain = list.add(data("a"));
    list.setAnnotations(plain.id, [feature]);
    expect(list.layers[1].annotations).toBeNull();
  });

  it("puts a removed layer back where it was", () => {
    const list = new LayerList();
    const [, b] = ["a", "b", "c"].map((n) => list.add(data(n)));
    list.remove(b.id);
    list.insert(b, 1);
    expect(names(list)).toEqual(["a", "b", "c"]);
  });
});

import { describe, expect, it } from "vitest";
import { colorExpression, defaultStyle, sourceId, styleLayersFor, type StyledLayer } from "./layerStyle";
import type { LayerStyle } from "./types";

const layer = (style: Partial<LayerStyle> = {}, extra: Partial<StyledLayer> = {}): StyledLayer => ({
  id: "abc",
  style: { ...defaultStyle(0), color: "#ff0000", ...style },
  opacity: 1,
  visible: true,
  ...extra,
});

describe("styleLayersFor", () => {
  it("draws fills, outlines, lines and points from the layer's source", () => {
    const layers = styleLayersFor(layer());
    expect(layers.map((l) => l.type)).toEqual(["fill", "line", "line", "circle"]);
    for (const l of layers) expect("source" in l && l.source).toBe(sourceId("abc"));
    expect(new Set(layers.map((l) => l.id)).size).toBe(layers.length);
  });

  it("uses an icon layer for non-circle shapes", () => {
    const point = styleLayersFor(layer({ pointShape: "star", pointSize: 12 }))[3];
    expect(point.type).toBe("symbol");
    expect(point.layout).toMatchObject({ "icon-image": "sm-shape-star", "icon-size": 1 });
  });

  it("never reuses a layer id for a different layer type", () => {
    // MapLibre crashes placing symbols if an id comes back as another type (see layerStyle.ts).
    const types = new Map<string, string>();
    for (const shape of ["circle", "star"] as const) {
      for (const l of styleLayersFor(layer({ pointShape: shape, label: { field: "x", size: 12, color: "#000000" } }))) {
        expect(types.get(l.id) ?? l.type).toBe(l.type);
        types.set(l.id, l.type);
      }
    }
  });

  it("adds label layers only when a label field is set", () => {
    expect(styleLayersFor(layer()).some((l) => l.id.includes("label"))).toBe(false);
    const labelled = styleLayersFor(layer({ label: { field: "name", size: 12, color: "#222222" } }));
    const labels = labelled.filter((l) => l.id.includes("label"));
    expect(labels).toHaveLength(2);
    expect(labels[0].layout).toMatchObject({ "text-field": ["to-string", ["get", "name"]] });
  });

  it("applies layer opacity and visibility to every style layer", () => {
    const layers = styleLayersFor(layer({ fillOpacity: 0.5 }, { opacity: 0.5, visible: false }));
    expect(layers[0].paint).toMatchObject({ "fill-opacity": 0.25 });
    expect(layers[2].paint).toMatchObject({ "line-opacity": 0.5 });
    for (const l of layers) expect(l.layout).toMatchObject({ visibility: "none" });
  });
});

describe("colorExpression", () => {
  it("is a plain colour for single styles", () => {
    expect(colorExpression(layer().style)).toBe("#ff0000");
  });

  it("matches category values as text", () => {
    const style = layer({
      kind: "categorized",
      field: "type",
      categories: [
        { value: "lake", color: "#0000ff" },
        { value: "", color: "#cccccc" },
      ],
      otherColor: "#999999",
    }).style;
    expect(colorExpression(style)).toEqual([
      "match",
      ["to-string", ["get", "type"]],
      "lake",
      "#0000ff",
      "",
      "#cccccc",
      "#999999",
    ]);
  });

  it("steps through graduated classes, with a colour for missing numbers", () => {
    const style = layer({
      kind: "graduated",
      field: "pop",
      classes: [
        { min: 0, max: 10, color: "#111111" },
        { min: 10, max: 20, color: "#222222" },
      ],
      otherColor: "#999999",
    }).style;
    expect(colorExpression(style)).toEqual([
      "case",
      ["==", ["typeof", ["get", "pop"]], "number"],
      ["step", ["get", "pop"], "#111111", 10, "#222222"],
      "#999999",
    ]);
  });

  it("falls back to the single colour when a field is missing", () => {
    expect(colorExpression(layer({ kind: "categorized", field: null }).style)).toBe("#ff0000");
  });
});

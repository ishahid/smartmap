import { describe, expect, it } from "vitest";
import {
  colorExpression,
  defaultStyle,
  layerIdFromSource,
  selectionLayersFor,
  sourceId,
  styleLayersFor,
  type StyledLayer,
} from "./layerStyle";
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

describe("filters and selection", () => {
  it("adds the user filter to every style layer", () => {
    const user = ["==", ["get", "TYPE"], "road"] as const;
    for (const l of styleLayersFor(layer({ label: { field: "NAME", size: 12, color: "#000000" } }, { filter: user as never }))) {
      expect("filter" in l && l.filter).toEqual(["all", expect.anything(), user]);
    }
    // Without one, the geometry filter is used alone.
    const fill = styleLayersFor(layer())[0];
    expect("filter" in fill && JSON.stringify(fill.filter)).toMatch(/^\["in",/);
  });

  it("maps sources back to layer ids", () => {
    expect(layerIdFromSource(sourceId("12"))).toBe("12");
    expect(layerIdFromSource("openmaptiles")).toBeNull();
  });

  it("highlights selected features by id from the layer's own source", () => {
    expect(selectionLayersFor("7", [])).toEqual([]);
    const layers = selectionLayersFor("7", [3, 9]);
    expect(layers.map((l) => l.type)).toEqual(["fill", "line", "line", "circle"]);
    for (const l of layers) {
      expect("source" in l && l.source).toBe("sm-7");
      expect(JSON.stringify("filter" in l && l.filter)).toContain('["in",["id"],["literal",[3,9]]]');
    }
  });
});

describe("annotation layers", () => {
  const annotation = (style: Partial<LayerStyle> = {}) => styleLayersFor(layer(style, { annotation: true }));

  it("draws every kind with fixed ids and types", () => {
    const layers = annotation();
    expect(layers.map((l) => [l.id.replace("sm-abc-", ""), l.type])).toEqual([
      ["fill", "fill"],
      ["outline", "line"],
      ["line", "line"],
      ["point-circle", "circle"],
      ["marker", "symbol"],
      ["text", "symbol"],
    ]);
    // Changing the layer's point shape must not change any layer type (see "never reuses a layer id").
    expect(annotation({ pointShape: "star" }).map((l) => l.type)).toEqual(layers.map((l) => l.type));
  });

  it("lets each feature override the layer style", () => {
    const [fill, outline, line] = annotation({ color: "#123456", lineWidth: 3 });
    expect(fill.paint).toMatchObject({ "fill-color": ["coalesce", ["get", "color"], "#123456"] });
    expect(outline.paint).toMatchObject({ "line-color": ["coalesce", ["get", "strokeColor"], expect.any(String)] });
    expect(line.paint).toMatchObject({ "line-width": ["coalesce", ["get", "width"], 3] });
  });

  it("shows text annotations' text and labels other kinds from a field", () => {
    const text = annotation().find((l) => l.id.endsWith("-text"))!;
    expect(text.layout).toMatchObject({ "text-field": ["coalesce", ["get", "text"], ""] });
    const labelled = annotation({ label: { field: "name", size: 12, color: "#000000" } });
    expect(labelled.map((l) => l.id.replace("sm-abc-", ""))).toContain("label");
  });
});

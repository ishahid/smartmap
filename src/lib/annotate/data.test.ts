import { describe, expect, it } from "vitest";
import type { AnyFeature } from "../features";
import {
  annotationLayerData,
  annotationsFromFeatures,
  kindForMode,
  mergeEdits,
  newProperties,
  offset,
  restoreAnnotations,
  withNewIds,
} from "./data";
import type { AnnotationFeature } from "./types";

const note = (id: string, x: number, extra: object = {}): AnnotationFeature => ({
  type: "Feature",
  id,
  geometry: { type: "Point", coordinates: [x, 0] },
  properties: { ...newProperties("point"), ...extra },
});

describe("annotation data", () => {
  it("builds layer data numbered by position, keeping properties", () => {
    const data = annotationLayerData("Notes", [note("a", 1, { name: "A" }), note("b", 3)]);
    expect(data.geojson.features.map((f) => f.id)).toEqual([0, 1]);
    expect(data.geojson.features[0].properties).toMatchObject({ name: "A", kind: "point" });
    expect(data).toMatchObject({ format: "Annotations", geometryType: "Mixed", featureCount: 2, bbox: [1, 0, 3, 0] });
    expect(annotationLayerData("Empty", []).bbox).toBeNull();
  });

  it("gives text annotations default text", () => {
    expect(newProperties("text")).toEqual({ kind: "text", name: "", description: "", text: "Text" });
    expect(newProperties("line").text).toBeUndefined();
  });

  it("restores saved annotations and drops malformed ones", () => {
    const restored = restoreAnnotations({
      type: "FeatureCollection",
      features: [
        { type: "Feature", id: "keep-me", geometry: { type: "Point", coordinates: [1, 2] }, properties: { kind: "marker", name: "M", shape: "star", size: 9, color: "#ff0000", junk: 1 } },
        { type: "Feature", id: "keep-me", geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] }, properties: { kind: "bogus", size: "big" } },
        { type: "Feature", geometry: { type: "LineString", coordinates: [[0, 0]] }, properties: {} },
        { type: "Feature", geometry: { type: "MultiPoint", coordinates: [[0, 0]] }, properties: {} },
        { type: "Feature", geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
        "nonsense",
      ],
    });
    expect(restored).toHaveLength(3);
    expect(restored[0]).toMatchObject({ id: "keep-me", properties: { kind: "marker", name: "M", shape: "star", size: 9, color: "#ff0000" } });
    expect(restored[0].properties).not.toHaveProperty("junk");
    // A duplicate id gets a new one; an unknown kind falls back to the geometry's.
    expect(restored[1].id).not.toBe("keep-me");
    expect(restored[1].properties).toEqual({ kind: "line", name: "", description: "" });
    expect(restored[2].properties.kind).toBe("polygon");
    expect(restoreAnnotations(null)).toEqual([]);
  });

  it("turns data-layer features into annotations, splitting multi-part shapes", () => {
    const features: AnyFeature[] = [
      { type: "Feature", properties: { NAME: "Twin lakes" }, geometry: { type: "MultiPolygon", coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], [[[5, 5], [6, 5], [6, 6], [5, 5]]]] } },
      { type: "Feature", properties: { NAME: "Nowhere" }, geometry: null },
      { type: "Feature", properties: { NAME: "Road" }, geometry: { type: "LineString", coordinates: [[0, 0], [2, 2]] } },
    ];
    const notes = annotationsFromFeatures(features, ["NAME"]);
    expect(notes.map((n) => [n.geometry.type, n.properties.kind, n.properties.name])).toEqual([
      ["Polygon", "polygon", "Twin lakes"],
      ["Polygon", "polygon", "Twin lakes"],
      ["LineString", "line", "Road"],
    ]);
    expect(new Set(notes.map((n) => n.id)).size).toBe(3);
  });

  it("copies with new ids and moves copies", () => {
    const original = [note("a", 1)];
    const [copy] = offset(withNewIds(original), 0.5, -1);
    expect(copy.id).not.toBe("a");
    expect(copy.geometry).toEqual({ type: "Point", coordinates: [1.5, -1] });
    expect(original[0].geometry).toEqual({ type: "Point", coordinates: [1, 0] }); // untouched
  });

  it("names kinds after terra-draw modes", () => {
    expect(kindForMode("linestring")).toBe("line");
    expect(kindForMode("rectangle")).toBe("rectangle");
    expect(kindForMode("text")).toBe("text");
    expect(kindForMode("something-new")).toBe("polygon");
  });

  it("merges terra-draw edits: moved, kept, deleted and new features", () => {
    const previous = [note("a", 1, { name: "A" }), note("b", 2), note("c", 3), note("d", 4)];
    const merged = mergeEdits(
      previous,
      [
        { id: "new", geometry: { type: "Point", coordinates: [9, 9] }, mode: "marker" },
        { id: "a", geometry: { type: "Point", coordinates: [10, 10] }, mode: "point" },
        { id: "c", geometry: { type: "Point", coordinates: [3, 0] }, mode: "point" },
      ],
      new Set(["d"]),
    );
    expect(merged.map((f) => f.id)).toEqual(["a", "c", "d", "new"]); // b was deleted
    expect(merged[0]).toMatchObject({ geometry: { coordinates: [10, 10] }, properties: { name: "A" } });
    expect(merged[3].properties.kind).toBe("marker");
  });
});

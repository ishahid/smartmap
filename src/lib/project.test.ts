import { describe, expect, it } from "vitest";
import { DEFAULT_BASEMAP } from "./map/basemaps";
import {
  basemapOrDefault,
  fileName,
  isProjectFile,
  projectName,
  restoreStyle,
  sortPaths,
  withProjectExtension,
} from "./project";
import { defaultStyle } from "./style/layerStyle";

describe("project names and paths", () => {
  it("takes the file name from Unix and Windows paths", () => {
    expect(fileName("/Users/me/maps/trip.smartmap")).toBe("trip.smartmap");
    expect(fileName("C:\\maps\\trip.smartmap")).toBe("trip.smartmap");
  });

  it("names a project after its file, or Untitled", () => {
    expect(projectName(null)).toBe("Untitled");
    expect(projectName("/maps/Trip 2026.SMARTMAP")).toBe("Trip 2026");
  });

  it("adds the extension only when missing", () => {
    expect(withProjectExtension("/maps/trip")).toBe("/maps/trip.smartmap");
    expect(withProjectExtension("/maps/trip.smartmap")).toBe("/maps/trip.smartmap");
    expect(isProjectFile("/maps/world.shp")).toBe(false);
  });

  it("falls back to the default basemap for unknown ids", () => {
    expect(basemapOrDefault("positron").id).toBe("positron");
    expect(basemapOrDefault("gone").id).toBe(DEFAULT_BASEMAP.id);
  });
});

describe("restoreStyle", () => {
  const defaults = defaultStyle(0);

  it("returns a saved style unchanged", () => {
    const saved = {
      ...defaultStyle(3),
      kind: "categorized",
      field: "TYPE",
      categories: [{ value: "A", color: "#ff0000" }],
      pointShape: "star",
      label: { field: "NAME", size: 14, color: "#000000" },
    };
    expect(restoreStyle(structuredClone(saved), defaults)).toEqual(saved);
  });

  it("fills in settings an older project didn't have", () => {
    const restored = restoreStyle({ color: "#123456", label: { field: "NAME" } }, defaults);
    expect(restored.color).toBe("#123456");
    expect(restored.lineWidth).toBe(defaults.lineWidth);
    expect(restored.label).toEqual({ ...defaults.label, field: "NAME" });
  });

  it("ignores values of the wrong type and unknown shapes", () => {
    const restored = restoreStyle(
      { pointSize: "big", categories: "nope", field: 5, pointShape: "hexagon", extra: 1 },
      defaults,
    );
    expect(restored).toEqual(defaults);
  });

  it("uses the defaults when there's no style at all", () => {
    expect(restoreStyle(null, defaults)).toEqual(defaults);
    expect(restoreStyle([1, 2], defaults)).toEqual(defaults);
  });
});

describe("sortPaths", () => {
  it("sorts dropped files into projects, data, offline maps and the rest", () => {
    const sorted = sortPaths([
      "/maps/trip.smartmap",
      "/data/roads.SHP",
      "/data/roads.dbf",
      "/data/roads.shx",
      "/data/roads.prj",
      "C:\\data\\parks.gpkg",
      "/data/towns.csv",
      "/tiles/pakistan.pmtiles",
      "/tiles/old.mbtiles",
      "/docs/report.docx",
      "/data/folder",
    ]);
    expect(sorted.projects).toEqual(["/maps/trip.smartmap"]);
    // A Shapefile's other files (.dbf, .shx, .prj) are read with the .shp, so they're skipped quietly.
    expect(sorted.data).toEqual(["/data/roads.SHP", "C:\\data\\parks.gpkg", "/data/towns.csv"]);
    expect(sorted.tiles).toEqual(["/tiles/pakistan.pmtiles", "/tiles/old.mbtiles"]);
    expect(sorted.unsupported).toEqual(["/docs/report.docx", "/data/folder"]);
  });
});

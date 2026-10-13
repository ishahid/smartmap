import { describe, expect, it } from "vitest";
import { describeLayer } from "./layerSummary";

const base = {
  name: "world",
  format: "Shapefile",
  featureCount: 1251,
  emptyGeometries: 0,
  crs: "unknown (assumed WGS 84)",
  reprojected: false,
  warnings: [],
};

describe("describeLayer", () => {
  it("summarises a plain layer", () => {
    expect(describeLayer(base)).toBe("Loaded world (Shapefile): 1,251 features");
  });

  it("mentions missing geometry, reprojection and warnings", () => {
    const note = describeLayer({
      ...base,
      emptyGeometries: 2,
      reprojected: true,
      crs: "EPSG:32643",
      warnings: ["2 rows had no valid coordinates"],
    });
    expect(note).toBe(
      "Loaded world (Shapefile): 1,251 features (2 without geometry), converted from EPSG:32643. " +
        "Warning: 2 rows had no valid coordinates",
    );
  });
});

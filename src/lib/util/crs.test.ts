import { describe, expect, it } from "vitest";
import { coordinateWarning } from "./crs";

describe("coordinateWarning", () => {
  it("accepts plain lon/lat data with no .prj", () => {
    expect(coordinateWarning({ crsWkt: null, bbox: [-180, -90, 180, 83.6] })).toBeNull();
  });

  it("accepts geographic .prj files", () => {
    expect(coordinateWarning({ crsWkt: 'GEOGCS["GCS_WGS_1984"]', bbox: [52, 17, 87, 43] })).toBeNull();
  });

  it("warns about projected .prj files", () => {
    expect(coordinateWarning({ crsWkt: 'PROJCS["WGS_1984_UTM_Zone_43N"]', bbox: null })).toMatch(/projected/);
  });

  it("warns when coordinates are clearly not degrees", () => {
    expect(coordinateWarning({ crsWkt: null, bbox: [300000, 3700000, 400000, 3800000] })).toMatch(/outside/);
  });
});

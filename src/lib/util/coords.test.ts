import { describe, expect, it } from "vitest";
import { formatLngLat, toDms, wrapLongitude } from "./coords";

describe("wrapLongitude", () => {
  it("leaves normal values alone", () => {
    expect(wrapLongitude(73.05)).toBeCloseTo(73.05);
    expect(wrapLongitude(-122.4)).toBeCloseTo(-122.4);
  });
  it("wraps values outside [-180, 180)", () => {
    expect(wrapLongitude(190)).toBeCloseTo(-170);
    expect(wrapLongitude(-190)).toBeCloseTo(170);
    expect(wrapLongitude(540)).toBeCloseTo(-180);
  });
});

describe("toDms", () => {
  it("formats Rawalpindi's latitude", () => {
    expect(toDms(33.6, "N", "S")).toBe("33°36′00.0″N");
  });
  it("uses the negative hemisphere letter", () => {
    expect(toDms(-0.5, "E", "W")).toBe("0°30′00.0″W");
  });
  it("carries rounding up to the next minute and degree", () => {
    expect(toDms(10.99999, "N", "S")).toBe("11°00′00.0″N");
  });
});

describe("formatLngLat", () => {
  it("formats decimal degrees", () => {
    expect(formatLngLat(73.05, 33.6, "decimal")).toBe("Lat 33.60000  Lon 73.05000");
  });
  it("formats DMS", () => {
    expect(formatLngLat(73.05, 33.6, "dms")).toBe("33°36′00.0″N  73°03′00.0″E");
  });
});

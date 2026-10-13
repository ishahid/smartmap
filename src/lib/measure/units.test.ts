import { describe, expect, it } from "vitest";
import { formatArea, formatLength } from "./units";

describe("units", () => {
  it("formats lengths with a unit that suits the size", () => {
    expect(formatLength(8.123, "metric")).toBe("8.12 m");
    expect(formatLength(850, "metric")).toBe("850 m");
    expect(formatLength(12_345, "metric")).toBe("12.3 km");
    expect(formatLength(5_551_759, "metric")).toBe("5,552 km");
    expect(formatLength(500, "imperial")).toBe("1,640 ft");
    expect(formatLength(1609.344 * 3.21, "imperial")).toBe("3.21 mi");
    expect(formatLength(1852 * 4.05, "nautical")).toBe("4.05 nmi");
  });

  it("formats areas with a unit that suits the size", () => {
    expect(formatArea(640, "metric")).toBe("640 m²");
    expect(formatArea(32_000, "metric")).toBe("3.20 ha");
    expect(formatArea(1.25e9, "metric")).toBe("1,250 km²");
    expect(formatArea(100, "imperial")).toBe("1,076 ft²");
    expect(formatArea(4046.8564224 * 12.5, "imperial")).toBe("12.5 acres");
    expect(formatArea(2_589_988.11 * 4.1, "nautical")).toBe("4.10 mi²");
  });
});

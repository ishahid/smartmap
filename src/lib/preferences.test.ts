import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, parsePreferences, Preferences } from "./preferences.svelte";

describe("preferences", () => {
  it("reads stored values back", () => {
    const stored = { theme: "dark", units: "nautical", coordFormat: "dms", basemap: "none" };
    expect(parsePreferences(stored)).toEqual(stored);
  });

  it("uses the default for anything missing or not valid", () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences("dark")).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences({ theme: "purple", units: 3, coordFormat: "utm", basemap: "gone-basemap" })).toEqual(
      DEFAULT_PREFERENCES,
    );
    expect(parsePreferences({ units: "imperial" })).toEqual({ ...DEFAULT_PREFERENCES, units: "imperial" });
  });

  it("holds the values as a store", () => {
    const prefs = new Preferences({ ...DEFAULT_PREFERENCES, theme: "light" });
    expect(prefs.theme).toBe("light");
    prefs.units = "imperial";
    expect(prefs.values()).toEqual({ ...DEFAULT_PREFERENCES, theme: "light", units: "imperial" });
  });
});

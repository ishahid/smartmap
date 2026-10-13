/**
 * Preferences: settings that belong to the user, not to a project. They're
 * kept in the webview's localStorage (like the Recent list, lib/recent.ts),
 * which the desktop app keeps between runs.
 *
 * App.svelte saves them whenever one changes. Anything read back is checked,
 * so a missing or hand-edited value falls back to its default.
 */
import { BASEMAPS, DEFAULT_BASEMAP } from "./map/basemaps";
import { UNIT_SYSTEMS, type UnitSystem } from "./measure/units";
import { isTheme, type Theme } from "./shell/theme";
import type { CoordFormat } from "./util/coords";

const STORAGE_KEY = "smartmap.preferences";

/** The preferences as plain data (what's stored). */
export interface PreferenceValues {
  /** Light, dark, or follow the OS. */
  theme: Theme;
  /** Units for measurements (measure tool, identify, statistics). */
  units: UnitSystem;
  /** How the status bar shows the mouse position. */
  coordFormat: CoordFormat;
  /** The basemap new projects start with (an id from lib/map/basemaps.ts). */
  basemap: string;
}

export const DEFAULT_PREFERENCES: PreferenceValues = {
  theme: "system",
  units: "metric",
  coordFormat: "decimal",
  basemap: DEFAULT_BASEMAP.id,
};

export const COORD_FORMATS: { id: CoordFormat; label: string }[] = [
  { id: "decimal", label: "Decimal degrees (33.6844°)" },
  { id: "dms", label: "Degrees, minutes, seconds (33°41′04″)" },
];

/** Reads stored preferences, using the default for anything missing or not valid. */
export function parsePreferences(value: unknown): PreferenceValues {
  const saved = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const d = DEFAULT_PREFERENCES;
  return {
    theme: isTheme(saved.theme) ? saved.theme : d.theme,
    units: UNIT_SYSTEMS.some((u) => u.id === saved.units) ? (saved.units as UnitSystem) : d.units,
    coordFormat: COORD_FORMATS.some((c) => c.id === saved.coordFormat) ? (saved.coordFormat as CoordFormat) : d.coordFormat,
    basemap: BASEMAPS.some((b) => b.id === saved.basemap) ? (saved.basemap as string) : d.basemap,
  };
}

export function readPreferences(): PreferenceValues {
  try {
    return parsePreferences(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function writePreferences(values: PreferenceValues) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Not worth bothering the user about: they're only lost at the next start.
  }
}

/** The preferences as a store: change a field and everything that shows it updates. */
export class Preferences {
  theme = $state<Theme>(DEFAULT_PREFERENCES.theme);
  units = $state<UnitSystem>(DEFAULT_PREFERENCES.units);
  coordFormat = $state<CoordFormat>(DEFAULT_PREFERENCES.coordFormat);
  basemap = $state(DEFAULT_PREFERENCES.basemap);

  constructor(values: PreferenceValues = DEFAULT_PREFERENCES) {
    this.theme = values.theme;
    this.units = values.units;
    this.coordFormat = values.coordFormat;
    this.basemap = values.basemap;
  }

  /** The current values, e.g. for writePreferences(). Reading it inside an $effect tracks every field. */
  values(): PreferenceValues {
    return { theme: this.theme, units: this.units, coordFormat: this.coordFormat, basemap: this.basemap };
  }
}

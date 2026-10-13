/**
 * Light and dark appearance. "System" follows the OS setting (and changes with
 * it); "Light" and "Dark" fix it.
 *
 * The colours are CSS variables in app.css. They follow the OS through the
 * `prefers-color-scheme` media query, unless <html> has `data-theme="light"`
 * or `data-theme="dark"`, which applyTheme() sets. The desktop app also tells
 * the window (title bar, menus, dialogs) which theme to use: see setAppTheme in api.ts.
 */

export const THEMES = [
  { id: "system", label: "Use System Setting" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const;

export type Theme = (typeof THEMES)[number]["id"];

/** True if `value` is one of THEMES' ids. */
export function isTheme(value: unknown): value is Theme {
  return THEMES.some((t) => t.id === value);
}

/** Sets or clears <html data-theme>, which app.css uses to override the OS setting. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement) {
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

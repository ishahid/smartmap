/**
 * The "Recent projects" list. It's kept in the webview's localStorage, which
 * the desktop app keeps between runs. Storage can fail (e.g. disk full), and
 * the list is only a convenience, so failures are ignored.
 */
import { fileName, projectName } from "./project";

const STORAGE_KEY = "smartmap.recentProjects";
export const MAX_RECENT = 10;

/** `list` with `path` moved (or added) to the front, at most MAX_RECENT long. */
export function withRecent(list: string[], path: string): string[] {
  return [path, ...list.filter((p) => p !== path)].slice(0, MAX_RECENT);
}

/** `list` without `path` (e.g. a project that no longer exists). */
export function withoutRecent(list: string[], path: string): string[] {
  return list.filter((p) => p !== path);
}

export function readRecent(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((p) => typeof p === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function writeRecent(list: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Not worth bothering the user about.
  }
}

/** "trip — maps": the project name and its folder, to tell same-named projects apart. */
export function recentLabel(path: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const folder = slash > 0 ? fileName(path.slice(0, slash)) : "";
  return folder ? `${projectName(path)} — ${folder}` : projectName(path);
}

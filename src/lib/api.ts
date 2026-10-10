/**
 * Typed wrappers around the Rust commands in src-tauri/src/commands.rs.
 * Keep every `invoke` call in this file so the Rust ↔ TypeScript contract lives in one place.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";

export interface AppInfo {
  name: string;
  version: string;
  os: string;
  arch: string;
}

/** Returns build information from the Rust side, or a browser placeholder when run with `npm run dev`. */
export async function getAppInfo(): Promise<AppInfo> {
  if (!isTauri()) {
    return { name: "SmartMap", version: "dev (browser)", os: "web", arch: "-" };
  }
  return invoke<AppInfo>("app_info");
}

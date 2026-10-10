/**
 * One place to import MapLibre from, so its worker is configured before any map is created.
 *
 * MapLibre 6 runs tile parsing in a separate worker file and finds it from `import.meta.url`,
 * but only when the page is served over http(s). Tauri serves the packaged app from
 * `tauri://localhost` on macOS/Linux, and Vite's dev pre-bundling moves the file, so we
 * hand MapLibre the worker URL ourselves.
 */
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

setWorkerUrl(workerUrl);

export * from "maplibre-gl";

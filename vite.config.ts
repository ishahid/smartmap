import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Tauri sets TAURI_DEV_HOST when developing on a mobile device / remote host.
const host = process.env.TAURI_DEV_HOST;

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [svelte()],
  // Keep Rust compiler errors visible in the terminal.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**", "**/legacy/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    // All three platform web views (WebView2, WKWebView, WebKitGTK) support ES2022.
    target: "es2022",
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // MapLibre alone is ~1 MB; chunk size matters little for a local desktop app.
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});

<script lang="ts">
  /** Help → About SmartMap (SmartMap → About SmartMap on macOS): version, history and credits. */
  import type { AppInfo } from "../api";
  import icon from "../../../src-tauri/app-icon.svg?url";
  import Dialog from "./Dialog.svelte";

  let { info, onClose }: { info: AppInfo | null; onClose: () => void } = $props();
</script>

<Dialog title="About SmartMap" {onClose}>
  <div class="top">
    <img src={icon} alt="" width="64" height="64" />
    <div>
      <div class="name">SmartMap</div>
      {#if info}
        <div class="muted">Version {info.version} · {info.os}/{info.arch}</div>
      {/if}
      <div>A simple desktop GIS viewer and annotation tool.</div>
    </div>
  </div>

  <p>
    SmartMap began in 2004 as <em>SmartMap: Cosmetic Layer Designer for GIS</em>, a Master of Computer Science project at
    the University of Arid Agriculture, Rawalpindi, written in C++ with Qt 3 by
    <strong>Muhammad Imran Shahid</strong> and <strong>Shahzad Anwar</strong>. SmartMap 2 is a rebuild of it with Rust,
    Tauri, Svelte and MapLibre.
  </p>

  <p class="muted">
    Built with Tauri, Svelte, MapLibre GL JS, terra-draw, the geo, proj4rs, rusqlite and shapefile crates, and Protomaps
    basemap styles. Online basemaps by OpenFreeMap; map data © OpenStreetMap contributors.
  </p>
  <p class="muted">© 2004–2026 Muhammad Imran Shahid. Released under the MIT licence.</p>
</Dialog>

<style>
  .top {
    display: flex;
    gap: 14px;
    align-items: center;
    margin: 8px 0 4px;
  }
  .name {
    font-size: 18px;
    font-weight: 600;
  }
  p {
    line-height: 1.45;
  }
  .muted {
    color: var(--muted);
    font-size: 12px;
  }
</style>

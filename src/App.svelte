<script lang="ts">
  import { onMount } from "svelte";
  import MapView from "./lib/map/MapView.svelte";
  import { BASEMAPS, DEFAULT_BASEMAP } from "./lib/map/basemaps";
  import { formatLngLat, type CoordFormat } from "./lib/util/coords";
  import { getAppInfo, type AppInfo } from "./lib/api";

  let basemapId = $state(DEFAULT_BASEMAP.id);
  let basemap = $derived(BASEMAPS.find((b) => b.id === basemapId) ?? DEFAULT_BASEMAP);
  let globe = $state(false);
  let coordFormat = $state<CoordFormat>("decimal");
  let cursor = $state<{ lng: number; lat: number } | null>(null);
  let zoom = $state(0);
  let info = $state<AppInfo | null>(null);

  let cursorText = $derived(cursor ? formatLngLat(cursor.lng, cursor.lat, coordFormat) : "—");

  onMount(async () => {
    info = await getAppInfo();
  });
</script>

<div class="shell">
  <header class="toolbar">
    <strong class="brand">SmartMap</strong>
    <label>
      Basemap
      <select bind:value={basemapId}>
        {#each BASEMAPS as b (b.id)}
          <option value={b.id}>{b.label}</option>
        {/each}
      </select>
    </label>
    <label><input type="checkbox" bind:checked={globe} /> Globe</label>
  </header>

  <main class="map-area">
    <MapView {basemap} {globe} onCursor={(c) => (cursor = c)} onZoom={(z) => (zoom = z)} />
  </main>

  <footer class="statusbar">
    <button
      class="coords"
      title="Click to switch between decimal degrees and DMS"
      onclick={() => (coordFormat = coordFormat === "decimal" ? "dms" : "decimal")}
    >
      {cursorText}
    </button>
    <span>Zoom {zoom.toFixed(2)}</span>
    <span class="spacer"></span>
    {#if info}
      <span class="muted">{info.name} {info.version} · {info.os}/{info.arch}</span>
    {/if}
  </footer>
</div>

<style>
  .shell {
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100%;
  }
  .toolbar,
  .statusbar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 6px 12px;
    background: var(--panel);
    border-color: var(--border);
    border-style: solid;
    border-width: 0;
  }
  .toolbar {
    border-bottom-width: 1px;
  }
  .statusbar {
    border-top-width: 1px;
    font-variant-numeric: tabular-nums;
  }
  .brand {
    color: var(--accent);
  }
  .map-area {
    position: relative;
  }
  .coords {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    min-width: 260px;
    text-align: left;
  }
  .spacer {
    flex: 1;
  }
  .muted {
    color: var(--muted);
  }
  select,
  input {
    font: inherit;
  }
</style>

<script lang="ts">
  import { onMount } from "svelte";
  import MapView from "./lib/map/MapView.svelte";
  import { BASEMAPS, DEFAULT_BASEMAP } from "./lib/map/basemaps";
  import type { MapLayer } from "./lib/map/types";
  import { LayerList } from "./lib/layers.svelte";
  import LayerPanel from "./lib/panel/LayerPanel.svelte";
  import StyleEditor from "./lib/panel/StyleEditor.svelte";
  import { formatLngLat, type CoordFormat } from "./lib/util/coords";
  import { describeLayer } from "./lib/util/layerSummary";
  import { getAppInfo, inDesktopApp, openFile, pickDataFiles, type AppInfo, type LayerData } from "./lib/api";

  let basemapId = $state(DEFAULT_BASEMAP.id);
  let basemap = $derived(BASEMAPS.find((b) => b.id === basemapId) ?? DEFAULT_BASEMAP);
  let globe = $state(false);
  let coordFormat = $state<CoordFormat>("decimal");
  let cursor = $state<{ lng: number; lat: number } | null>(null);
  let zoom = $state(0);
  let info = $state<AppInfo | null>(null);

  /** The data layers on the map (see lib/layers.svelte.ts). */
  const list = new LayerList();
  let loading = $state(false);
  /** The latest status-bar message, and whether it's an error. */
  let message = $state<{ text: string; error: boolean } | null>(null);

  let mapView: MapView;

  let cursorText = $derived(cursor ? formatLngLat(cursor.lng, cursor.lat, coordFormat) : "—");

  onMount(async () => {
    info = await getAppInfo();
  });

  /** File → Open: pick one or more files and load each into a layer. */
  async function openFiles() {
    if (!inDesktopApp) {
      message = { text: "Opening files needs the desktop app (npm run app:dev).", error: true };
      return;
    }
    const paths = await pickDataFiles();
    if (paths.length === 0) return;

    loading = true;
    const notes: string[] = [];
    let lastBbox: MapLayer["data"]["bbox"] = null;
    let failed = false;

    for (const path of paths) {
      try {
        // One file can hold several layers (a GeoPackage with many tables).
        for (const data of await openFile(path)) {
          list.add(data);
          lastBbox = data.bbox ?? lastBbox;
          notes.push(describeLayer(data));
          if (data.warnings.length > 0) failed = true;
        }
      } catch (error) {
        failed = true;
        notes.push(error instanceof Error ? error.message : String(error));
      }
    }

    loading = false;
    message = { text: notes.join(" · "), error: failed };
    if (lastBbox) mapView.fitBounds(lastBbox);
  }

  // Debug hook for `npm run dev` in a plain browser, where the Open dialog can't work:
  // `__smartmapAddLayer(await (await fetch("/some.json")).json())` in the console,
  // with JSON from the dump_layer example (a list of layers).
  if (import.meta.env.DEV && !inDesktopApp) {
    (window as unknown as Record<string, unknown>).__smartmapAddLayer = (data: LayerData | LayerData[]) => {
      const loaded = Array.isArray(data) ? data : [data];
      loaded.forEach((d) => list.add(d));
      message = { text: loaded.map(describeLayer).join(" · "), error: loaded.some((d) => d.warnings.length > 0) };
      const bbox = [...loaded].reverse().find((d) => d.bbox)?.bbox;
      if (bbox) mapView.fitBounds(bbox);
    };
  }

  function zoomToLayer(layer: MapLayer) {
    if (layer.data.bbox) mapView.fitBounds(layer.data.bbox);
  }

  /** Ctrl+O (Cmd+O on macOS) opens files, like most desktop apps. */
  function onKeydown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
      event.preventDefault();
      openFiles();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="shell">
  <header class="toolbar">
    <strong class="brand">SmartMap</strong>
    <button onclick={openFiles} disabled={loading} title="Open a data file (Ctrl/Cmd+O)">
      {loading ? "Opening…" : "Open…"}
    </button>
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

  <main>
    <aside class="sidebar">
      <LayerPanel {list} onZoom={zoomToLayer} />
      {#if list.selected}
        <StyleEditor {list} layer={list.selected} />
      {/if}
    </aside>
    <div class="map-area">
      <MapView
        bind:this={mapView}
        {basemap}
        {globe}
        layers={list.layers}
        onCursor={(c) => (cursor = c)}
        onZoom={(z) => (zoom = z)}
      />
    </div>
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
    {#if message}
      <span class="message" class:error={message.error} title={message.text}>{message.text}</span>
    {/if}
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
    min-width: 0;
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
  main {
    display: grid;
    grid-template-columns: 290px 1fr;
    min-height: 0;
  }
  .sidebar {
    background: var(--bg);
    border-right: 1px solid var(--border);
    padding: 10px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .coords {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .coords {
    min-width: 260px;
    text-align: left;
  }
  .message {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .message.error {
    color: #cf222e;
  }
  .spacer {
    flex: 1;
  }
  .muted {
    color: var(--muted);
    white-space: nowrap;
  }
  select,
  input,
  .toolbar button {
    font: inherit;
  }
</style>

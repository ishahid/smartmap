<script lang="ts">
  import { onMount } from "svelte";
  import MapView from "./lib/map/MapView.svelte";
  import { BASEMAPS, DEFAULT_BASEMAP } from "./lib/map/basemaps";
  import { colorForIndex } from "./lib/map/layerStyle";
  import type { MapLayer } from "./lib/map/types";
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

  /**
   * Data layers on the map, bottom first.
   * `$state.raw` (not `$state`) because Svelte would otherwise wrap every
   * coordinate of every feature in a reactive proxy: slow for big files, and
   * MapLibre can't pass proxies to its worker. With `.raw`, we replace the
   * array instead of changing it in place, and Svelte notices the new array.
   */
  let layers = $state.raw<MapLayer[]>([]);
  /** How many layers have been opened so far; drives colours and ids. */
  let openedCount = 0;
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
          addLayer(data);
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

  /** Puts a loaded layer on top of the map, with the next colour in the palette. */
  function addLayer(data: LayerData) {
    const index = openedCount++;
    layers = [...layers, { id: String(index), data, color: colorForIndex(index) }];
  }

  // Debug hook for `npm run dev` in a plain browser, where the Open dialog can't work:
  // `__smartmapAddLayer(await (await fetch("/some.json")).json())` in the console,
  // with JSON from the dump_layer example (a list of layers).
  if (import.meta.env.DEV && !inDesktopApp) {
    (window as unknown as Record<string, unknown>).__smartmapAddLayer = (data: LayerData | LayerData[]) => {
      const list = Array.isArray(data) ? data : [data];
      list.forEach(addLayer);
      message = { text: list.map(describeLayer).join(" · "), error: list.some((d) => d.warnings.length > 0) };
      const bbox = [...list].reverse().find((d) => d.bbox)?.bbox;
      if (bbox) mapView.fitBounds(bbox);
    };
  }

  function removeLayer(id: string) {
    layers = layers.filter((layer) => layer.id !== id);
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

  <main class="map-area">
    <MapView
      bind:this={mapView}
      {basemap}
      {globe}
      {layers}
      onCursor={(c) => (cursor = c)}
      onZoom={(z) => (zoom = z)}
    />

    {#if layers.length > 0}
      <!-- A simple list for now; step 4 turns this into the full layer panel. -->
      <aside class="layers" aria-label="Layers">
        <h2>Layers</h2>
        <ul>
          {#each [...layers].reverse() as layer (layer.id)}
            <li>
              <span class="swatch" style:background={layer.color}></span>
              <button
                class="name"
                title={`${layer.data.path}\n${layer.data.format} · ${layer.data.geometryType} · ${layer.data.crs}\nClick to zoom to layer`}
                onclick={() => zoomToLayer(layer)}
              >
                {layer.data.name}
              </button>
              <span class="count">{layer.data.featureCount.toLocaleString()}</span>
              <button class="remove" title="Remove layer" aria-label={`Remove ${layer.data.name}`} onclick={() => removeLayer(layer.id)}>×</button>
            </li>
          {/each}
        </ul>
      </aside>
    {/if}
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
  .layers {
    position: absolute;
    top: 10px;
    left: 10px;
    width: 240px;
    max-height: calc(100% - 60px);
    overflow: auto;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 2px 8px rgb(0 0 0 / 15%);
    padding: 8px;
  }
  .layers h2 {
    font-size: 12px;
    margin: 0 0 6px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .layers ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .layers li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 0;
  }
  .swatch {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    flex: none;
  }
  .layers .name {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .layers button.name,
  .layers button.remove,
  .coords {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .layers button.remove {
    color: var(--muted);
    font-size: 16px;
    line-height: 1;
    padding: 0 2px;
  }
  .layers button.remove:hover {
    color: var(--fg);
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

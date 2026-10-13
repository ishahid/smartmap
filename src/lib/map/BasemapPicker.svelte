<script lang="ts">
  /**
   * Choosing the basemap: none, an OpenFreeMap style (online), or an offline
   * map file (PMTiles or MBTiles). For Protomaps files there's also a colour
   * scheme, and "?" explains how to get an offline map.
   */
  import type { MapDocument } from "../document.svelte";
  import { fileName } from "../project";
  import { BASEMAPS, OFFLINE_BASEMAP_ID } from "./basemaps";
  import { FLAVORS, isProtomaps } from "./offline";
  import OfflineHelp from "./OfflineHelp.svelte";

  let { doc, onOpenOffline, disabled = false }: { doc: MapDocument; onOpenOffline: () => void; disabled?: boolean } =
    $props();

  /** A menu entry that opens a file instead of choosing a basemap. */
  const OPEN_FILE = "open-file";
  let showHelp = $state(false);

  let offlineLabel = $derived.by(() => {
    if (!doc.offlineMap) return "";
    const name = fileName(doc.offlineMap.path);
    return doc.offlineInfo ? name : `${name} (not found)`;
  });
  let showFlavors = $derived(
    doc.basemapId === OFFLINE_BASEMAP_ID && doc.offlineMap !== null && doc.offlineInfo !== null && isProtomaps(doc.offlineInfo),
  );

  function choose(event: Event & { currentTarget: HTMLSelectElement }) {
    const value = event.currentTarget.value;
    if (value === OPEN_FILE) {
      // Put the menu back on the current basemap; the file dialog decides what happens next.
      event.currentTarget.value = doc.basemapId;
      onOpenOffline();
    } else {
      doc.basemapId = value;
    }
  }
</script>

<div class="picker">
  <label>
    Basemap
    <select value={doc.basemapId} onchange={choose} {disabled}>
      {#each BASEMAPS as b (b.id)}
        <option value={b.id}>{b.label}</option>
      {/each}
      {#if doc.offlineMap}
        <option value={OFFLINE_BASEMAP_ID} disabled={!doc.offlineInfo}>Offline: {offlineLabel}</option>
      {/if}
      <option value={OPEN_FILE}>Open offline map…</option>
    </select>
  </label>
  {#if showFlavors && doc.offlineMap}
    <select
      aria-label="Colour scheme"
      title="Colour scheme"
      value={doc.offlineMap.flavor}
      onchange={(e) => doc.setFlavor(e.currentTarget.value)}
    >
      {#each FLAVORS as f (f.id)}
        <option value={f.id}>{f.label}</option>
      {/each}
    </select>
  {/if}
  <button
    class="help"
    aria-label="Getting offline maps"
    title="Getting offline maps"
    aria-expanded={showHelp}
    onclick={() => (showHelp = !showHelp)}>?</button
  >
</div>
{#if showHelp}
  <OfflineHelp onClose={() => (showHelp = false)} />
{/if}

<style>
  .picker {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
  select,
  button {
    font: inherit;
  }
  .help {
    width: 22px;
    height: 22px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--muted);
    cursor: pointer;
  }
</style>

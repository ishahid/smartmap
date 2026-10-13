<script lang="ts">
  /**
   * The toolbar search box: type some text, get a list of features in the
   * visible layers whose attributes contain it. ↑/↓ and Enter pick a result;
   * Esc closes the list.
   */
  import type { MapLayer } from "../map/types";
  import { searchLayers, type SearchHit, type SearchResult } from "./search";

  interface Props {
    layers: MapLayer[];
    onPick: (hit: SearchHit) => void;
  }
  let { layers, onPick }: Props = $props();

  const LIMIT = 100;
  let query = $state("");
  let open = $state(false);
  let active = $state(0);
  let result = $state<SearchResult>({ hits: [], truncated: false });

  // Search a moment after typing stops rather than on every key, since big
  // layers take a little while to scan.
  $effect(() => {
    const text = query;
    const current = layers;
    const timer = setTimeout(() => {
      result = searchLayers(current, text, LIMIT);
      active = 0;
    }, 200);
    return () => clearTimeout(timer);
  });

  function pick(hit: SearchHit) {
    onPick(hit);
    open = false;
  }

  function onKeydown(event: KeyboardEvent) {
    const count = result.hits.length;
    if (event.key === "ArrowDown" && count > 0) {
      active = (active + 1) % count;
      open = true;
    } else if (event.key === "ArrowUp" && count > 0) {
      active = (active - 1 + count) % count;
    } else if (event.key === "Enter" && count > 0) {
      pick(result.hits[active]);
    } else if (event.key === "Escape") {
      open = false;
    } else {
      return;
    }
    event.preventDefault();
  }
</script>

<div class="search">
  <input
    type="search"
    placeholder="Search features…"
    aria-label="Search features in visible layers"
    bind:value={query}
    onfocus={() => (open = true)}
    oninput={() => (open = true)}
    onblur={() => (open = false)}
    onkeydown={onKeydown}
  />
  {#if open && query.trim() !== ""}
    <!-- preventDefault on mousedown keeps focus in the input, so the click lands before the list closes. -->
    <ul class="results" role="listbox" aria-label="Search results">
      {#each result.hits as hit, index (`${hit.layerId}/${hit.featureId}`)}
        <li role="option" aria-selected={index === active}>
          <button class:active={index === active} onmousedown={(e) => e.preventDefault()} onclick={() => pick(hit)}>
            <span class="label">{hit.label}</span>
            <span class="detail">{hit.layerName} · {hit.match}</span>
          </button>
        </li>
      {:else}
        <li class="none">No matches in the visible layers.</li>
      {/each}
      {#if result.truncated}
        <li class="none">Showing the first {LIMIT}; type more to narrow it down.</li>
      {/if}
    </ul>
  {/if}
</div>

<style>
  .search {
    position: relative;
  }
  input {
    font: inherit;
    width: 180px;
  }
  .results {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    z-index: 10;
    width: 320px;
    max-height: 360px;
    overflow: auto;
    margin: 0;
    padding: 4px 0;
    list-style: none;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgb(0 0 0 / 15%);
  }
  button {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 4px 10px;
    font: inherit;
    color: inherit;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
  }
  button.active,
  button:hover {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .label,
  .detail {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  .detail {
    font-size: 12px;
    color: var(--muted);
  }
  .none {
    padding: 4px 10px;
    color: var(--muted);
  }
</style>

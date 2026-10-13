<script lang="ts">
  /**
   * Shows the attributes of the feature clicked on the map. When several
   * features overlap at the click, a list at the top picks between them.
   */
  import { featureLabel, toText } from "../features";
  import type { FeatureHit, MapLayer } from "../map/types";

  interface Props {
    hits: FeatureHit[];
    /** Which hit is shown (index into `hits`). */
    current: number;
    /** All layers, to look up each hit's layer. */
    layers: MapLayer[];
    onPick: (index: number) => void;
    onZoom: (hit: FeatureHit) => void;
    onShowInTable: (hit: FeatureHit) => void;
    onClose: () => void;
  }
  let { hits, current, layers, onPick, onZoom, onShowInTable, onClose }: Props = $props();

  /** Each hit with its layer and feature, skipping any whose layer has gone. */
  let entries = $derived(
    hits.flatMap((hit) => {
      const layer = layers.find((l) => l.id === hit.layerId);
      const feature = layer?.data.geojson.features[hit.featureId];
      return layer && feature ? [{ hit, layer, feature, label: featureLabel(feature, layer.data.fields) }] : [];
    }),
  );
  let shown = $derived(entries[Math.min(current, entries.length - 1)]);
</script>

{#if shown}
  <aside class="identify" aria-label="Feature attributes">
    <header>
      <h2 title={shown.label}>{shown.label}</h2>
      <button class="close" aria-label="Close" onclick={onClose}>×</button>
    </header>

    {#if entries.length > 1}
      <p class="muted">{entries.length} features here:</p>
      <ul class="picker">
        {#each entries as entry, index (`${entry.hit.layerId}/${entry.hit.featureId}`)}
          <li>
            <button class:current={entry === shown} onclick={() => onPick(index)}>
              <span class="label">{entry.label}</span>
              <span class="layer">{entry.layer.name}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <p class="muted">{shown.layer.name} · feature {shown.hit.featureId}</p>
    {#if shown.layer.data.fields.length === 0}
      <p class="muted">This layer has no attributes.</p>
    {:else}
      <table>
        <tbody>
          {#each shown.layer.data.fields as field (field)}
            {@const value = shown.feature.properties?.[field]}
            <tr>
              <th scope="row">{field}</th>
              <td class:empty={toText(value) === ""} class:number={typeof value === "number"}>
                {toText(value) === "" ? "—" : toText(value)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    <footer>
      <button onclick={() => onZoom(shown.hit)}>Zoom to</button>
      <button onclick={() => onShowInTable(shown.hit)}>Show in table</button>
    </footer>
  </aside>
{/if}

<style>
  .identify {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 2;
    width: 280px;
    max-height: calc(100% - 60px);
    overflow: auto;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgb(0 0 0 / 15%);
    padding: 8px 10px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  h2 {
    flex: 1;
    font-size: 14px;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .close {
    font-size: 16px;
    color: var(--muted);
  }
  .muted {
    color: var(--muted);
    margin: 4px 0;
    font-size: 12px;
  }
  .picker {
    list-style: none;
    margin: 0 0 6px;
    padding: 0;
    max-height: 140px;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .picker button {
    display: flex;
    width: 100%;
    gap: 6px;
    padding: 3px 6px;
    text-align: left;
  }
  .picker button.current {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .picker .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .picker .layer {
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: 2px 4px;
    border-bottom: 1px solid var(--border);
    overflow-wrap: anywhere;
  }
  th {
    color: var(--muted);
    font-weight: normal;
    width: 40%;
  }
  td.number {
    font-variant-numeric: tabular-nums;
  }
  td.empty {
    color: var(--muted);
  }
  footer {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  button {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  footer button {
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 2px 8px;
    background: var(--panel);
  }
</style>

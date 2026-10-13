<script lang="ts">
  /**
   * Statistics of a numeric field of the selected layer: count, min, max,
   * mean, median, standard deviation and sum. Covers the features the layer's
   * filter shows, or only the selected ones.
   */
  import { numericFieldsOf } from "../features";
  import { filterPredicate } from "../filter";
  import type { MapLayer } from "../map/types";
  import type { Selection } from "../selection.svelte";
  import { fieldStats, formatStat } from "../stats";

  let { layer, selection }: { layer: MapLayer; selection: Selection } = $props();

  let numeric = $derived([...numericFieldsOf(layer.data)]);
  let chosen = $state<string | null>(null);
  /** The chosen field, or the first numeric one (also after switching to another layer). */
  let field = $derived(chosen && numeric.includes(chosen) ? chosen : (numeric[0] ?? null));
  let selectedOnly = $state(false);
  let selectedHere = $derived(selection.layerId === layer.id ? selection.count : 0);

  /** The features counted: the selection, or everything the filter lets through. */
  let features = $derived.by(() => {
    const all = layer.data.geojson.features;
    if (selectedOnly && selectedHere > 0) return [...selection.ids].map((id) => all[id]).filter(Boolean);
    const keep = filterPredicate(layer.filter, numericFieldsOf(layer.data));
    return all.filter((f) => keep(f.properties));
  });
  let stats = $derived(field ? fieldStats(features.map((f) => f.properties?.[field])) : null);
</script>

<section class="stats" aria-label="Statistics">
  <h3>Statistics</h3>
  {#if numeric.length === 0}
    <p class="muted">This layer has no numeric fields.</p>
  {:else}
    <label class="row">
      <span>Field</span>
      <select value={field} onchange={(e) => (chosen = e.currentTarget.value)}>
        {#each numeric as name (name)}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </label>
    {#if selectedHere > 0}
      <label class="check">
        <input type="checkbox" bind:checked={selectedOnly} /> Selected features only ({selectedHere.toLocaleString()})
      </label>
    {/if}
    {#if stats}
      <dl>
        <dt>Count</dt>
        <dd>{stats.count.toLocaleString()}{#if stats.missing > 0}<span class="muted"> ({stats.missing.toLocaleString()} blank)</span>{/if}</dd>
        <dt>Minimum</dt>
        <dd>{formatStat(stats.min)}</dd>
        <dt>Maximum</dt>
        <dd>{formatStat(stats.max)}</dd>
        <dt>Mean</dt>
        <dd>{formatStat(stats.mean)}</dd>
        <dt>Median</dt>
        <dd>{formatStat(stats.median)}</dd>
        <dt>Std. deviation</dt>
        <dd>{formatStat(stats.stdDev)}</dd>
        <dt>Sum</dt>
        <dd>{formatStat(stats.sum)}</dd>
      </dl>
    {:else}
      <p class="muted">No numbers in {field} for these features.</p>
    {/if}
  {/if}
</section>

<style>
  h3 {
    font-size: 11px;
    margin: 12px 0 4px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 4px 0;
  }
  .row > span {
    width: 72px;
    flex: none;
    color: var(--muted);
  }
  .row select {
    flex: 1;
    min-width: 0;
    font: inherit;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 4px 0;
  }
  dl {
    display: grid;
    grid-template-columns: 100px 1fr;
    gap: 2px 6px;
    margin: 6px 0 0;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .muted {
    color: var(--muted);
    font-size: 12px;
  }
</style>

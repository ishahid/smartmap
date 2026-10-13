<script lang="ts">
  /** The measure tool's panel over the map: mode, units, the reading, and how to use it. */
  import { inDesktopApp } from "../api";
  import type { MeasureTool } from "./measure.svelte";
  import { formatArea, formatLength, UNIT_SYSTEMS } from "./units";

  let { tool }: { tool: MeasureTool } = $props();

  let reading = $derived.by(() => {
    const r = tool.result;
    if (!r) return null;
    return tool.mode === "distance"
      ? formatLength(r.length, tool.units)
      : `${formatArea(r.area, tool.units)} · perimeter ${formatLength(r.perimeter, tool.units)}`;
  });
</script>

<section class="measure" aria-label="Measure">
  <div class="bar">
    <div class="modes" role="radiogroup" aria-label="What to measure">
      <button role="radio" aria-checked={tool.mode === "distance"} class:active={tool.mode === "distance"} onclick={() => tool.setMode("distance")}
        >Distance</button
      >
      <button role="radio" aria-checked={tool.mode === "area"} class:active={tool.mode === "area"} onclick={() => tool.setMode("area")}
        >Area</button
      >
    </div>
    <select aria-label="Units" bind:value={tool.units}>
      {#each UNIT_SYSTEMS as system (system.id)}
        <option value={system.id}>{system.label}</option>
      {/each}
    </select>
    <button onclick={() => tool.clear()} disabled={tool.points.length === 0}>Clear</button>
    <button class="close" aria-label="Stop measuring" title="Stop measuring (Esc twice)" onclick={() => tool.stop()}>×</button>
  </div>
  <p class="reading" aria-live="polite">
    {#if reading}
      <strong>{reading}</strong>{#if !inDesktopApp}<span class="muted"> (approximate in the browser)</span>{/if}
    {:else}
      <span class="muted">
        Click on the map to {tool.mode === "distance" ? "start a line" : "place the corners"}. Double-click or Enter finishes,
        Backspace removes the last point, Esc clears.
      </span>
    {/if}
  </p>
</section>

<style>
  .measure {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 3;
    max-width: min(420px, calc(100% - 70px));
    padding: 6px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgb(0 0 0 / 15%);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .modes {
    display: flex;
  }
  .modes button {
    border-radius: 0;
  }
  .modes button:first-child {
    border-radius: 4px 0 0 4px;
  }
  .modes button:last-child {
    border-radius: 0 4px 4px 0;
    border-left: none;
  }
  button,
  select {
    font: inherit;
  }
  button {
    color: inherit;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 8px;
    cursor: pointer;
  }
  button.active {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    border-color: var(--accent);
  }
  .close {
    margin-left: auto;
    border: none;
    background: none;
    font-size: 16px;
    color: var(--muted);
  }
  .reading {
    margin: 6px 2px 0;
    font-variant-numeric: tabular-nums;
  }
  .reading strong {
    font-size: 15px;
  }
  .muted {
    color: var(--muted);
    font-size: 12px;
  }
</style>

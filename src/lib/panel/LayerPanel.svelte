<script lang="ts">
  /**
   * The layer list: top layer first. Drag the ⋮⋮ handle (or focus it and press
   * ↑/↓) to reorder, tick to show/hide, double-click a name to rename it, and
   * click a layer to edit its style.
   *
   * Reordering uses pointer events rather than HTML drag-and-drop, because
   * Tauri's own file drag-and-drop (used in step 10) intercepts HTML drag
   * events on Windows.
   */
  import { numericFieldsOf } from "../features";
  import { isActive } from "../filter";
  import type { LayerList } from "../layers.svelte";
  import type { MapLayer } from "../map/types";
  import { swatchBackground } from "./swatch";

  interface Props {
    list: LayerList;
    onZoom: (layer: MapLayer) => void;
    /** Opens the attribute table for a layer. */
    onTable: (layer: MapLayer) => void;
    /** Writes a layer to a GeoPackage or GeoJSON file. */
    onExport: (layer: MapLayer) => void;
    /** Adds a new, empty annotation layer. */
    onNewAnnotationLayer: () => void;
    /** Starts or stops editing an annotation layer. */
    onToggleEdit: (layer: MapLayer) => void;
    /** Removes a layer (the app decides whether it can be undone). */
    onRemove: (layer: MapLayer) => void;
    /** The annotation layer being edited, if any. */
    editingId: string | null;
  }
  let { list, onZoom, onTable, onExport, onNewAnnotationLayer, onToggleEdit, onRemove, editingId }: Props = $props();

  /** Shown top-first, the reverse of the drawing order. */
  let shown = $derived([...list.layers].reverse());

  let listElement = $state<HTMLUListElement>();
  /** The layer being dragged, and the gap (0 = above the first row) it would drop into. */
  let dragId = $state<string | null>(null);
  let dropGap = $state(0);
  /** The layer whose name is being edited. */
  let renamingId = $state<string | null>(null);

  /** Converts a position in the top-first list to an index in the bottom-first list. */
  const toListIndex = (shownIndex: number) => list.layers.length - 1 - shownIndex;

  function startDrag(event: PointerEvent, layer: MapLayer) {
    dragId = layer.id;
    dropGap = shown.indexOf(layer);
    // Keep receiving pointer events even when the pointer leaves the handle.
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function dragMove(event: PointerEvent) {
    if (!dragId || !listElement) return;
    // The gap is the number of rows whose middle is above the pointer.
    const rows = [...listElement.querySelectorAll<HTMLElement>(":scope > li")];
    dropGap = rows.filter((row) => {
      const box = row.getBoundingClientRect();
      return box.top + box.height / 2 < event.clientY;
    }).length;
  }

  function endDrag() {
    if (!dragId) return;
    const from = shown.findIndex((layer) => layer.id === dragId);
    // Dropping below its own position: the row itself no longer takes up a slot.
    const to = dropGap > from ? dropGap - 1 : dropGap;
    list.move(dragId, toListIndex(to));
    dragId = null;
  }

  function handleKey(event: KeyboardEvent, layer: MapLayer) {
    const shownIndex = shown.indexOf(layer);
    if (event.key === "ArrowUp" && shownIndex > 0) list.move(layer.id, toListIndex(shownIndex - 1));
    else if (event.key === "ArrowDown" && shownIndex < shown.length - 1) list.move(layer.id, toListIndex(shownIndex + 1));
    else return;
    event.preventDefault();
  }

  function finishRename(layer: MapLayer, input: HTMLInputElement) {
    const name = input.value.trim();
    if (name && name !== layer.name) list.update(layer.id, { name });
    renamingId = null;
  }

  /** Focuses and selects an input as soon as it appears (a Svelte "action"). */
  function autofocus(input: HTMLInputElement) {
    input.focus();
    input.select();
  }
</script>

<section class="layers" aria-label="Layers">
  <header>
    <h2>Layers</h2>
    <button class="add" onclick={onNewAnnotationLayer} title="Add a layer to draw shapes, markers and text on">+ Annotation layer</button>
  </header>
  {#if shown.length === 0}
    <p class="empty">No layers yet. Use Open… (Ctrl/Cmd+O) to add data files, or add an annotation layer to draw on.</p>
  {:else}
    <ul bind:this={listElement} class:dragging={dragId !== null}>
      {#each shown as layer, index (layer.id)}
        <li
          class:selected={layer.id === list.selectedId}
          class:drop-above={dragId !== null && dropGap === index}
          class:drop-below={dragId !== null && dropGap === shown.length && index === shown.length - 1}
          class:being-dragged={layer.id === dragId}
          class:editing={layer.id === editingId}
        >
          <button
            class="handle"
            title="Drag to reorder (or focus and press ↑/↓)"
            aria-label={`Move ${layer.name}`}
            onpointerdown={(e) => startDrag(e, layer)}
            onpointermove={dragMove}
            onpointerup={endDrag}
            onpointercancel={() => (dragId = null)}
            onkeydown={(e) => handleKey(e, layer)}>⋮⋮</button
          >
          <input
            type="checkbox"
            checked={layer.visible}
            title="Show or hide"
            aria-label={`Show ${layer.name}`}
            onchange={(e) => list.update(layer.id, { visible: e.currentTarget.checked })}
          />
          <span class="swatch" style:background={swatchBackground(layer.style)}></span>
          {#if renamingId === layer.id}
            <input
              class="rename"
              value={layer.name}
              aria-label="Layer name"
              use:autofocus
              onblur={(e) => finishRename(layer, e.currentTarget)}
              onkeydown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") renamingId = null;
              }}
            />
          {:else}
            <button
              class="name"
              title={`${layer.data.path}\nClick to edit style and filter, double-click to rename`}
              onclick={() => (list.selectedId = list.selectedId === layer.id ? null : layer.id)}
              ondblclick={() => (renamingId = layer.id)}
            >
              {layer.name}
            </button>
          {/if}
          {#if isActive(layer.filter, numericFieldsOf(layer.data))}
            <span class="count filtered" title="Filtered: only matching features are shown (edit in the layer's style panel)"
              >⧩ {layer.data.featureCount.toLocaleString()}</span
            >
          {:else}
            <span class="count" title="Features">{layer.data.featureCount.toLocaleString()}</span>
          {/if}
          {#if layer.annotations}
            <button
              class="icon"
              class:on={layer.id === editingId}
              title={layer.id === editingId ? "Stop editing" : "Draw and edit annotations"}
              aria-label={`${layer.id === editingId ? "Stop editing" : "Edit"} ${layer.name}`}
              aria-pressed={layer.id === editingId}
              onclick={() => onToggleEdit(layer)}>✎</button
            >
          {/if}
          <button
            class="icon"
            title="Attribute table"
            aria-label={`Attribute table of ${layer.name}`}
            onclick={() => onTable(layer)}>▦</button
          >
          <button class="icon" title="Zoom to layer" aria-label={`Zoom to ${layer.name}`} onclick={() => onZoom(layer)}
            >⌖</button
          >
          <button
            class="icon"
            title="Export to GeoPackage or GeoJSON"
            aria-label={`Export ${layer.name}`}
            onclick={() => onExport(layer)}>⤓</button
          >
          <button class="icon" title="Remove layer" aria-label={`Remove ${layer.name}`} onclick={() => onRemove(layer)}
            >×</button
          >
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 0 6px;
  }
  .add {
    font-size: 12px;
    color: var(--accent);
  }
  li.editing {
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .icon.on {
    color: var(--accent);
  }
  h2 {
    font-size: 11px;
    margin: 0;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .empty {
    color: var(--muted);
    margin: 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  ul.dragging {
    cursor: grabbing;
    user-select: none;
  }
  li {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 4px;
    border-radius: 4px;
    border-top: 2px solid transparent;
    border-bottom: 2px solid transparent;
  }
  li.selected {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  li.drop-above {
    border-top-color: var(--accent);
  }
  li.drop-below {
    border-bottom-color: var(--accent);
  }
  li.being-dragged {
    opacity: 0.5;
  }
  button {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .handle {
    cursor: grab;
    color: var(--muted);
    letter-spacing: -2px;
    touch-action: none;
  }
  input[type="checkbox"] {
    margin: 0;
  }
  .swatch {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    flex: none;
    border: 1px solid rgb(0 0 0 / 15%);
  }
  .name,
  .rename {
    flex: 1;
    min-width: 0;
    text-align: left;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rename {
    font: inherit;
    padding: 0 2px;
  }
  .count {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .count.filtered {
    color: var(--accent);
  }
  .icon {
    color: var(--muted);
    font-size: 15px;
    line-height: 1;
    padding: 0 2px;
  }
  .icon:hover,
  .handle:hover {
    color: var(--fg);
  }
</style>

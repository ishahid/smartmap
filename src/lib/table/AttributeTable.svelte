<script lang="ts">
  /**
   * The attribute table for one layer: a row per feature, a column per field.
   *
   * - Click a header to sort (again for descending, a third time for file order).
   * - Type under a header to show only rows containing that text.
   * - Click a row to select its feature; Ctrl/Cmd+click adds or removes one;
   *   Shift+click selects a range. The map highlights the selection, and a
   *   feature selected on the map scrolls its row into view.
   * - Only rows matching the layer's filter are listed.
   *
   * Virtual scrolling: a layer can have 100,000 rows, far too many to put in
   * the page at once. Every row has the same height, so from the scroll
   * position we know which rows are on screen, and only those (plus a few
   * either side) are drawn. A tall empty "sheet" gives the scrollbar its size.
   */
  import { untrack } from "svelte";
  import { numericFieldsOf, toText } from "../features";
  import { filterPredicate } from "../filter";
  import type { MapLayer } from "../map/types";
  import type { Selection } from "../selection.svelte";
  import { columnWidth, nextSort, rowRange, tableRows, type SortOrder } from "./rows";

  interface Props {
    layer: MapLayer;
    /** All layers, for the layer picker. */
    layers: MapLayer[];
    selection: Selection;
    onPickLayer: (layerId: string) => void;
    onZoomTo: (layerId: string, featureIds: number[]) => void;
    onClose: () => void;
  }
  let { layer, layers, selection, onPickLayer, onZoomTo, onClose }: Props = $props();

  const ROW_HEIGHT = 24;
  /** Header: field names plus the search boxes. */
  const HEADER_HEIGHT = 2 * ROW_HEIGHT;
  /** Extra rows drawn above and below the visible ones, so fast scrolling doesn't show gaps. */
  const OVERSCAN = 8;
  const ID_WIDTH = 56;

  let sort = $state<SortOrder | null>(null);
  /** Search text per field. */
  let searches = $state<Record<string, string>>({});

  let features = $derived(layer.data.geojson.features);
  let fields = $derived(layer.data.fields);
  let numeric = $derived(numericFieldsOf(layer.data));
  let keep = $derived(filterPredicate(layer.filter, numeric));
  /** Feature ids to list, in display order. */
  let rows = $derived(tableRows(features, { keep, searches, sort }));

  let widths = $derived(fields.map((field) => columnWidth(field, features)));
  let columns = $derived([ID_WIDTH, ...widths].map((w) => `${w}px`).join(" "));
  let sheetWidth = $derived(ID_WIDTH + widths.reduce((sum, w) => sum + w, 0));

  let scroller = $state<HTMLDivElement>();
  let scrollTop = $state(0);
  let viewHeight = $state(0);
  let first = $derived(Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN));
  let last = $derived(Math.min(rows.length, Math.ceil((scrollTop + viewHeight) / ROW_HEIGHT) + OVERSCAN));
  let visible = $derived(rows.slice(first, last));

  let selectedHere = $derived(selection.layerId === layer.id ? selection.count : 0);
  /** Where a Shift+click range starts: the last row clicked. */
  let anchor: number | null = null;

  function clickRow(event: MouseEvent, id: number) {
    if (event.shiftKey && anchor !== null && selection.layerId === layer.id) {
      selection.select(layer.id, rowRange(rows, anchor, id));
      return; // keep the anchor, like file managers do
    }
    if (event.ctrlKey || event.metaKey) selection.toggle(layer.id, id);
    else selection.select(layer.id, [id]);
    anchor = id;
  }

  // A new filter, search or sort shows a different list, so start again at the top.
  $effect(() => {
    void [layer.filter, JSON.stringify(searches), sort];
    if (scroller) scroller.scrollTop = 0;
  });

  // When a feature is selected elsewhere (map click, search), scroll its row into view.
  // `rows` is read with untrack so that sorting or searching doesn't jump back to it.
  $effect(() => {
    const focus = selection.focus;
    if (focus === null || selection.layerId !== layer.id || !scroller) return;
    const index = untrack(() => rows.indexOf(focus));
    if (index < 0) return;
    const top = index * ROW_HEIGHT;
    const rowsHeight = scroller.clientHeight - HEADER_HEIGHT;
    if (top < scroller.scrollTop || top + ROW_HEIGHT > scroller.scrollTop + rowsHeight) {
      scroller.scrollTop = Math.max(0, top - rowsHeight / 2);
    }
  });

  const display = (value: unknown) => toText(value);
</script>

<section class="table" aria-label="Attribute table">
  <div class="bar">
    <select aria-label="Layer" value={layer.id} onchange={(e) => onPickLayer(e.currentTarget.value)}>
      {#each [...layers].reverse() as l (l.id)}
        <option value={l.id}>{l.name}</option>
      {/each}
    </select>
    <span class="muted">
      {rows.length.toLocaleString()}
      {rows.length === features.length ? "rows" : `of ${features.length.toLocaleString()} rows`}
      {#if selectedHere > 0}· {selectedHere.toLocaleString()} selected{/if}
    </span>
    <button
      disabled={selectedHere === 0}
      onclick={() => onZoomTo(layer.id, [...selection.ids])}
      title="Zoom the map to the selected features">Zoom to selected</button
    >
    <button disabled={rows.length === 0} onclick={() => selection.select(layer.id, rows)} title="Select every listed row"
      >Select all</button
    >
    <button disabled={selectedHere === 0} onclick={() => selection.clear()}>Clear selection</button>
    <span class="spacer"></span>
    <button class="close" aria-label="Close attribute table" onclick={onClose}>×</button>
  </div>

  <div
    class="scroller"
    bind:this={scroller}
    bind:clientHeight={viewHeight}
    onscroll={() => (scrollTop = scroller!.scrollTop)}
  >
    <div class="sheet" style:width="{sheetWidth}px" style:height="{HEADER_HEIGHT + rows.length * ROW_HEIGHT}px">
      <div class="head" style:grid-template-columns={columns}>
        <div class="cell id">#</div>
        {#each fields as field (field)}
          <button
            class="cell heading"
            title={`Sort by ${field}`}
            onclick={() => (sort = nextSort(sort, field))}
            class:number={numeric.has(field)}
          >
            <span>{field}</span>
            {#if sort?.field === field}<span class="arrow">{sort.descending ? "▼" : "▲"}</span>{/if}
          </button>
        {/each}
        <div class="cell id"></div>
        {#each fields as field (field)}
          <input
            class="cell search"
            type="search"
            placeholder="Search"
            aria-label={`Search ${field}`}
            bind:value={searches[field]}
          />
        {/each}
      </div>

      {#each visible as id, i (id)}
        {@const properties = features[id].properties}
        <!-- Rows are clicked with the mouse; keyboard selection can come with the menus in step 10. -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="row"
          role="row"
          tabindex="-1"
          class:selected={selection.has(layer.id, id)}
          class:odd={(first + i) % 2 === 1}
          style:top="{HEADER_HEIGHT + (first + i) * ROW_HEIGHT}px"
          style:grid-template-columns={columns}
          onclick={(e) => clickRow(e, id)}
        >
          <div class="cell id">{id}</div>
          {#each fields as field (field)}
            <div class="cell" class:number={typeof properties?.[field] === "number"} title={display(properties?.[field])}>
              {display(properties?.[field])}
            </div>
          {/each}
        </div>
      {/each}
    </div>
    {#if rows.length === 0}
      <p class="empty">No rows match{layer.filter ? " the layer filter" : ""}{Object.values(searches).some((s) => s.trim()) ? " the searches" : ""}.</p>
    {/if}
  </div>
</section>

<style>
  .table {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--bg);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
    flex: none;
    white-space: nowrap;
  }
  .bar select,
  .bar button,
  .search {
    font: inherit;
  }
  .bar select {
    max-width: 200px;
  }
  .muted {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .spacer {
    flex: 1;
  }
  .close {
    font-size: 16px;
    color: var(--muted);
    background: none;
    border: none;
    cursor: pointer;
  }
  .scroller {
    flex: 1;
    min-height: 0;
    overflow: auto;
    position: relative;
  }
  .sheet {
    position: relative;
    min-width: 100%;
  }
  .head {
    position: sticky;
    top: 0;
    z-index: 1;
    display: grid;
    grid-auto-rows: 24px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
  }
  .row {
    position: absolute;
    left: 0;
    right: 0;
    height: 24px;
    display: grid;
    cursor: default;
  }
  /* Striped by row number, not DOM position, since rows are recycled while scrolling. */
  .row.odd {
    background: color-mix(in srgb, var(--panel) 60%, transparent);
  }
  .row:hover {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .row.selected {
    background: color-mix(in srgb, #00b4ff 30%, transparent);
  }
  .cell {
    padding: 0 6px;
    line-height: 24px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-right: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    min-width: 0;
    box-sizing: border-box;
  }
  .cell.number {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .cell.id {
    color: var(--muted);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .heading {
    display: flex;
    align-items: center;
    gap: 4px;
    font: inherit;
    font-weight: 600;
    color: inherit;
    background: none;
    border: none;
    border-right: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    cursor: pointer;
    text-align: left;
  }
  .heading.number {
    justify-content: flex-end;
  }
  .heading span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .arrow {
    font-size: 9px;
    color: var(--accent);
  }
  .search {
    margin: 2px 3px;
    height: 20px;
    padding: 0 4px;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: var(--bg);
    color: inherit;
    line-height: normal;
  }
  .empty {
    position: absolute;
    top: 56px;
    left: 12px;
    margin: 0;
    color: var(--muted);
  }
</style>

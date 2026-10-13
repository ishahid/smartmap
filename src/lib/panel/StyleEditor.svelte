<script lang="ts">
  /**
   * Style editor for the selected layer: opacity, single / categorized /
   * graduated colours, outline, line width, point size and shape, and labels.
   * Every change goes straight to the LayerList store, and MapView redraws.
   */
  import type { LayerList } from "../layers.svelte";
  import type { MapLayer } from "../map/types";
  import { categoryKey, formatRange, makeClasses, numericFields, uniqueCategories } from "../style/classify";
  import { RAMPS, rampColors } from "../style/colors";
  import { POINT_SHAPES, type ClassMethod, type LayerStyle, type StyleKind } from "../style/types";
  import { fieldStats, formatStat } from "../stats";

  interface Props {
    list: LayerList;
    layer: MapLayer;
  }
  let { list, layer }: Props = $props();

  let style = $derived(layer.style);
  let features = $derived(layer.data.geojson.features);
  let numeric = $derived(numericFields(features, layer.data.fields));

  // Only show the controls for the kinds of geometry the layer actually has.
  let kind = $derived(layer.data.geometryType);
  let hasPolygons = $derived(kind === "Polygon" || kind === "Mixed");
  let hasLines = $derived(kind === "Line" || kind === "Mixed");
  let hasPoints = $derived(kind === "Point" || kind === "Mixed");

  function set(changes: Partial<LayerStyle>) {
    list.updateStyle(layer.id, changes);
  }

  /** Regenerates graduated classes after the field, method, count or ramp changes. */
  function setGraduated(changes: Partial<LayerStyle>) {
    const next = { ...style, ...changes };
    const classes = next.field ? makeClasses(features, next.field, next.classCount, next.method, next.ramp) : [];
    set({ ...changes, classes });
  }

  function setCategoryField(field: string) {
    set({ field, categories: uniqueCategories(features, field) });
  }

  function setKind(next: StyleKind) {
    if (next === "categorized") {
      // Keep the current field if there is one; otherwise use the first.
      const field = style.field && layer.data.fields.includes(style.field) ? style.field : layer.data.fields[0];
      set({ kind: next, field: field ?? null, categories: field ? uniqueCategories(features, field) : [] });
    } else if (next === "graduated") {
      const field = style.field && numeric.includes(style.field) ? style.field : numeric[0];
      setGraduated({ kind: next, field: field ?? null });
    } else {
      set({ kind: next });
    }
  }

  function setCategoryColor(index: number, color: string) {
    set({ categories: style.categories.map((c, i) => (i === index ? { ...c, color } : c)) });
  }

  function setClassColor(index: number, color: string) {
    set({ classes: style.classes.map((c, i) => (i === index ? { ...c, color } : c)) });
  }

  /** How many features fall in each category, for the legend. */
  let categoryCounts = $derived.by(() => {
    const counts = new Map<string, number>();
    if (style.kind !== "categorized" || !style.field) return counts;
    for (const feature of features) {
      const key = categoryKey(feature.properties?.[style.field]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  });

  const SHAPE_SYMBOLS = { circle: "●", square: "■", triangle: "▲", diamond: "◆", star: "★" };

  const rampPreview = (name: string) => `linear-gradient(90deg, ${rampColors(name, 5).join(", ")})`;
</script>

<section class="editor" aria-label="Layer style">
  <header>
    <h2 title={layer.name}>{layer.name}</h2>
    <button class="close" aria-label="Close style editor" onclick={() => (list.selectedId = null)}>×</button>
  </header>
  <p class="info">
    {layer.data.format} · {layer.data.geometryType} · {layer.data.featureCount.toLocaleString()} features<br />
    CRS: {layer.data.crs}{layer.data.reprojected ? " (converted to WGS 84)" : ""}
  </p>
  {#each layer.data.warnings as warning, i (i)}
    <p class="warning">⚠ {warning}</p>
  {/each}

  <label class="row">
    <span>Opacity</span>
    <input
      type="range"
      min="0"
      max="1"
      step="0.05"
      value={layer.opacity}
      oninput={(e) => list.update(layer.id, { opacity: Number(e.currentTarget.value) })}
    />
    <output>{Math.round(layer.opacity * 100)}%</output>
  </label>

  <h3>Colour</h3>
  <!-- Annotation layers use one colour; each annotation can override it (in its own properties). -->
  {#if !layer.annotations}
  <label class="row">
    <span>Style</span>
    <select value={style.kind} onchange={(e) => setKind(e.currentTarget.value as StyleKind)}>
      <option value="single">Single colour</option>
      <option value="categorized" disabled={layer.data.fields.length === 0}>Categorized</option>
      <option value="graduated" disabled={numeric.length === 0}>Graduated</option>
    </select>
  </label>
  {/if}

  {#if style.kind === "single" || layer.annotations}
    <label class="row">
      <span>Colour</span>
      <input type="color" value={style.color} oninput={(e) => set({ color: e.currentTarget.value })} />
    </label>
  {:else if style.kind === "categorized"}
    <label class="row">
      <span>Field</span>
      <select value={style.field} onchange={(e) => setCategoryField(e.currentTarget.value)}>
        {#each layer.data.fields as field (field)}
          <option value={field}>{field}</option>
        {/each}
      </select>
    </label>
    <ul class="legend">
      {#each style.categories as category, i (category.value)}
        <li>
          <input
            type="color"
            value={category.color}
            aria-label={`Colour for ${category.value || "empty"}`}
            oninput={(e) => setCategoryColor(i, e.currentTarget.value)}
          />
          <span class="value" class:muted={category.value === ""}>{category.value === "" ? "(empty)" : category.value}</span>
          <span class="count">{categoryCounts.get(category.value) ?? 0}</span>
        </li>
      {/each}
      <li>
        <input
          type="color"
          value={style.otherColor}
          aria-label="Colour for other values"
          oninput={(e) => set({ otherColor: e.currentTarget.value })}
        />
        <span class="value muted">Other values</span>
      </li>
    </ul>
  {:else}
    <label class="row">
      <span>Field</span>
      <select value={style.field} onchange={(e) => setGraduated({ field: e.currentTarget.value })}>
        {#each numeric as field (field)}
          <option value={field}>{field}</option>
        {/each}
      </select>
    </label>
    <label class="row">
      <span>Method</span>
      <select value={style.method} onchange={(e) => setGraduated({ method: e.currentTarget.value as ClassMethod })}>
        <option value="quantile">Quantile (equal counts)</option>
        <option value="equal">Equal interval</option>
      </select>
    </label>
    <label class="row">
      <span>Classes</span>
      <input
        type="number"
        min="2"
        max="9"
        value={style.classCount}
        onchange={(e) => setGraduated({ classCount: Math.max(2, Math.min(9, Number(e.currentTarget.value) || 5)) })}
      />
    </label>
    <label class="row">
      <span>Ramp</span>
      <select value={style.ramp} onchange={(e) => setGraduated({ ramp: e.currentTarget.value })}>
        {#each Object.keys(RAMPS) as name (name)}
          <option value={name}>{name}</option>
        {/each}
      </select>
      <span class="ramp" style:background={rampPreview(style.ramp)}></span>
    </label>
    {@const range = style.field ? fieldStats(features.map((f) => f.properties?.[style.field!])) : null}
    {#if range}
      <p class="info">
        Values {formatStat(range.min)} to {formatStat(range.max)}, mean {formatStat(range.mean)}{range.missing > 0
          ? ` (${range.missing.toLocaleString()} blank)`
          : ""}
      </p>
    {/if}
    <ul class="legend">
      {#each style.classes as cls, i (i)}
        <li>
          <input
            type="color"
            value={cls.color}
            aria-label={`Colour for ${formatRange(cls)}`}
            oninput={(e) => setClassColor(i, e.currentTarget.value)}
          />
          <span class="value">{formatRange(cls)}</span>
        </li>
      {/each}
      <li>
        <input
          type="color"
          value={style.otherColor}
          aria-label="Colour for missing values"
          oninput={(e) => set({ otherColor: e.currentTarget.value })}
        />
        <span class="value muted">No value</span>
      </li>
    </ul>
  {/if}

  <h3>Symbol</h3>
  {#if hasPolygons}
    <label class="row">
      <span>Fill opacity</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={style.fillOpacity}
        oninput={(e) => set({ fillOpacity: Number(e.currentTarget.value) })}
      />
      <output>{Math.round(style.fillOpacity * 100)}%</output>
    </label>
  {/if}
  {#if hasPolygons || hasPoints}
    <label class="row">
      <span>Outline</span>
      <input type="color" value={style.strokeColor} oninput={(e) => set({ strokeColor: e.currentTarget.value })} />
      <input
        type="number"
        min="0"
        max="10"
        step="0.5"
        value={style.strokeWidth}
        aria-label="Outline width"
        title="Outline width (px)"
        oninput={(e) => set({ strokeWidth: Math.max(0, Number(e.currentTarget.value) || 0) })}
      />
      <span class="unit">px</span>
    </label>
  {/if}
  {#if hasLines}
    <label class="row">
      <span>Line width</span>
      <input
        type="number"
        min="0.5"
        max="20"
        step="0.5"
        value={style.lineWidth}
        oninput={(e) => set({ lineWidth: Math.max(0.5, Number(e.currentTarget.value) || 1) })}
      />
      <span class="unit">px</span>
    </label>
  {/if}
  {#if hasPoints}
    <label class="row">
      <span>Point size</span>
      <input
        type="range"
        min="1"
        max="20"
        step="0.5"
        value={style.pointSize}
        oninput={(e) => set({ pointSize: Number(e.currentTarget.value) })}
      />
      <output>{style.pointSize}</output>
    </label>
    <div class="row" role="radiogroup" aria-label="Point shape">
      <span>Shape</span>
      {#each POINT_SHAPES as shape (shape)}
        <button
          class="shape"
          class:active={style.pointShape === shape}
          role="radio"
          aria-checked={style.pointShape === shape}
          title={shape}
          onclick={() => set({ pointShape: shape })}
        >
          {SHAPE_SYMBOLS[shape]}
        </button>
      {/each}
    </div>
  {/if}

  <h3>Labels</h3>
  <label class="row">
    <span>Field</span>
    <select
      value={style.label.field ?? ""}
      onchange={(e) => set({ label: { ...style.label, field: e.currentTarget.value || null } })}
    >
      <option value="">None</option>
      {#each layer.data.fields as field (field)}
        <option value={field}>{field}</option>
      {/each}
    </select>
  </label>
  {#if style.label.field}
    <label class="row">
      <span>Text</span>
      <input
        type="color"
        value={style.label.color}
        oninput={(e) => set({ label: { ...style.label, color: e.currentTarget.value } })}
      />
      <input
        type="number"
        min="6"
        max="40"
        value={style.label.size}
        aria-label="Label size"
        title="Label size (px)"
        oninput={(e) => set({ label: { ...style.label, size: Math.max(6, Number(e.currentTarget.value) || 12) } })}
      />
      <span class="unit">px</span>
    </label>
  {/if}
</section>

<style>
  .editor {
    border-top: 1px solid var(--border);
    padding-top: 8px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  h2 {
    flex: 1;
    font-size: 13px;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  h3 {
    font-size: 11px;
    margin: 12px 0 4px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .close {
    font: inherit;
    font-size: 16px;
    color: var(--muted);
    background: none;
    border: none;
    cursor: pointer;
  }
  .info {
    color: var(--muted);
    margin: 4px 0;
    font-size: 12px;
  }
  .warning {
    color: #9a6700;
    margin: 4px 0;
    font-size: 12px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 4px 0;
  }
  .row > span:first-child {
    width: 72px;
    flex: none;
    color: var(--muted);
  }
  .row select {
    flex: 1;
    min-width: 0;
  }
  .row input[type="range"] {
    flex: 1;
    min-width: 0;
  }
  .row input[type="number"] {
    width: 52px;
  }
  .row output,
  .unit {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    min-width: 30px;
  }
  input[type="color"] {
    width: 28px;
    height: 20px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: none;
    flex: none;
  }
  select,
  input {
    font: inherit;
  }
  .ramp {
    width: 50px;
    height: 12px;
    border-radius: 2px;
    flex: none;
  }
  .legend {
    list-style: none;
    margin: 4px 0 0 78px;
    padding: 0;
    max-height: 220px;
    overflow: auto;
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 1px 0;
  }
  .legend .value {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .legend .count,
  .muted {
    color: var(--muted);
  }
  .shape {
    font: inherit;
    font-size: 14px;
    width: 24px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--fg);
    cursor: pointer;
  }
  .shape.active {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>

<script lang="ts">
  /**
   * Properties of the selected annotation: name, description, its text (for
   * text annotations), and style overrides that replace the layer's style for
   * this feature only. Each change is one undoable step, made when a field is
   * left (not on every keystroke).
   */
  import type { MapLayer } from "../map/types";
  import { POINT_SHAPES } from "../style/types";
  import type { AnnotationEditor } from "./editor.svelte";
  import { STYLE_OVERRIDES, type AnnotationFeature, type AnnotationProperties } from "./types";

  interface Props {
    editor: AnnotationEditor;
    layer: MapLayer;
    feature: AnnotationFeature;
  }
  let { editor, layer, feature }: Props = $props();

  let p = $derived(feature.properties);
  let style = $derived(layer.style);
  let kind = $derived(p.kind);
  let isShape = $derived(feature.geometry.type === "Polygon");
  let isLine = $derived(feature.geometry.type === "LineString");
  let hasOverrides = $derived(STYLE_OVERRIDES.some((key) => p[key] !== undefined));

  function set(changes: Partial<AnnotationProperties>, label = "Change annotation") {
    editor.updateProperties(layer.id, feature.id, changes, label);
  }

  /** Puts the keyboard focus in the text box right after a text annotation is placed. */
  function focusIfNew(input: HTMLInputElement) {
    if (editor.focusTextOf === feature.id) {
      input.focus();
      input.select();
      editor.focusTextOf = null;
    }
  }

  const SHAPE_SYMBOLS = { circle: "●", square: "■", triangle: "▲", diamond: "◆", star: "★" };
</script>

<section class="properties" aria-label="Annotation properties">
  <h3>Annotation · {kind}</h3>

  {#if kind === "text"}
    <label class="row">
      <span>Text</span>
      <!-- The key makes Svelte create a new box for another feature, so the focus check runs again. -->
      {#key feature.id}
        <input value={p.text ?? ""} use:focusIfNew onchange={(e) => set({ text: e.currentTarget.value }, "Edit text")} />
      {/key}
    </label>
  {/if}
  <label class="row">
    <span>Name</span>
    <input value={p.name} onchange={(e) => set({ name: e.currentTarget.value }, "Rename annotation")} />
  </label>
  <label class="row top">
    <span>Description</span>
    <textarea rows="2" value={p.description} onchange={(e) => set({ description: e.currentTarget.value }, "Edit description")}
    ></textarea>
  </label>

  <h3>Style for this annotation</h3>
  <label class="row">
    <span>{isShape ? "Fill" : "Colour"}</span>
    <input
      type="color"
      value={p.color ?? (kind === "text" ? style.label.color : style.color)}
      onchange={(e) => set({ color: e.currentTarget.value }, "Change colour")}
    />
    {#if p.color === undefined}<span class="muted">layer's</span>{/if}
  </label>
  {#if isShape || kind === "point" || kind === "marker"}
    <label class="row">
      <span>Outline</span>
      <input
        type="color"
        value={p.strokeColor ?? style.strokeColor}
        onchange={(e) => set({ strokeColor: e.currentTarget.value }, "Change outline")}
      />
      {#if p.strokeColor === undefined}<span class="muted">layer's</span>{/if}
    </label>
  {/if}
  {#if isShape || isLine}
    <label class="row">
      <span>Width</span>
      <input
        type="number"
        min="0"
        max="20"
        step="0.5"
        value={p.width ?? (isLine ? style.lineWidth : style.strokeWidth)}
        onchange={(e) => set({ width: Math.max(0, Number(e.currentTarget.value) || 0) }, "Change width")}
      />
      <span class="muted">px</span>
    </label>
  {/if}
  {#if isShape}
    <label class="row">
      <span>Fill opacity</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={p.fillOpacity ?? style.fillOpacity}
        onchange={(e) => set({ fillOpacity: Number(e.currentTarget.value) }, "Change fill opacity")}
      />
    </label>
  {/if}
  {#if kind === "point" || kind === "marker" || kind === "text"}
    <label class="row">
      <span>{kind === "text" ? "Text size" : "Size"}</span>
      <input
        type="number"
        min="2"
        max="64"
        value={p.size ?? (kind === "text" ? style.label.size : kind === "marker" ? Math.max(style.pointSize, 8) : style.pointSize)}
        onchange={(e) => set({ size: Math.max(2, Number(e.currentTarget.value) || 8) }, "Change size")}
      />
      <span class="muted">px</span>
    </label>
  {/if}
  {#if kind === "marker"}
    <div class="row">
      <span>Shape</span>
      <div class="shapes" role="radiogroup" aria-label="Marker shape">
        {#each POINT_SHAPES as shape (shape)}
          <button
            role="radio"
            aria-checked={(p.shape ?? "star") === shape}
            class:active={(p.shape ?? "star") === shape}
            title={shape}
            onclick={() => set({ shape }, "Change marker shape")}>{SHAPE_SYMBOLS[shape]}</button
          >
        {/each}
      </div>
    </div>
  {/if}
  {#if hasOverrides}
    <!-- Setting an override to undefined removes it, so the layer's style shows again. -->
    <button class="reset" onclick={() => set(Object.fromEntries(STYLE_OVERRIDES.map((key) => [key, undefined])), "Use layer style")}>
      Use the layer's style
    </button>
  {/if}
</section>

<style>
  .properties {
    border-top: 1px solid var(--border);
    padding-top: 4px;
  }
  h3 {
    font-size: 11px;
    margin: 10px 0 4px;
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
  .row.top {
    align-items: flex-start;
  }
  .row > span:first-child {
    width: 72px;
    flex: none;
    color: var(--muted);
  }
  .row input:not([type]),
  .row textarea {
    flex: 1;
    min-width: 0;
    font: inherit;
  }
  .row input[type="number"] {
    width: 56px;
    font: inherit;
  }
  .row input[type="range"] {
    flex: 1;
    min-width: 0;
  }
  input[type="color"] {
    width: 28px;
    height: 20px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: none;
  }
  .muted {
    color: var(--muted);
    font-size: 12px;
  }
  .shapes {
    display: flex;
    gap: 2px;
  }
  .shapes button,
  .reset {
    font: inherit;
    color: inherit;
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
  }
  .shapes button {
    width: 26px;
    height: 24px;
  }
  .shapes button.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }
  .reset {
    margin-top: 6px;
    padding: 2px 8px;
  }
</style>

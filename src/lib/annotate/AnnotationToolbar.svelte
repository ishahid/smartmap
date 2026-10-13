<script lang="ts">
  /**
   * Floating toolbar over the map while an annotation layer is being edited:
   * the drawing tools, snapping, undo/redo, and Done.
   */
  import type { History } from "../history.svelte";
  import { TOOLS, type AnnotationEditor } from "./editor.svelte";

  interface Props {
    editor: AnnotationEditor;
    history: History;
    /** Name of the layer being edited. */
    layerName: string;
    onUndo: () => void;
    onRedo: () => void;
  }
  let { editor, history, layerName, onUndo, onRedo }: Props = $props();

  const mod = navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl+";
</script>

<div class="toolbar" role="toolbar" aria-label={`Annotation tools for ${layerName}`}>
  <div class="tools">
    {#each TOOLS as tool (tool.id)}
      <button
        class:active={editor.tool === tool.id}
        title={tool.label}
        aria-label={tool.label}
        aria-pressed={editor.tool === tool.id}
        onclick={() => editor.setTool(tool.id)}>{tool.icon}</button
      >
    {/each}
  </div>
  <label title="Snap to vertices of nearby features while drawing">
    <input type="checkbox" bind:checked={editor.snapping} /> Snap
  </label>
  <div class="tools">
    <button
      disabled={!history.canUndo}
      title={history.undoLabel ? `Undo ${history.undoLabel} (${mod}Z)` : "Nothing to undo"}
      aria-label="Undo"
      onclick={onUndo}>↶</button
    >
    <button
      disabled={!history.canRedo}
      title={history.redoLabel ? `Redo ${history.redoLabel} (${mod}Shift+Z)` : "Nothing to redo"}
      aria-label="Redo"
      onclick={onRedo}>↷</button
    >
  </div>
  <button class="done" onclick={() => editor.stop()} title="Stop editing this layer">Done</button>
</div>
<div class="notes">
  {#if editor.tool === "select"}
    <p>Click a shape to select it. Drag to move, drag handles to reshape, Option/Alt+drag to rotate, Delete to remove.</p>
  {/if}
  {#if editor.uneditable > 0}
    <p class="warning">
      {editor.uneditable} shape{editor.uneditable === 1 ? "" : "s"} in this layer can't be edited (e.g. self-crossing) but stay as they are.
    </p>
  {/if}
</div>

<style>
  /* Top left of the map, clear of the zoom buttons on the right. */
  .toolbar {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgb(0 0 0 / 15%);
    white-space: nowrap;
    max-width: calc(100% - 70px);
    overflow-x: auto;
  }
  .tools {
    display: flex;
    gap: 2px;
  }
  button {
    font: inherit;
    min-width: 28px;
    height: 26px;
    color: inherit;
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: var(--panel);
  }
  button.active {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    border-color: var(--accent);
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .done {
    border-color: var(--border);
    padding: 0 10px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .notes {
    position: absolute;
    top: 48px;
    left: 10px;
    z-index: 3;
    max-width: min(420px, calc(100% - 70px));
    pointer-events: none;
  }
  .notes p {
    margin: 0 0 4px;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    background: color-mix(in srgb, var(--bg) 85%, transparent);
    color: var(--muted);
  }
  .notes .warning {
    color: #9a6700;
  }
</style>

<script lang="ts">
  /**
   * Layers from the open project whose files couldn't be found. They stay in
   * the project (and are saved back) until removed here, so a project opened
   * while a drive is unplugged doesn't lose them.
   */
  import type { MapDocument } from "../document.svelte";

  let { doc }: { doc: MapDocument } = $props();
</script>

{#if doc.missing.length > 0}
  <section class="missing" aria-label="Layers not found">
    <h2>Not found</h2>
    <p>These files couldn't be opened. They stay in the project until you remove them.</p>
    <ul>
      {#each doc.missing as layer, index (index)}
        <li>
          <span class="name" title={layer.path}>{layer.name}</span>
          <button
            title="Remove from the project"
            aria-label={`Remove ${layer.name} from the project`}
            onclick={() => doc.forgetMissing(layer)}>×</button
          >
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .missing {
    border: 1px solid color-mix(in srgb, #cf222e 40%, transparent);
    border-radius: 6px;
    padding: 8px;
  }
  h2 {
    font-size: 11px;
    margin: 0 0 4px;
    color: #cf222e;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  p {
    margin: 0 0 6px;
    color: var(--muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  button {
    font: inherit;
    font-size: 15px;
    line-height: 1;
    color: var(--muted);
    background: none;
    border: none;
    padding: 0 2px;
    cursor: pointer;
  }
  button:hover {
    color: var(--fg);
  }
</style>

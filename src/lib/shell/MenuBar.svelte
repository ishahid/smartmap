<script lang="ts">
  /**
   * An HTML menu bar, used only in a plain browser (`npm run dev`), where there
   * are no native menus. It shows the same `menuTemplate()` as the desktop app,
   * so every command can be tried in the browser too.
   */
  import { SHORTCUTS, shortcutLabel, type CommandId, type MenuEntry } from "./commands";

  interface Props {
    template: MenuEntry[];
    mac: boolean;
    onCommand: (id: CommandId) => void;
  }
  let { template, mac, onCommand }: Props = $props();

  /** The label of the open top-level menu, or null. */
  let open = $state<string | null>(null);

  function run(id: CommandId) {
    open = null;
    onCommand(id);
  }
</script>

<svelte:window
  onpointerdown={(e) => {
    if (open && !(e.target as Element).closest?.(".menubar")) open = null;
  }}
  onkeydown={(e) => {
    if (open && e.key === "Escape") open = null;
  }}
/>

{#snippet items(entries: MenuEntry[])}
  <ul role="menu">
    {#each entries as entry, i (i)}
      {#if entry.type === "separator"}
        <li role="separator"></li>
      {:else if entry.type === "command"}
        <li role="none">
          <button
            role={entry.checked === undefined ? "menuitem" : "menuitemcheckbox"}
            aria-checked={entry.checked}
            disabled={entry.enabled === false}
            onclick={() => run(entry.id)}
          >
            <span class="check">{entry.checked ? "✓" : ""}</span>
            <span class="label">{entry.label}</span>
            <span class="keys">{SHORTCUTS[entry.id] ? shortcutLabel(SHORTCUTS[entry.id]![0], mac) : ""}</span>
          </button>
        </li>
      {:else if entry.type === "submenu"}
        <li role="none" class="sub" class:off={entry.enabled === false}>
          <button role="menuitem" aria-haspopup="menu" disabled={entry.enabled === false}>
            <span class="check"></span>
            <span class="label">{entry.label}</span>
            <span class="keys">▸</span>
          </button>
          {@render items(entry.items)}
        </li>
      {/if}
    {/each}
  </ul>
{/snippet}

<nav class="menubar" aria-label="Menu">
  {#each template as menu (menu.type === "submenu" ? menu.label : "")}
    {#if menu.type === "submenu"}
      <div class="top">
        <button
          class:open={open === menu.label}
          aria-haspopup="menu"
          aria-expanded={open === menu.label}
          onclick={() => (open = open === menu.label ? null : menu.label)}
          onpointerenter={() => {
            // Once one menu is open, pointing at another opens that one, like a real menu bar.
            if (open) open = menu.label;
          }}>{menu.label}</button
        >
        {#if open === menu.label}
          {@render items(menu.items)}
        {/if}
      </div>
    {/if}
  {/each}
</nav>

<style>
  .menubar {
    display: flex;
    gap: 2px;
    padding: 2px 8px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    position: relative;
    z-index: 30;
  }
  .top {
    position: relative;
  }
  button {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: default;
    text-align: left;
  }
  .top > button:hover,
  .top > button.open {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
  }
  ul {
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 230px;
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 6px 24px rgb(0 0 0 / 20%);
  }
  li[role="separator"] {
    height: 1px;
    margin: 4px 6px;
    background: var(--border);
  }
  li > button {
    display: flex;
    width: 100%;
    gap: 6px;
    white-space: nowrap;
  }
  li > button:not(:disabled):hover {
    background: var(--accent);
    color: white;
  }
  li > button:disabled {
    color: var(--muted);
    opacity: 0.6;
  }
  .check {
    width: 14px;
  }
  .label {
    flex: 1;
  }
  .keys {
    color: inherit;
    opacity: 0.7;
    padding-left: 16px;
  }
  /* Submenus open to the side while pointed at. */
  .sub {
    position: relative;
  }
  .sub > ul {
    display: none;
    top: -5px;
    left: 100%;
  }
  .sub:not(.off):hover > ul {
    display: block;
  }
</style>

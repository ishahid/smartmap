<script lang="ts">
  /** Help → Keyboard Shortcuts. The list comes from the menus (commands.ts), so it can't go out of date. */
  import { shortcutGroups, type MenuEntry } from "./commands";
  import Dialog from "./Dialog.svelte";

  let { template, mac, onClose }: { template: MenuEntry[]; mac: boolean; onClose: () => void } = $props();

  let groups = $derived(shortcutGroups(template, mac));
</script>

<Dialog title="Keyboard shortcuts" width={560} {onClose}>
  <div class="groups">
    {#each groups as group (group.title)}
      <section>
        <h3>{group.title}</h3>
        <table>
          <tbody>
            {#each group.rows as row (row.action)}
              <tr>
                <td class="action">{row.action}</td>
                <td class="keys"><kbd>{row.keys}</kbd></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/each}
  </div>
</Dialog>

<style>
  .groups {
    columns: 2 240px;
    column-gap: 24px;
  }
  section {
    break-inside: avoid;
    margin-bottom: 10px;
  }
  h3 {
    font-size: 12px;
    margin: 8px 0 4px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  td {
    padding: 2px 0;
    vertical-align: top;
  }
  .keys {
    text-align: right;
    white-space: nowrap;
    padding-left: 8px;
  }
  kbd {
    font: inherit;
    font-size: 12px;
    padding: 1px 5px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--panel);
  }
</style>

<script lang="ts">
  /**
   * Preferences (Settings… on macOS). Changes apply straight away and are
   * remembered (App.svelte saves them); there's no OK button to forget.
   */
  import { BASEMAPS } from "../map/basemaps";
  import { UNIT_SYSTEMS } from "../measure/units";
  import { COORD_FORMATS, type Preferences } from "../preferences.svelte";
  import Dialog from "./Dialog.svelte";
  import { THEMES } from "./theme";

  let { prefs, onClose }: { prefs: Preferences; onClose: () => void } = $props();
</script>

<Dialog title="Preferences" width={440} {onClose}>
  <div class="grid">
    <label for="pref-theme">Appearance</label>
    <select id="pref-theme" bind:value={prefs.theme}>
      {#each THEMES as t (t.id)}
        <option value={t.id}>{t.label}</option>
      {/each}
    </select>

    <label for="pref-units">Measurement units</label>
    <select id="pref-units" bind:value={prefs.units}>
      {#each UNIT_SYSTEMS as u (u.id)}
        <option value={u.id}>{u.label}</option>
      {/each}
    </select>

    <label for="pref-coords">Coordinates</label>
    <select id="pref-coords" bind:value={prefs.coordFormat}>
      {#each COORD_FORMATS as c (c.id)}
        <option value={c.id}>{c.label}</option>
      {/each}
    </select>

    <label for="pref-basemap">Basemap for new projects</label>
    <select id="pref-basemap" bind:value={prefs.basemap}>
      {#each BASEMAPS as b (b.id)}
        <option value={b.id}>{b.label}</option>
      {/each}
    </select>
  </div>
  <p class="muted">
    Units are used by the measure tool, identify and the scale bar. Coordinates are shown in the status bar (click them to
    switch). A project keeps its own basemap when it's saved.
  </p>
</Dialog>

<style>
  .grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px 12px;
    align-items: center;
    margin-top: 10px;
  }
  select {
    font: inherit;
    min-width: 0;
  }
  .muted {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.45;
  }
</style>

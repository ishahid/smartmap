/**
 * The selected features. They all belong to one layer at a time: selecting in
 * another layer replaces the selection.
 *
 * The map highlights them, the attribute table marks their rows, and
 * "zoom to selected" uses them. Like LayerList, `ids` is replaced, never
 * changed in place, so everything reading it updates.
 */
export class Selection {
  /** The layer the selected features belong to, or null when nothing is selected. */
  layerId = $state<string | null>(null);
  /** Feature ids (positions in the layer's feature list). */
  ids = $state.raw<ReadonlySet<number>>(new Set());
  /**
   * The feature to bring into view in the attribute table, set when something
   * is selected outside the table (a map click, a search result).
   */
  focus = $state<number | null>(null);

  count = $derived(this.ids.size);

  /** Replaces the selection. */
  select(layerId: string, ids: Iterable<number>, focus: number | null = null) {
    this.layerId = layerId;
    this.ids = new Set(ids);
    this.focus = focus;
  }

  /** Adds or removes one feature (Ctrl/Cmd+click). Switches layer if needed. */
  toggle(layerId: string, id: number) {
    const ids = new Set(this.layerId === layerId ? this.ids : []);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    this.select(layerId, ids);
  }

  /** Keeps only the selected features for which `keep` is true (e.g. after a filter change). */
  retain(keep: (id: number) => boolean) {
    const ids = [...this.ids].filter(keep);
    if (ids.length !== this.ids.size) this.ids = new Set(ids);
  }

  has(layerId: string, id: number): boolean {
    return this.layerId === layerId && this.ids.has(id);
  }

  clear() {
    this.layerId = null;
    this.ids = new Set();
    this.focus = null;
  }
}

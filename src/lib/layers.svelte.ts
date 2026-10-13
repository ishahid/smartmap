/**
 * The list of data layers on the map, and the operations the layer panel needs.
 *
 * This is a "store": state that several components share. In Svelte 5 that's
 * just a class whose fields use runes; any component that reads `layers` or
 * `selectedId` re-renders when they change. The `.svelte.ts` file name is what
 * lets runes work outside a component.
 *
 * `layers` uses `$state.raw` rather than `$state`, so Svelte doesn't wrap every
 * GeoJSON coordinate in a reactive proxy (slow, and MapLibre can't send
 * proxies to its worker). The price: never change a layer in place. Every
 * method below builds a new array (and a new object for a changed layer).
 */
import type { LayerData } from "./api";
import type { MapLayer } from "./map/types";
import { defaultStyle } from "./style/layerStyle";
import type { LayerStyle } from "./style/types";

/** Settings the panel can change on a layer. */
export type LayerSettings = Partial<Pick<MapLayer, "name" | "visible" | "opacity" | "style">>;

export class LayerList {
  /** Bottom layer first, as drawn. The panel shows them reversed (top first). */
  layers = $state.raw<MapLayer[]>([]);
  /** The layer whose style editor is open, if any. */
  selectedId = $state<string | null>(null);
  /**
   * Source of layer ids. Never reset, not even by clear(): MapView tells layers
   * apart by id, so an id must never come back for a different layer.
   */
  #nextId = 0;
  /** How many layers have been added since the last clear(); picks default colours. */
  #added = 0;

  selected = $derived(this.layers.find((layer) => layer.id === this.selectedId) ?? null);

  /**
   * Adds a layer on top of the others and returns it. `settings` overrides the
   * defaults (used when reopening a project).
   */
  add(data: LayerData, settings: LayerSettings = {}): MapLayer {
    const layer: MapLayer = {
      id: String(this.#nextId++),
      data,
      name: data.name,
      visible: true,
      opacity: 1,
      style: defaultStyle(this.#added++),
      ...settings,
    };
    this.layers = [...this.layers, layer];
    return layer;
  }

  /** Removes every layer (for File → New and before opening a project). */
  clear() {
    this.layers = [];
    this.selectedId = null;
    this.#added = 0;
  }

  remove(id: string) {
    this.layers = this.layers.filter((layer) => layer.id !== id);
    if (this.selectedId === id) this.selectedId = null;
  }

  /** Moves a layer to `index` in the bottom-first list. */
  move(id: string, index: number) {
    const from = this.layers.findIndex((layer) => layer.id === id);
    if (from < 0) return;
    const to = Math.max(0, Math.min(index, this.layers.length - 1));
    if (from === to) return;
    const reordered = [...this.layers];
    const [layer] = reordered.splice(from, 1);
    reordered.splice(to, 0, layer);
    this.layers = reordered;
  }

  update(id: string, settings: LayerSettings) {
    this.layers = this.layers.map((layer) => (layer.id === id ? { ...layer, ...settings } : layer));
  }

  updateStyle(id: string, changes: Partial<LayerStyle>) {
    this.layers = this.layers.map((layer) =>
      layer.id === id ? { ...layer, style: { ...layer.style, ...changes } } : layer,
    );
  }
}

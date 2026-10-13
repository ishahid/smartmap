/**
 * Works out the cheapest way to change MapLibre style layers from one version
 * to another.
 *
 * Dragging the opacity slider changes the style many times a second. Removing
 * and re-adding the layers each time would flicker, so when only paint/layout
 * values change we set just those. When the set of layers changes (a label
 * turned on, a point shape switched between circle and icon) we rebuild.
 */
import type { LayerSpecification } from "./maplibre";

export type Change =
  | { kind: "paint" | "layout"; layerId: string; property: string; value: unknown }
  | { kind: "filter"; layerId: string; value: unknown };

/** Either "rebuild everything" or a list of property changes (possibly empty). */
export type Plan = { rebuild: true } | { rebuild: false; changes: Change[] };

type Properties = Record<string, unknown>;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function propertyChanges(
  kind: "paint" | "layout",
  layerId: string,
  before: Properties = {},
  after: Properties = {},
): Change[] {
  const changes: Change[] = [];
  for (const property of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!same(before[property], after[property])) {
      // `undefined` tells MapLibre to go back to the property's default.
      changes.push({ kind, layerId, property, value: after[property] });
    }
  }
  return changes;
}

export function planUpdate(before: LayerSpecification[], after: LayerSpecification[]): Plan {
  const shapeChanged =
    before.length !== after.length || before.some((layer, i) => layer.id !== after[i].id || layer.type !== after[i].type);
  if (shapeChanged) return { rebuild: true };

  const changes: Change[] = [];
  before.forEach((old, i) => {
    const next = after[i];
    changes.push(...propertyChanges("paint", next.id, old.paint as Properties, next.paint as Properties));
    changes.push(...propertyChanges("layout", next.id, old.layout as Properties, next.layout as Properties));
    const oldFilter = "filter" in old ? old.filter : undefined;
    const newFilter = "filter" in next ? next.filter : undefined;
    if (!same(oldFilter, newFilter)) changes.push({ kind: "filter", layerId: next.id, value: newFilter });
  });
  return { rebuild: false, changes };
}

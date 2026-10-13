import { describe, expect, it } from "vitest";
import { Selection } from "./selection.svelte";

describe("Selection", () => {
  it("selects, toggles and switches layers", () => {
    const selection = new Selection();
    selection.select("a", [1, 2], 2);
    expect(selection.count).toBe(2);
    expect(selection.focus).toBe(2);
    selection.toggle("a", 2);
    selection.toggle("a", 5);
    expect([...selection.ids]).toEqual([1, 5]);
    expect(selection.has("a", 5)).toBe(true);
    expect(selection.has("b", 5)).toBe(false);

    selection.toggle("b", 3); // another layer: starts over
    expect(selection.layerId).toBe("b");
    expect([...selection.ids]).toEqual([3]);
  });

  it("drops features that no longer qualify and clears", () => {
    const selection = new Selection();
    selection.select("a", [1, 2, 3]);
    const before = selection.ids;
    selection.retain(() => true);
    expect(selection.ids).toBe(before); // unchanged: no needless update
    selection.retain((id) => id !== 2);
    expect([...selection.ids]).toEqual([1, 3]);
    selection.clear();
    expect(selection.layerId).toBeNull();
    expect(selection.count).toBe(0);
  });
});

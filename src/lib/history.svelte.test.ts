import { describe, expect, it } from "vitest";
import { History } from "./history.svelte";

describe("History", () => {
  it("undoes and redoes in order, and a new change clears redo", () => {
    let value = 0;
    const history = new History();
    const set = (label: string, from: number, to: number) => {
      value = to;
      history.push({ label, undo: () => (value = from), redo: () => (value = to) });
    };
    expect(history.canUndo).toBe(false);
    set("one", 0, 1);
    set("two", 1, 2);
    expect(history.undoLabel).toBe("two");

    expect(history.undo()).toBe("two");
    expect(value).toBe(1);
    expect(history.canRedo).toBe(true);
    expect(history.redoLabel).toBe("two");
    expect(history.redo()).toBe("two");
    expect(value).toBe(2);

    history.undo();
    set("three", 1, 3);
    expect(history.canRedo).toBe(false);
    expect(history.redo()).toBeNull();
    history.undo();
    history.undo();
    expect(value).toBe(0);
    expect(history.undo()).toBeNull();

    history.clear();
    expect(history.canUndo || history.canRedo).toBe(false);
  });
});

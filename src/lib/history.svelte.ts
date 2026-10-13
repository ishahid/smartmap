/**
 * Undo/redo for annotation edits, using the "command pattern": every change
 * is recorded as an object that knows how to undo and redo itself. Undo runs
 * the newest command's `undo` and moves it to the redo stack; making a new
 * change after undoing clears the redo stack, as in any editor.
 *
 * Most commands here swap a layer's whole feature list between "before" and
 * "after". Annotation layers are small, so keeping both copies is cheap and
 * much simpler than recording exactly what changed.
 */

export interface Command {
  /** Shown in the Undo/Redo button tooltips, e.g. "Draw polygon". */
  label: string;
  undo(): void;
  redo(): void;
}

/** How many steps to remember. */
const LIMIT = 200;

export class History {
  #done = $state.raw<Command[]>([]);
  #undone = $state.raw<Command[]>([]);

  canUndo = $derived(this.#done.length > 0);
  canRedo = $derived(this.#undone.length > 0);
  /** What Undo would undo, e.g. "Draw polygon", or null. */
  undoLabel = $derived(this.#done.at(-1)?.label ?? null);
  redoLabel = $derived(this.#undone.at(-1)?.label ?? null);

  /** Records a change that has already been made. */
  push(command: Command) {
    this.#done = [...this.#done, command].slice(-LIMIT);
    this.#undone = [];
  }

  /** Undoes the last change. Returns its label, or null if there was nothing to undo. */
  undo(): string | null {
    const command = this.#done.at(-1);
    if (!command) return null;
    command.undo();
    this.#done = this.#done.slice(0, -1);
    this.#undone = [...this.#undone, command];
    return command.label;
  }

  /** Redoes the last undone change. Returns its label, or null. */
  redo(): string | null {
    const command = this.#undone.at(-1);
    if (!command) return null;
    command.redo();
    this.#undone = this.#undone.slice(0, -1);
    this.#done = [...this.#done, command];
    return command.label;
  }

  /** Forgets everything (after File → New or opening a project). */
  clear() {
    this.#done = [];
    this.#undone = [];
  }
}

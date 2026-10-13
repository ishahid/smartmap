/**
 * The native menu bar in the desktop app, built from `menuTemplate()` (commands.ts)
 * with Tauri's menu API. On macOS it's the menu bar at the top of the screen;
 * on Windows and Linux it's at the top of the window.
 *
 * App.svelte calls `update()` with a new template whenever something the menus
 * show changes (Undo's label, a check mark, the Recent list...). Rebuilding the
 * whole menu each time would mean ~70 calls to Rust, so when only labels,
 * check marks and enabled states differ, those items are changed in place;
 * the menu is rebuilt only when items are added or removed.
 */
import { CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { SHORTCUTS, type CommandEntry, type CommandId, type MenuEntry } from "./commands";

type MenuChild = Submenu | MenuItem | CheckMenuItem | PredefinedMenuItem;

/** A command item on the menu (null for the OS's own Cut/Copy/Paste), with the state it last showed. */
interface Built {
  item: MenuItem | CheckMenuItem | null;
  entry: CommandEntry;
}

/**
 * The shape of a template: which items, in what order. Command labels, check
 * marks and enabled states are left out, since those can change in place.
 */
function shapeOf(entries: MenuEntry[]): string {
  return JSON.stringify(entries.map(withoutCommandLabels), (key, value) =>
    key === "enabled" || key === "checked" ? undefined : value,
  );
}

export class NativeMenu {
  #onCommand: (id: CommandId) => void;
  #menu: Menu | null = null;
  #shape = "";
  /**
   * Every command item, in template order (see collectCommands). The same
   * command can be on two menus, so they're kept by position, not by id.
   */
  #built: Built[] = [];
  /** The newest template not applied yet, and whether an update is running. */
  #pending: MenuEntry[] | null = null;
  #running = false;

  constructor(onCommand: (id: CommandId) => void) {
    this.#onCommand = onCommand;
  }

  /** Shows `template`. Calls are queued, and only the newest waiting template is applied. */
  update(template: MenuEntry[]) {
    this.#pending = template;
    if (!this.#running) void this.#drain();
  }

  async #drain() {
    this.#running = true;
    while (this.#pending) {
      const template = this.#pending;
      this.#pending = null;
      try {
        await this.#apply(template);
      } catch (error) {
        console.error("Updating the menu failed:", error);
      }
    }
    this.#running = false;
  }

  async #apply(template: MenuEntry[]) {
    const shape = shapeOf(template);
    if (shape !== this.#shape || !this.#menu) {
      await this.#rebuild(template);
      this.#shape = shape;
      return;
    }
    // Same items: change only what differs from what each item last showed.
    const entries: CommandEntry[] = [];
    collectCommands(template, entries);
    await Promise.all(
      entries.map(async (entry, i) => {
        const built = this.#built[i];
        const before = built.entry;
        built.entry = entry;
        if (!built.item) return;
        if (entry.label !== before.label) await built.item.setText(entry.label);
        if ((entry.enabled ?? true) !== (before.enabled ?? true)) await built.item.setEnabled(entry.enabled ?? true);
        if (built.item instanceof CheckMenuItem && entry.checked !== before.checked) {
          await built.item.setChecked(entry.checked ?? false);
        }
      }),
    );
  }

  async #rebuild(template: MenuEntry[]) {
    // One slot per command entry, in template order; #build fills in the items.
    const entries: CommandEntry[] = [];
    collectCommands(template, entries);
    this.#built = entries.map((entry) => ({ item: null, entry }));
    const slots = new Map(entries.map((entry, i) => [entry, this.#built[i]]));
    const items = await Promise.all(template.map((entry) => this.#build(entry, slots)));
    const menu = await Menu.new({ items: items.filter((i): i is MenuChild => i !== null) });
    const previous = await menu.setAsAppMenu();
    this.#menu = menu;
    // Free the old menu's Rust objects.
    await previous?.close();
  }

  /** Makes the Tauri object for one entry (and its children). */
  async #build(entry: MenuEntry, slots: Map<CommandEntry, Built>): Promise<MenuChild | null> {
    switch (entry.type) {
      case "separator":
        return PredefinedMenuItem.new({ item: "Separator" });
      case "native":
        return PredefinedMenuItem.new({ item: entry.item, text: entry.label });
      case "submenu": {
        const children = await Promise.all(entry.items.map((child) => this.#build(child, slots)));
        const submenu = await Submenu.new({
          text: entry.label,
          enabled: entry.enabled ?? true,
          items: children.filter((c): c is MenuChild => c !== null),
        });
        // macOS adds the window list to the Window menu and a search box to Help.
        if (entry.role === "window") await submenu.setAsWindowsMenuForNSApp();
        if (entry.role === "help") await submenu.setAsHelpMenuForNSApp();
        return submenu;
      }
      case "command": {
        // The OS's own item; its slot stays empty (there's nothing of ours to update).
        if (entry.native) return PredefinedMenuItem.new({ item: entry.native, text: entry.label });
        const slot = slots.get(entry)!;
        const options = {
          id: entry.id,
          text: entry.label,
          enabled: entry.enabled ?? true,
          accelerator: SHORTCUTS[entry.id]?.[0],
          action: () => {
            // A click toggles a check mark by itself; note that, so the next
            // update puts it right if the command didn't change the state.
            if (slot.entry.checked !== undefined) slot.entry = { ...slot.entry, checked: !slot.entry.checked };
            this.#onCommand(entry.id);
          },
        };
        slot.item =
          entry.checked === undefined
            ? await MenuItem.new(options)
            : await CheckMenuItem.new({ ...options, checked: entry.checked });
        return slot.item;
      }
    }
  }
}

/** The template with command labels removed, for comparing shapes. */
function withoutCommandLabels(entry: MenuEntry): MenuEntry {
  if (entry.type === "command") return { ...entry, label: "" };
  if (entry.type === "submenu") return { ...entry, items: entry.items.map(withoutCommandLabels) };
  return entry;
}

/** Every command entry, in the order #build visits them. */
function collectCommands(entries: MenuEntry[], out: CommandEntry[]) {
  for (const entry of entries) {
    if (entry.type === "command") out.push(entry);
    else if (entry.type === "submenu") collectCommands(entry.items, out);
  }
}

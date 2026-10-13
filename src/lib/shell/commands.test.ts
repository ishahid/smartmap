import { describe, expect, it } from "vitest";
import {
  commandForKey,
  eachCommand,
  isTextEntry,
  matchesShortcut,
  menuTemplate,
  SHORTCUTS,
  shortcutGroups,
  shortcutLabel,
  type CommandId,
  type KeyPress,
  type MenuEntry,
  type MenuState,
} from "./commands";

const press = (key: string, mods: Partial<KeyPress> = {}): KeyPress => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

const state = (changes: Partial<MenuState> = {}): MenuState => ({
  macLayout: false,
  desktop: true,
  recent: [],
  undoLabel: null,
  redoLabel: null,
  layer: null,
  editing: false,
  tableOpen: false,
  hasSelection: false,
  selectionEditable: false,
  globe: false,
  measuring: false,
  theme: "system",
  ...changes,
});

/** Every command entry in a template, flattened. */
function commands(template: MenuEntry[]) {
  const found: { id: CommandId; label: string; enabled?: boolean; checked?: boolean; path: string[] }[] = [];
  eachCommand(template, (entry, path) => found.push({ ...entry, path }));
  return found;
}

describe("keyboard shortcuts", () => {
  it("uses Cmd on a Mac and Ctrl elsewhere", () => {
    expect(matchesShortcut(press("s", { metaKey: true }), "CmdOrCtrl+S", true)).toBe(true);
    expect(matchesShortcut(press("s", { ctrlKey: true }), "CmdOrCtrl+S", true)).toBe(false);
    expect(matchesShortcut(press("s", { ctrlKey: true }), "CmdOrCtrl+S", false)).toBe(true);
    expect(matchesShortcut(press("s", { metaKey: true }), "CmdOrCtrl+S", false)).toBe(false);
  });

  it("needs exactly the listed modifiers", () => {
    expect(matchesShortcut(press("S", { ctrlKey: true, shiftKey: true }), "CmdOrCtrl+Shift+S", false)).toBe(true);
    expect(matchesShortcut(press("S", { ctrlKey: true, shiftKey: true }), "CmdOrCtrl+S", false)).toBe(false);
    expect(matchesShortcut(press("s", { ctrlKey: true, altKey: true }), "CmdOrCtrl+S", false)).toBe(false);
    expect(matchesShortcut(press("s"), "CmdOrCtrl+S", false)).toBe(false);
  });

  it("matches symbol keys", () => {
    expect(matchesShortcut(press("=", { ctrlKey: true }), "CmdOrCtrl+=", false)).toBe(true);
    expect(matchesShortcut(press("-", { ctrlKey: true }), "CmdOrCtrl+-", false)).toBe(true);
    expect(matchesShortcut(press(",", { metaKey: true }), "CmdOrCtrl+,", true)).toBe(true);
  });

  it("finds the command for a key press, including second shortcuts", () => {
    expect(commandForKey(press("o", { ctrlKey: true }), false, false)).toBe("open");
    expect(commandForKey(press("Z", { metaKey: true, shiftKey: true }), true, false)).toBe("redo");
    expect(commandForKey(press("y", { ctrlKey: true }), false, false)).toBe("redo");
    expect(commandForKey(press("k", { ctrlKey: true }), false, false)).toBe(null);
  });

  it("leaves editing keys and plain keys to text boxes", () => {
    expect(commandForKey(press("z", { ctrlKey: true }), false, true)).toBe(null);
    expect(commandForKey(press("c", { ctrlKey: true }), false, true)).toBe(null);
    expect(commandForKey(press("Backspace"), false, true)).toBe(null);
    expect(commandForKey(press("Escape"), false, true)).toBe(null);
    // File shortcuts still work while typing.
    expect(commandForKey(press("s", { ctrlKey: true }), false, true)).toBe("save");
  });

  it("runs Delete, Backspace and Esc outside text boxes", () => {
    expect(commandForKey(press("Delete"), false, false)).toBe("delete");
    expect(commandForKey(press("Backspace"), true, false)).toBe("delete");
    expect(commandForKey(press("Escape"), false, false)).toBe("clearSelection");
    expect(commandForKey(press("Delete", { shiftKey: false, altKey: true }), false, false)).toBe(null);
  });

  it("gives every command at most one owner of each shortcut", () => {
    const seen = new Map<string, string>();
    for (const [id, keys] of Object.entries(SHORTCUTS)) {
      for (const key of keys!) {
        expect(seen.get(key.toLowerCase()), `${key} is used twice`).toBeUndefined();
        seen.set(key.toLowerCase(), id);
      }
    }
  });

  it("writes shortcuts the way each OS does", () => {
    expect(shortcutLabel("CmdOrCtrl+Shift+S", true)).toBe("⇧⌘S");
    expect(shortcutLabel("CmdOrCtrl+Shift+S", false)).toBe("Ctrl+Shift+S");
    expect(shortcutLabel("CmdOrCtrl+,", true)).toBe("⌘,");
    expect(shortcutLabel("CmdOrCtrl+0", false)).toBe("Ctrl+0");
  });
});

describe("isTextEntry", () => {
  it("counts text boxes, text areas, drop-downs and editable content", () => {
    expect(isTextEntry({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(isTextEntry({ tagName: "INPUT", type: "search" })).toBe(true);
    expect(isTextEntry({ tagName: "INPUT", type: "number" })).toBe(true);
    expect(isTextEntry({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTextEntry({ tagName: "SELECT" })).toBe(true);
    expect(isTextEntry({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("doesn't count check boxes, buttons or the page", () => {
    // After ticking "Globe", Cmd+Z should still undo the last annotation edit.
    expect(isTextEntry({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(isTextEntry({ tagName: "INPUT", type: "range" })).toBe(false);
    expect(isTextEntry({ tagName: "BUTTON" })).toBe(false);
    expect(isTextEntry({ tagName: "BODY", isContentEditable: false })).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});

describe("menuTemplate", () => {
  it("has the usual menus, with an app menu and Window menu on macOS", () => {
    const tops = (s: MenuState) => menuTemplate(s).map((m) => (m.type === "submenu" ? m.label : m.type));
    expect(tops(state())).toEqual(["File", "Edit", "View", "Layer", "Tools", "Help"]);
    expect(tops(state({ macLayout: true }))).toEqual(["SmartMap", "File", "Edit", "View", "Layer", "Tools", "Window", "Help"]);
  });

  it("puts About, Preferences and Quit where each OS expects them", () => {
    const where = (s: MenuState, id: CommandId) => commands(menuTemplate(s)).find((c) => c.id === id)?.path[0];
    expect(where(state({ macLayout: true }), "preferences")).toBe("SmartMap");
    expect(where(state({ macLayout: true }), "quit")).toBe("SmartMap");
    expect(where(state({ macLayout: true }), "about")).toBe("SmartMap");
    expect(where(state(), "preferences")).toBe("File");
    expect(where(state(), "quit")).toBe("File");
    expect(where(state(), "about")).toBe("Help");
    // A browser can't quit.
    expect(where(state({ desktop: false }), "quit")).toBeUndefined();
  });

  it("lists recent projects and enables the submenu only when there are some", () => {
    const openRecent = (s: MenuState) => {
      const file = menuTemplate(s)[0] as Extract<MenuEntry, { type: "submenu" }>;
      return file.items.find((e) => e.type === "submenu" && e.label === "Open Recent") as Extract<
        MenuEntry,
        { type: "submenu" }
      >;
    };
    expect(openRecent(state()).enabled).toBe(false);
    const menu = openRecent(state({ recent: ["trip — maps", "city — work"] }));
    expect(menu.enabled).toBe(true);
    expect(commands(menu.items).map((c) => [c.id, c.label])).toEqual([
      ["recent:0", "trip — maps"],
      ["recent:1", "city — work"],
      ["clearRecent", "Clear Menu"],
    ]);
  });

  it("names the last change in Undo and Redo", () => {
    const find = (s: MenuState, id: CommandId) => commands(menuTemplate(s)).find((c) => c.id === id)!;
    expect(find(state(), "undo")).toMatchObject({ label: "Undo", enabled: false });
    expect(find(state({ undoLabel: "Draw polygon" }), "undo")).toMatchObject({ label: "Undo Draw polygon", enabled: true });
    expect(find(state({ redoLabel: "Move point" }), "redo")).toMatchObject({ label: "Redo Move point", enabled: true });
  });

  it("enables layer commands for the chosen layer and shows check marks", () => {
    const find = (s: MenuState, id: CommandId) => commands(menuTemplate(s)).filter((c) => c.id === id);
    expect(find(state(), "removeLayer")[0].enabled).toBe(false);
    expect(find(state({ layer: { name: "roads", annotations: false } }), "removeLayer")[0].enabled).toBe(true);
    expect(find(state({ layer: { name: "roads", annotations: false } }), "editAnnotations")[0].enabled).toBe(false);
    expect(find(state({ layer: { name: "notes", annotations: true }, editing: true }), "editAnnotations")[0]).toMatchObject({
      enabled: true,
      checked: true,
    });
    expect(find(state({ globe: true }), "globe")[0].checked).toBe(true);
    expect(find(state({ theme: "dark" }), "theme:dark")[0].checked).toBe(true);
    expect(find(state({ theme: "dark" }), "theme:system")[0].checked).toBe(false);
    // Export is on the File menu (with the layer's name) and the Layer menu.
    expect(find(state({ layer: { name: "roads", annotations: false } }), "exportLayer").map((c) => c.label)).toEqual([
      "Export “roads”…",
      "Export Layer…",
    ]);
  });

  it("uses the OS's own Cut, Copy and Paste so they work in text boxes", () => {
    const native = commands(menuTemplate(state())).filter((c) => "native" in c && c.native);
    expect(native.map((c) => c.id)).toEqual(["cut", "copy", "paste"]);
  });
});

describe("shortcutGroups", () => {
  it("lists each menu's shortcuts once, then the other keys", () => {
    const groups = shortcutGroups(menuTemplate(state()), false);
    expect(groups.map((g) => g.title)).toEqual(["File", "Edit", "View", "Layer", "Tools", "Other keys"]);
    const file = groups[0].rows;
    expect(file).toContainEqual({ keys: "Ctrl+Shift+S", action: "Save As" });
    const edit = groups[1].rows;
    expect(edit).toContainEqual({ keys: "Ctrl+Shift+Z or Ctrl+Y", action: "Redo" });
    // Every shortcut is listed somewhere.
    const listed = groups.flatMap((g) => g.rows.map((r) => r.keys)).join(" ");
    for (const keys of Object.values(SHORTCUTS)) expect(listed).toContain(shortcutLabel(keys![0], false));
  });
});

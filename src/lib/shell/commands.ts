/**
 * The app's commands, their keyboard shortcuts, and the menus that show them.
 *
 * One description drives three things, so they can't disagree:
 * - the menu bar: `menuTemplate()` → menu.ts (native menus in the desktop app)
 *   or MenuBar.svelte (an HTML menu bar in a plain browser),
 * - the keyboard: `commandForKey()`, called by App.svelte's keydown handler,
 * - the Keyboard Shortcuts help: `shortcutGroups()`.
 *
 * App.svelte decides what each command does (`perform()` there). Everything
 * here is plain data and pure functions, so it's tested without a window.
 */
import { THEMES, type Theme } from "./theme";

/** Every command the menus and shortcuts can run. */
export type CommandId =
  // File
  | "new"
  | "open"
  | `recent:${number}`
  | "clearRecent"
  | "save"
  | "saveAs"
  | "openOffline"
  | "preferences"
  | "quit"
  // Edit
  | "undo"
  | "redo"
  | "cut"
  | "copy"
  | "paste"
  | "selectAll"
  | "duplicate"
  | "delete"
  | "clearSelection"
  // View
  | "zoomFull"
  | "zoomIn"
  | "zoomOut"
  | "globe"
  | `theme:${Theme}`
  // Layer
  | "newAnnotationLayer"
  | "zoomLayer"
  | "table"
  | "editAnnotations"
  | "exportLayer"
  | "removeLayer"
  // Tools
  | "measure"
  | "find"
  // Help
  | "shortcuts"
  | "offlineHelp"
  | "about";

/**
 * Keyboard shortcuts, written the way Tauri menus expect them ("accelerators").
 * "CmdOrCtrl" means Cmd on macOS and Ctrl on Windows and Linux. The first
 * shortcut is the one shown in the menu; any others only work from the
 * keyboard (Ctrl+Y for Redo is the Windows habit).
 */
export const SHORTCUTS: Partial<Record<CommandId, string[]>> = {
  new: ["CmdOrCtrl+N"],
  open: ["CmdOrCtrl+O"],
  save: ["CmdOrCtrl+S"],
  saveAs: ["CmdOrCtrl+Shift+S"],
  preferences: ["CmdOrCtrl+,"],
  quit: ["CmdOrCtrl+Q"],
  undo: ["CmdOrCtrl+Z"],
  redo: ["CmdOrCtrl+Shift+Z", "CmdOrCtrl+Y"],
  cut: ["CmdOrCtrl+X"],
  copy: ["CmdOrCtrl+C"],
  paste: ["CmdOrCtrl+V"],
  selectAll: ["CmdOrCtrl+A"],
  duplicate: ["CmdOrCtrl+D"],
  zoomFull: ["CmdOrCtrl+0"],
  zoomIn: ["CmdOrCtrl+="],
  zoomOut: ["CmdOrCtrl+-"],
  table: ["CmdOrCtrl+T"],
  measure: ["CmdOrCtrl+Shift+M"],
  find: ["CmdOrCtrl+F"],
};

/**
 * Keys without Cmd/Ctrl. They aren't put on menu items, because a menu
 * shortcut could take Backspace or Esc away from text boxes; App's keydown
 * handler runs them instead, and only when no text box has the focus.
 */
const PLAIN_KEYS: Record<string, CommandId> = {
  Delete: "delete",
  Backspace: "delete",
  Escape: "clearSelection",
};

/**
 * Commands whose keys also mean something while typing in a text box (undo the
 * typing, copy the selected text, ...). There, the text box gets them.
 */
export const TEXT_EDITING = new Set<CommandId>(["undo", "redo", "cut", "copy", "paste", "selectAll", "duplicate"]);

/** <input> types that aren't for typing text (their keys can stay app shortcuts). */
const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"]);

/**
 * True if `element` takes typed text: a text box, a text area, a drop-down
 * (letters pick an option) or editable content. Then keys like Cmd+Z and
 * Backspace belong to it, not to the app.
 */
export function isTextEntry(element: { tagName?: string; type?: string; isContentEditable?: boolean } | null): boolean {
  const tag = element?.tagName?.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag === "input") return !NON_TEXT_INPUTS.has(element?.type ?? "text");
  return element?.isContentEditable === true;
}

/** True on a Mac, where shortcuts use Cmd (⌘) instead of Ctrl. */
export const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform || navigator.userAgent);

/** The parts of a KeyboardEvent the shortcut matching needs (so tests can pass plain objects). */
export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** True if `event` is the key combination `accelerator`, e.g. "CmdOrCtrl+Shift+S". */
export function matchesShortcut(event: KeyPress, accelerator: string, mac: boolean): boolean {
  const parts = accelerator.split("+");
  // "CmdOrCtrl+=" splits into ["CmdOrCtrl", "="]; the last part is the key.
  const key = parts.pop()!.toLowerCase();
  const modifiers = new Set(parts.map((p) => p.toLowerCase()));
  // Cmd on a Mac, Ctrl elsewhere. The other one must not be held.
  const command = mac ? event.metaKey : event.ctrlKey;
  const other = mac ? event.ctrlKey : event.metaKey;
  return (
    command === modifiers.has("cmdorctrl") &&
    !other &&
    event.shiftKey === modifiers.has("shift") &&
    event.altKey === modifiers.has("alt") &&
    event.key.toLowerCase() === key
  );
}

/**
 * The command for a key press, or null. `typing` is true while a text box has
 * the focus: then the text-editing keys and the plain keys are left to it.
 */
export function commandForKey(event: KeyPress, mac: boolean, typing: boolean): CommandId | null {
  for (const [id, keys] of Object.entries(SHORTCUTS) as [CommandId, string[]][]) {
    if (keys.some((k) => matchesShortcut(event, k, mac))) {
      return typing && TEXT_EDITING.has(id) ? null : id;
    }
  }
  const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
  return plain && !typing ? (PLAIN_KEYS[event.key] ?? null) : null;
}

/** How a shortcut is written for people: "⇧⌘S" on a Mac, "Ctrl+Shift+S" elsewhere. */
export function shortcutLabel(accelerator: string, mac: boolean): string {
  const parts = accelerator.split("+");
  const key = parts.pop()!;
  const shown = key.length === 1 ? key.toUpperCase() : key;
  if (mac) {
    // Mac order: Control, Option, Shift, Command.
    const symbols = [
      ["alt", "⌥"],
      ["shift", "⇧"],
      ["cmdorctrl", "⌘"],
    ]
      .filter(([name]) => parts.some((p) => p.toLowerCase() === name))
      .map(([, symbol]) => symbol);
    return symbols.join("") + shown;
  }
  const names = parts.map((p) => (p.toLowerCase() === "cmdorctrl" ? "Ctrl" : p));
  return [...names, shown].join("+");
}

// --- Menus ----------------------------------------------------------------------

/** Built-in menu items that the operating system handles itself. */
export type NativeItem =
  | "Copy"
  | "Cut"
  | "Paste"
  | "Services"
  | "Hide"
  | "HideOthers"
  | "ShowAll"
  | "Minimize"
  | "Maximize"
  | "Fullscreen"
  | "CloseWindow";

/** One entry in a menu. */
export type MenuEntry =
  | {
      type: "command";
      id: CommandId;
      label: string;
      enabled?: boolean;
      /** Set for items with a check mark (true or false); absent for plain items. */
      checked?: boolean;
      /**
       * Use the OS's own item instead of ours (Cut, Copy and Paste: only the OS
       * can paste into a text box). The command still runs from the keyboard.
       */
      native?: NativeItem;
    }
  | { type: "native"; item: NativeItem; label?: string }
  | { type: "separator" }
  | { type: "submenu"; label: string; items: MenuEntry[]; enabled?: boolean; role?: "window" | "help" };

export type CommandEntry = Extract<MenuEntry, { type: "command" }>;

/** What the menus need to know about the app right now. */
export interface MenuState {
  /** Use the macOS layout (app menu with About/Settings/Quit, a Window menu). */
  macLayout: boolean;
  /** False in a plain browser, where there's no Quit/Exit. */
  desktop: boolean;
  /** Recent projects, newest first, as shown in File → Open Recent. */
  recent: string[];
  /** What Undo and Redo would undo/redo, or null if nothing. */
  undoLabel: string | null;
  redoLabel: string | null;
  /** The layer chosen in the layer panel, or null. */
  layer: { name: string; annotations: boolean } | null;
  /** True while that layer's annotations are being edited. */
  editing: boolean;
  /** True while the attribute table is open. */
  tableOpen: boolean;
  /** True if any feature is selected. */
  hasSelection: boolean;
  /** True if the selected features are annotations (they can be cut, deleted, duplicated). */
  selectionEditable: boolean;
  globe: boolean;
  measuring: boolean;
  theme: Theme;
}

const command = (id: CommandId, label: string, extra: Partial<CommandEntry> = {}): MenuEntry => ({
  type: "command",
  id,
  label,
  ...extra,
});
const separator: MenuEntry = { type: "separator" };

/** The whole menu bar for the current state, top-level menus first. */
export function menuTemplate(s: MenuState): MenuEntry[] {
  const layer = s.layer;
  const recentItems: MenuEntry[] = s.recent.map((label, i) => command(`recent:${i}`, label));

  const file: MenuEntry[] = [
    command("new", "New Project"),
    command("open", "Open…"),
    {
      type: "submenu",
      label: "Open Recent",
      items: [...recentItems, ...(recentItems.length > 0 ? [separator] : []), command("clearRecent", "Clear Menu")],
      enabled: s.recent.length > 0,
    },
    separator,
    command("save", "Save"),
    command("saveAs", "Save As…"),
    separator,
    command("openOffline", "Open Offline Map…"),
    command("exportLayer", layer ? `Export “${layer.name}”…` : "Export Layer…", { enabled: layer !== null }),
  ];
  if (s.macLayout) {
    file.push(separator, { type: "native", item: "CloseWindow" });
  } else {
    file.push(separator, command("preferences", "Preferences…"));
    if (s.desktop) file.push(separator, command("quit", "Exit"));
  }

  const edit: MenuEntry[] = [
    command("undo", s.undoLabel ? `Undo ${s.undoLabel}` : "Undo", { enabled: s.undoLabel !== null }),
    command("redo", s.redoLabel ? `Redo ${s.redoLabel}` : "Redo", { enabled: s.redoLabel !== null }),
    separator,
    command("cut", "Cut", { native: "Cut" }),
    command("copy", "Copy", { native: "Copy" }),
    command("paste", "Paste", { native: "Paste" }),
    command("selectAll", "Select All"),
    separator,
    command("duplicate", "Duplicate", { enabled: s.selectionEditable }),
    command("delete", "Delete", { enabled: s.selectionEditable }),
    command("clearSelection", "Clear Selection", { enabled: s.hasSelection }),
  ];

  const view: MenuEntry[] = [
    command("zoomFull", "Zoom to Full Extent"),
    command("zoomIn", "Zoom In"),
    command("zoomOut", "Zoom Out"),
    separator,
    command("globe", "Globe", { checked: s.globe }),
    separator,
    {
      type: "submenu",
      label: "Appearance",
      items: THEMES.map((t) => command(`theme:${t.id}`, t.label, { checked: s.theme === t.id })),
    },
  ];
  if (s.macLayout) view.push(separator, { type: "native", item: "Fullscreen" });

  const layerMenu: MenuEntry[] = [
    command("newAnnotationLayer", "New Annotation Layer"),
    separator,
    command("zoomLayer", "Zoom to Layer", { enabled: layer !== null }),
    command("table", "Attribute Table", { checked: s.tableOpen, enabled: layer !== null || s.tableOpen }),
    command("editAnnotations", "Edit Annotations", { checked: s.editing, enabled: layer?.annotations === true }),
    separator,
    command("exportLayer", "Export Layer…", { enabled: layer !== null }),
    command("removeLayer", "Remove Layer", { enabled: layer !== null }),
  ];

  const tools: MenuEntry[] = [command("measure", "Measure", { checked: s.measuring }), command("find", "Find Features…")];

  const help: MenuEntry[] = [command("shortcuts", "Keyboard Shortcuts"), command("offlineHelp", "Getting Offline Maps")];
  if (!s.macLayout) help.push(separator, command("about", "About SmartMap"));

  const menus: MenuEntry[] = [
    { type: "submenu", label: "File", items: file },
    { type: "submenu", label: "Edit", items: edit },
    { type: "submenu", label: "View", items: view },
    { type: "submenu", label: "Layer", items: layerMenu },
    { type: "submenu", label: "Tools", items: tools },
  ];
  if (s.macLayout) {
    // macOS: the first menu is the app's own (it shows as "SmartMap" whatever it's called),
    // and there's a Window menu, which macOS fills with the open windows.
    menus.unshift({
      type: "submenu",
      label: "SmartMap",
      items: [
        command("about", "About SmartMap"),
        separator,
        command("preferences", "Settings…"),
        separator,
        { type: "native", item: "Services" },
        separator,
        { type: "native", item: "Hide", label: "Hide SmartMap" },
        { type: "native", item: "HideOthers" },
        { type: "native", item: "ShowAll" },
        separator,
        // Our own Quit (not the OS's) so it can ask about unsaved changes first.
        command("quit", "Quit SmartMap"),
      ],
    });
    menus.push({
      type: "submenu",
      label: "Window",
      role: "window",
      items: [
        { type: "native", item: "Minimize" },
        { type: "native", item: "Maximize", label: "Zoom" },
      ],
    });
  }
  menus.push({ type: "submenu", label: "Help", role: "help", items: help });
  return menus;
}

/** Calls `visit` for every command entry in `entries`, including those in submenus. */
export function eachCommand(entries: MenuEntry[], visit: (entry: CommandEntry, path: string[]) => void, path: string[] = []) {
  for (const entry of entries) {
    if (entry.type === "command") visit(entry, path);
    else if (entry.type === "submenu") eachCommand(entry.items, visit, [...path, entry.label]);
  }
}

/** One row of the Keyboard Shortcuts help. */
export interface ShortcutRow {
  keys: string;
  action: string;
}

/** Shortcuts that aren't on a menu item. */
const OTHER_KEYS = (mac: boolean): ShortcutRow[] => [
  { keys: "Delete / Backspace", action: "Delete the selected annotations" },
  { keys: "Esc", action: "Clear the selection; stop measuring" },
  { keys: "Enter / double-click", action: "Finish a measurement" },
  { keys: "Backspace", action: "Remove the last point while measuring" },
  { keys: `${mac ? "Option" : "Alt"}+drag`, action: "Rotate the selected annotation" },
];

/**
 * The Keyboard Shortcuts help: each menu's items that have a shortcut, then
 * the keys that aren't on a menu. Labels come from `template`, so they match the menus.
 */
export function shortcutGroups(template: MenuEntry[], mac: boolean): { title: string; rows: ShortcutRow[] }[] {
  const groups = new Map<string, ShortcutRow[]>();
  const seen = new Set<CommandId>();
  eachCommand(template, (entry, path) => {
    const keys = SHORTCUTS[entry.id];
    if (!keys || seen.has(entry.id)) return;
    seen.add(entry.id);
    // Undo/Redo labels name the last change; the help just says "Undo".
    const action = entry.id === "undo" ? "Undo" : entry.id === "redo" ? "Redo" : entry.label.replace(/…$/, "");
    const title = path[0];
    const rows = groups.get(title) ?? [];
    rows.push({ keys: keys.map((k) => shortcutLabel(k, mac)).join(" or "), action });
    groups.set(title, rows);
  });
  return [...groups].map(([title, rows]) => ({ title, rows })).concat({ title: "Other keys", rows: OTHER_KEYS(mac) });
}

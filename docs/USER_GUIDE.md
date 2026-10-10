# User guide

SmartMap's target user is a spatial analyst. The main window has these parts:

- **Title bar**: the active project's file name
- **Menu bar and toolbars**: File, Edit, Layer, Tools, Shapes (Shapes appears only when a cosmetic layer exists) and What's This
- **Layers panel** (left dock): one checkbox per layer, top layer first. Unticking a box hides the layer.
- **Workspace**: one or more project windows, each with its own map
- **Status bar**: messages, plus longitude/latitude under the cursor in Identify and drawing modes

## Menus and shortcuts

| Menu | Item | Shortcut | Notes |
|---|---|---|---|
| File | New Project | Ctrl+N | Opens an empty project window "Unnamed.smproj" |
| | Open Project… | Ctrl+O | `.smproj` |
| | Save Project | Ctrl+S | The first save asks for a name. Also writes the cosmetic layer `.scl`. |
| | Save As… | | |
| | Close Project | Ctrl+W | Asks to save unsaved changes |
| | Print Image… | Ctrl+P | *Not implemented* |
| | Exit | | Closes all windows, prompting for each |
| Edit | Cut / Copy / Paste / Delete | Ctrl+X / C / V / Del | *Disabled; not implemented* |
| | Copy Map Image to File… | | Saves the current view as PNG |
| Layer | Add Layer… | | Pick an ESRI `.shp`. It gets a random default fill and line colour. |
| | Remove Layer | | Dialog: select a layer, then Remove |
| | New Cosmetic Layer… | | Pick a `.scl` file name. Shows the Shapes toolbar. |
| | Open Existing Cosmetic Layer… | | *Currently behaves like New.* Open a project that references the `.scl` instead. |
| | Layer Manager… | | Move Up/Down (Alt+U/D), Fill Color (Alt+F), Line Color (Alt+L) |
| Tools | Zoom Full Extent | `*` | Resets zoom to 1× and pan to 0 |
| | Zoom In | `+` | Toggle tool. Each click zooms in one step. |
| | Zoom Out | `-` | Toggle tool. Each click zooms out one step, down to 1×. |
| | Pan | | Toggle tool. Drag to move the map. |
| | Identify | | Toggle tool. Shows lon/lat in the status bar. |
| Windows | Cascade / Tile / Tile Horizontally, plus a list of open windows | | |
| Help | Help Contents | F1 | *Disabled* |
| | About SmartMap / About Qt | | |
| | What's This | Shift+F1 | Click a toolbar button to see help for it |

Tool buttons are toggles, and only one can be active at a time. Click the active tool again to return to normal mode.

## Workflows

### View a map

1. Choose File → New Project.
2. Choose Layer → Add Layer…. Repeat for more layers. Each new layer draws on top.
3. Use Layer Manager to reorder layers or change their colours, and the Layers panel to hide or show them.
4. Navigate with Zoom In, Zoom Out, Pan and Zoom Full.

### Annotate with a cosmetic layer

1. In an open project, choose Layer → New Cosmetic Layer… and choose a file name.
2. On the Shapes toolbar:
   - **Point**: click to place a red dot.
   - **Line**: press, drag and release. A rubber-band preview follows the cursor.
   - **Circle / Polygon**: *not implemented yet*.
3. Save the project. The `.scl` file is written alongside it, and the project records its path.

The cosmetic layer stores geographic coordinates (lon/lat). Because of that, it stays registered to the map at any zoom or pan, and you can reuse it in other projects by pointing a project's `<CosmeticLayer><Path>` at it.

### Export

Choose Edit → Copy Map Image to File… to save exactly what's currently in the map buffer as a PNG.

## Tips

- Opening a sample project from the repo requires editing its `D:/Docs/...` paths first. See [FILE_FORMATS.md](FILE_FORMATS.md).
- The map stretches to fill the window, so continents look distorted unless the window is about twice as wide as it is tall.

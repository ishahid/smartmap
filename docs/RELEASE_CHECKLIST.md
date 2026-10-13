# Release checklist

Automated tests (`npm run lint && npm run test:all`, run by CI on all three OSes) cover the Rust core and the UI logic. They can't click through the real app, so before tagging a release, go through this list on **macOS, Windows and Linux**, using the installers the release workflow builds (not `npm run app:dev`, which differs: it serves the UI from Vite and isn't bundled).

Getting test installers without a release: on GitHub, Actions → Release → Run workflow. It makes a draft release with every installer; delete the draft afterwards.

Tick each item per OS. Where something fails, note the OS and what happened.

## Install and start

| | macOS | Windows | Linux |
|---|---|---|---|
| Installer runs (macOS: right-click → Open the first time; Windows: SmartScreen → Run anyway; AppImage: `chmod +x`) | ☐ | ☐ | ☐ |
| App starts; OpenFreeMap basemap shows; status bar shows "SmartMap 2.0.0 · os/arch" | ☐ | ☐ | ☐ |
| App icon and name look right (Dock / taskbar / app menu) | ☐ | ☐ | ☐ |
| Linux ARM64 and Windows ARM64 builds start (if you have the hardware) | — | ☐ | ☐ |

## Menus and keys (step 10, never tried in the app before)

| | macOS | Windows | Linux |
|---|---|---|---|
| Menus show: File, Edit, View, Layer, Tools, Help (macOS also SmartMap and Window) | ☐ | ☐ | ☐ |
| Clicking menu items works: Open…, Save, Preferences/Settings…, Keyboard Shortcuts, About | ☐ | ☐ | ☐ |
| Every shortcut runs once (not twice): Cmd/Ctrl+O, S, Shift+S, T, F, 0, =, -, Shift+M, D, comma | ☐ | ☐ | ☐ |
| Undo label follows edits ("Undo Draw polygon"); Cmd/Ctrl+Z and Shift+Z (Ctrl+Y) undo and redo once per press | ☐ | ☐ | ☐ |
| Check marks follow the app: Globe, Measure, Attribute Table, Edit Annotations, Appearance | ☐ | ☐ | ☐ |
| Open Recent lists recent projects and opens them; Clear Menu empties it | ☐ | ☐ | ☐ |
| In the search box and a layer-name box: Cmd/Ctrl+A, C, X, V, Z act on the text, not on features | ☐ | ☐ | ☐ |
| Outside text boxes: Cmd/Ctrl+A selects all features, C/V copy and paste annotations, Delete/Backspace deletes, Esc clears | ☐ | ☐ | ☐ |
| Edit → Copy / Paste clicked with the mouse (known: does nothing on Linux; may be greyed out on macOS outside text boxes) | ☐ | ☐ | ☐ |
| Quit / Exit with unsaved changes asks first; Cmd+Q too (known: Dock → Quit doesn't ask) | ☐ | ☐ | ☐ |
| Closing the window with unsaved changes asks first | ☐ | ☐ | ☐ |

## Appearance and preferences

| | macOS | Windows | Linux |
|---|---|---|---|
| Appearance → Dark/Light changes the page *and* the window's title bar and menus | ☐ | ☐ | ☐ |
| "Use System Setting" follows the OS when it changes | ☐ | ☐ | ☐ |
| Preferences survive quitting and restarting | ☐ | ☐ | ☐ |

## Files

| | macOS | Windows | Linux |
|---|---|---|---|
| Open each format: Shapefile (legacy `world.shp`), GeoJSON, GeoPackage, FlatGeobuf, KML, KMZ, GPX, CSV | ☐ | ☐ | ☐ |
| A damaged or wrong file (e.g. a renamed `.txt` as `.fgb`) shows an error message; the app keeps running | ☐ | ☐ | ☐ |
| Drag and drop: a data file, several files, a `.smartmap` project, a `.pmtiles` file | ☐ | ☐ | ☐ |
| Save a project, quit, reopen it: layers, styles, filters, annotations, basemap and view come back | ☐ | ☐ | ☐ |
| Move the project folder (with its data) elsewhere and reopen: layers still found | ☐ | ☐ | ☐ |
| Export a layer to GeoPackage and GeoJSON; open the results in SmartMap (or QGIS) | ☐ | ☐ | ☐ |
| Paths with spaces and non-English characters (e.g. `Données/carte.geojson`) | ☐ | ☐ | ☐ |

## Map features

| | macOS | Windows | Linux |
|---|---|---|---|
| Identify, attribute table (sort, search, select ↔ map), filter, search | ☐ | ☐ | ☐ |
| Draw every annotation tool; move, reshape, rotate (Alt/Option+drag); cut/copy/paste; undo/redo | ☐ | ☐ | ☐ |
| Measure a distance and an area; the numbers agree with another tool (e.g. Google Maps → Measure distance) | ☐ | ☐ | ☐ |
| Globe view; basemap switch keeps data layers | ☐ | ☐ | ☐ |
| Offline map: open a PMTiles file, then turn networking off and pan/zoom; labels still show | ☐ | ☐ | ☐ |
| A big file (100,000+ features) opens without freezing the window; the table scrolls smoothly | ☐ | ☐ | ☐ |
| Linux only: the map draws (WebKitGTK + WebGL); try X11 and Wayland if you can | — | — | ☐ |

## Cutting the release

When the list is done and any fixes are in:

1. Merge the work into `master` and push it. Wait for CI to pass.
2. Check the version in `package.json` and `src-tauri/Cargo.toml` (both `2.0.0`), and that `CHANGELOG.md` has the release date.
3. Tag and push the tag. That starts the release workflow:

   ```bash
   git tag -a v2.0.0 -m "SmartMap 2.0.0"
   ```

   ```bash
   git push origin v2.0.0
   ```

4. When the workflow finishes, open the draft release on GitHub, check that every installer is attached (`.dmg`; x64 `.msi` and `.exe`; ARM64 `.exe`; x64 and ARM64 `.deb`, `.rpm` and `.AppImage`), then publish it.

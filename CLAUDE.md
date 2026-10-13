# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository.

## What this is

Two generations of **SmartMap**, a desktop GIS viewer and annotation tool:

- **SmartMap 2** (repo root, in progress): Rust + **Tauri 2** core, **Svelte 5 + TypeScript** UI, **MapLibre GL JS 6** map. A simple standalone app for macOS, Windows and Linux. The owner is learning Rust and TypeScript, so keep code plain and well-commented, and explain non-obvious choices. The plan and build order are in [docs/MODERNIZATION_PLAN.md](docs/MODERNIZATION_PLAN.md). Steps 1–10 (skeleton, Shapefile reader, all readers + CRS, layer panel + styling, project files, identify + attribute table + filter + search, annotation editor, measure + stats, offline tiles, shell polish) are done; next is **step 11 (hardening + release)**.
- **SmartMap 1** (`legacy/`, archived): a 2004 C++/Qt 3.2.1 MCS thesis project. Read-only history; don't modify it. Its documentation is in docs/ARCHITECTURE.md, FILE_FORMATS.md, BUILDING.md, USER_GUIDE.md, KNOWN_ISSUES.md and PROJECT_HISTORY.md.

## Commands (SmartMap 2)

| Command | Purpose |
|---|---|
| `npm ci` | Install JS dependencies |
| `npm run doctor` | Check the toolchain (Node 22+, rustup, targets, platform libraries) |
| `npm run app:dev` | Run the desktop app with hot reload |
| `npm run dev` | UI only in a browser at http://localhost:1420 (Rust commands return placeholders) |
| `npm run lint` | svelte-check + rustfmt check + clippy `-D warnings` |
| `npm run test:all` | Vitest + cargo test |
| `npm run app:build` | Installers for the host OS/CPU |
| `npm run build:mac` / `build:win` / `build:win:arm` / `build:linux` / `build:linux:arm` | Per-target builds (see docs/DEVELOPMENT.md) |

Run `npm run lint && npm run test:all` before calling work done.

## Layout

```
src/                      Svelte UI
  App.svelte              shell: menus (perform() runs every command), toolbar, sidebar, map + identify + attribute table,
                          status bar, dialogs, drag and drop
  lib/api.ts              ALL invoke() calls to Rust go through here (typed wrappers), plus dialogs and window helpers
  lib/document.svelte.ts  MapDocument store: the open project (LayerList, basemap, globe, path, missing layers, dirty flag)
  lib/layers.svelte.ts    LayerList store: the layers, their order/visibility/opacity/style/filter, the layer being edited
  lib/selection.svelte.ts Selection store: selected features (one layer at a time), highlighted on map and in the table
  lib/filter.ts           LayerFilter → MapLibre expression and JS predicate (must agree; tested against MapLibre)
  lib/features.ts         toText, featureLabel, featuresBbox, eachPosition, numericFieldsOf (cached)
  lib/history.svelte.ts   History: undo/redo command stack (annotation edits, adding/removing annotation layers)
  lib/annotate/           annotation editor: types.ts, data.ts (pure helpers), editor.svelte.ts (terra-draw glue),
                          AnnotationToolbar.svelte, AnnotationProperties.svelte
  lib/measure/            measure tool: measure.svelte.ts (map clicks), shape.ts, units.ts (formatting),
                          spherical.ts (rough browser-only fallback), MeasurePanel.svelte
  lib/stats.ts            fieldStats (count, min, max, mean, median, std dev, sum)
  lib/project.ts          pure project helpers: what a layer saves as, restoreStyle(), file names
  lib/recent.ts           Recent projects list (localStorage)
  lib/preferences.svelte.ts Preferences store: theme, units, coordinate format, basemap for new projects (localStorage)
  lib/shell/              commands.ts (commands, shortcuts, menuTemplate(), shortcut help: one source for all three),
                          menu.ts (native Tauri menu, updated in place), MenuBar.svelte (HTML menus in a browser),
                          theme.ts, Dialog.svelte (<dialog> wrapper), About/Preferences/Shortcuts dialogs
  lib/map/maplibre.ts     import MapLibre from here only (sets the worker URL)
  lib/map/MapView.svelte  the map component; syncs LayerList → MapLibre sources/layers
  lib/map/layerDiff.ts    decides between setPaintProperty-style updates and a rebuild
  lib/map/basemaps.ts     built-in basemaps (None + OpenFreeMap); "offline" means the project's tile file
  lib/map/offline.ts      offline basemap styles from a TileInfo (Protomaps / plain grey / raster), colour schemes
  lib/map/tileProtocol.ts smartmap-tiles:// MapLibre protocol → fetchTile (tiles:// from Rust)
  lib/map/BasemapPicker.svelte, OfflineHelp.svelte   basemap menu, colour scheme, "Getting offline maps"
  lib/map/types.ts        MapLayer (loaded data + name, visibility, opacity, style)
  lib/style/              LayerStyle type, MapLibre layers/expressions, colours/ramps, classification, SDF marker shapes
  lib/panel/              LayerPanel.svelte (list, reorder, rename), StyleEditor.svelte, FilterEditor.svelte, StatsPanel.svelte,
                          MissingLayers.svelte
  lib/table/              AttributeTable.svelte (virtual scrolling) + rows.ts (filter/search/sort logic)
  lib/identify/           IdentifyPanel.svelte (attributes of clicked features, picker when they overlap)
  lib/search/             SearchBox.svelte + search.ts (find features across visible layers)
  lib/util/               pure helpers with *.test.ts next to them
src-tauri/                Rust core
  src/lib.rs              Tauri builder + command registration
  src/commands.rs         #[tauri::command] fns (thin; logic goes in modules)
  src/crs.rs              SourceCrs, Reprojector (proj4rs): .prj/EPSG → WGS84
  src/project.rs          .smartmap project files: load/save, relative ↔ absolute layer paths, inline annotation layers
  src/export.rs           export a layer (GeoJSON from the UI) to .geojson or .gpkg
  src/analysis.rs         geodesic length/area/perimeter on WGS84 (geo crate)
  src/tiles/              offline basemaps: mod.rs (TileServer, TileInfo, respond), pmtiles.rs, mbtiles.rs;
                          lib.rs registers the tiles:// protocol that calls TileServer::respond
  src/io/mod.rs           Layer, RawLayer, IoError, open_file() dispatch, finish() (reproject, ids, bbox, warnings)
  src/io/<format>.rs      one reader per format: shapefile, geojson, geopackage, flatgeobuf, kml, gpx, csv
  tests/                  integration tests: shapefile_reader.rs (legacy samples), readers.rs (tests/fixtures/;
                          GeoPackage, FlatGeobuf and KMZ files are built at test time), project.rs, export.rs, measure.rs,
                          tiles.rs (PMTiles/MBTiles files built at test time)
  examples/dump_layer.rs  `cargo run --example dump_layer -- <file>` prints the layers' JSON
  examples/tile_server.rs dev-only HTTP tile server on :1422 so `npm run dev` can show offline maps
public/basemap/           Protomaps icon sheets (sprites) for offline maps, served from the app itself
  tauri.conf.json         window, CSP, bundle config (version comes from package.json)
  capabilities/           UI permissions
  icons/                  generated from app-icon.svg; don't hand-edit
scripts/doctor.mjs        toolchain checker
.github/workflows/        ci.yml (lint+test, 3 OSes), release.yml (installers on v* tags)
legacy/                   2004 source + thesis (do not modify)
docs/                     plan, dev guide, legacy knowledge base
```

## Conventions (SmartMap 2)

- **Rust ↔ UI contract:** add a `#[tauri::command]` in `commands.rs`, register it in `lib.rs` `generate_handler!`, and add a typed wrapper in `src/lib/api.ts`. The UI never calls `invoke` directly.
- **Data crosses IPC as GeoJSON in WGS84 (EPSG:4326).** Rust does file I/O, parsing and reprojection. TypeScript does UI, map interaction and editing.
- **Pure-Rust crates only.** No GDAL, PROJ or other C libraries, so every OS builds with plain `cargo`. `rusqlite` with `bundled` is fine.
- **Svelte 5 runes** (`$state`, `$derived`, `$effect`, `$props`), not Svelte 4 stores or `export let`.
- **Shared UI state lives in stores** (`*.svelte.ts` classes with rune fields, like `LayerList`). Components call store methods; they don't edit layers themselves.
- **Styles are plain data** (`LayerStyle`), turned into MapLibre layers by the pure `styleLayersFor()`. Put styling logic there (and test it), not in components or MapView. A new style field needs a value in `defaultStyle()`; old projects get it from there via `restoreStyle()`.
- **Feature ids are positions.** Rust numbers features 0..n in file order (`io::finish`), so `features[id]` is the feature with that id. Selection, the table, identify and the map highlight all rely on it.
- **Annotation layers are MapLayers with `annotations` set** (null for data layers). Their features keep stable UUIDs; `data` is rebuilt from them by `LayerList.setAnnotations` (numbered by position like any layer), so the table, identify, search and map treat them like data. Change annotations through `AnnotationEditor.change()` / `updateProperties()` so the edit is undoable; `setAnnotations` alone bypasses history.
- **terra-draw only edits shapes.** The layer's own MapLibre layers (`annotationLayersFor`) draw annotations with their real style, also while editing; terra-draw draws thin outlines and handles on top (`td-*` layers, kept on top by MapView). Properties stay in the LayerList. Per-feature style overrides are properties (`color`, `strokeColor`, `width`, `fillOpacity`, `size`, `shape`) read with `["coalesce", ["get", …], layerValue]`.
- **Measurements come from Rust** (`measureGeometry` in api.ts → `analysis::measure`, geodesic on WGS84). In a plain browser (`npm run dev`) the same call uses `measure/spherical.ts`, a rougher sphere-based stand-in, so the UI can be tried there; don't use it in the desktop app.
- **Offline basemaps:** Rust opens the file (`open_tiles` → `TileServer::open`, which gives it an id) and answers `tiles://localhost/<id>/<z>/<x>/<y>`. MapLibre's styles use `smartmap-tiles://<id>/…` instead (tileProtocol.ts fetches from tiles:// on the page), so styles are the same on every OS and in the browser (where api.ts uses the dev tile_server). Offline styles must not set `glyphs`: without it MapLibre draws text with the OS fonts, which is what keeps labels offline. Choosing a basemap goes through `MapDocument` (`basemapId`, `offlineMap`, `useOfflineMap`, `setFlavor`).
- **Filters have two implementations** (`filterExpression` for MapLibre, `filterPredicate` for the table and search). Change both together; filter.test.ts runs every case through MapLibre's own evaluator to keep them in agreement.
- **Project files:** Rust owns the file (format marker, version, relative paths); the UI owns what's inside a layer's `style` (Rust stores it as opaque JSON). Anything that should be saved goes in `MapDocument.toProject()` *and* its snapshot, or it won't mark the project as changed. If the format changes incompatibly, bump `project::VERSION` and upgrade old files in `project::load`.
- **Use `$state.raw` for anything holding GeoJSON** and replace it rather than mutating it (`layers = [...layers, x]`). Plain `$state` deep-proxies every coordinate, which is slow, and MapLibre can't post proxies to its worker.
- **Adding a command:** add its id to `CommandId` and an entry in `menuTemplate()` (commands.ts), a shortcut in `SHORTCUTS` if it has one (Cmd/Ctrl only), and a `case` in App's `perform()`. The menus, the keyboard and the Keyboard Shortcuts help all follow. Commands return false when they had nothing to do (Copy with nothing selected), so the key keeps its usual meaning.
- **Preferences** live in `Preferences` (preferences.svelte.ts), saved by an `$effect` in App. A new one needs a field, a default and a check in `parsePreferences()`, and a control in PreferencesDialog.
- **Colours are CSS variables** in app.css. Dark values appear twice (OS dark mode, and `data-theme="dark"`); change both.
- **Adding a format:** new module in `src-tauri/src/io/` with `read(path) -> RawLayer` (features + `SourceCrs`; `io::finish` does reprojection, ids, bbox and warnings), one match arm in `io::open_file`, the extension in `io::EXTENSIONS` and `FORMATS` (`src/lib/api.ts`), and integration tests.
- **Readers report CRS problems as `warnings`, not errors.** A layer with an unknown or unsupported CRS still opens (coordinates unchanged) and says why.
- **Tests:** Rust unit tests in-module (`#[cfg(test)]`), Rust integration tests in `src-tauri/tests/`, and TS tests as `*.test.ts` beside the code.
- **Keep commands thin** and put logic in modules (`io/`, `crs.rs`, `project.rs`, `export.rs`, `analysis.rs`, `tiles/`).

## Gotchas

- **Tauri versions must match at major.minor** between the `tauri` crate and `@tauri-apps/api` / `@tauri-apps/cli` (pinned `~2.11`), or `tauri build` errors. Bump them together.
- **MapLibre 6 has named exports only** (`MapLibreMap`, `NavigationControl`, …), and its worker must be set via `setWorkerUrl`. That's done in `src/lib/map/maplibre.ts`, so always import from there.
- **Layer ids are never reused**, not even after `LayerList.clear()` (New / opening a project). MapView matches layers by id, so a reused id would keep showing the old layer's data.
- **terra-draw sends events for changes the editor makes itself** (loading features, selecting). `AnnotationEditor.#quiet` ignores them; without it, moving the selection to a new feature cleared the whole selection. Wrap any new programmatic terra-draw call the same way.
- **A basemap switch wipes terra-draw's map layers.** MapView's `onStyleLoad` makes the editor restart on the same layer. terra-draw's default select-mode keys (Ctrl+R rotate, Ctrl+S scale, Delete) clash with the app, so they're remapped in `editor.svelte.ts` (Alt/Option+drag rotates; Delete goes through the app so it can be undone).
- **Polygon ring direction varies between files** (Shapefiles wind outer rings clockwise, GeoJSON anticlockwise). `geo`'s geodesic area uses the direction to tell inside from outside, so `analysis.rs` re-orients every polygon first; a "backwards" ring would otherwise measure as the whole Earth minus the shape.
- **The map's tools share clicks:** annotation editing, the measure tool and identify are mutually exclusive (App stops one when another starts, and `onFeatureClick` ignores clicks while either tool is on). MapView's `cursorMode` leaves the cursor to terra-draw while editing.
- **Never reuse a MapLibre layer id for a different layer type** (e.g. circle → symbol). Tiles cache data per layer id and symbol placement crashes on the stale data. That's why point layers are `…-point-circle` / `…-point-icon`.
- **Switch styles with `setStyle(style, { diff: false })`.** With diffing, MapLibre may patch the old style into the new one, removing our layers without firing `style.load`, so nothing adds them back.
- **Protomaps files come in two layer schemes.** @protomaps/basemaps styles scheme 4 (`kind`); files made before late 2024 are scheme 3 (`pmap:kind`) and would show almost nothing with it, so `protomapsScheme()` reads the metadata `version` and gives them the plain grey style. The pmtiles.io Florence sample is scheme 3.
- **Basemap switches wipe MapLibre sources** (and images: point-shape icons are re-added through `styleimagemissing`). `MapView` re-adds data layers on every `style.load` (via `styleVersion`), so keep that path working when changing layer code.
- **CSP** in `tauri.conf.json` only allows `tiles.openfreemap.org`, plus `tiles:` and `http://tiles.localhost` (offline maps; Windows uses the latter). New network hosts need adding to `img-src` and `connect-src`.
- **`serde_json` has `preserve_order`** so attributes keep file order (the attribute table relies on it). Don't remove the feature.
- **proj4rs works in radians** for longitude/latitude. `crs::Reprojector` converts; don't call `proj4rs::transform` elsewhere.
- **Minimum Rust is 1.88** (`rust-version` in Cargo.toml), needed by `zip` 9.
- **Testing drawing in the browser pane:** `left_click_drag` doesn't drive terra-draw; dispatch `PointerEvent`s (`pointermove`/`pointerdown`/`pointerup` with `pointerId: 1, isPrimary: true, pointerType: "mouse"`) on `__smartmapMap.getCanvas()`, using `map.project([lng, lat])` for positions.
- **Browser-pane testing:** when the preview pane is hidden, `requestAnimationFrame` is paused and MapLibre doesn't render, so state looks stale (and `queryRenderedFeatures` finds nothing). Worse, piling up many style changes with no frames, then forcing one with a screenshot, can make MapLibre throw `addBucket … reading 'length'`, which doesn't happen with frames running. For reliable map testing in a hidden pane, first run `window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)` in the page. In dev, `window.__smartmapMap` is the MapLibre map and `window.__smartmapAddLayer(json)` adds layers from `cargo run --example dump_layer` output.
- **Shortcuts reach the menu differently per OS** (macOS: page first, then the menu if not prevented; Linux: GTK menu first; Windows: never, only clicks). App's `run()` ignores the same command from the other source within 400 ms, and `onMenuCommand` does Undo/Select All for a focused text box itself. Cut/Copy/Paste are the OS's own menu items (only the OS can paste into a text box); on macOS a click on them arrives as a DOM `copy`/`cut`/`paste` event, handled in App. Never put Delete, Backspace or Esc on a menu item.
- **The native menu, window theme, drag and drop and Quit haven't been tried in the desktop app** (the dev sandbox can't open windows). Check them in step 11; the HTML MenuBar in `npm run dev` exercises the same commands.
- **TypeScript is pinned to 6.x** because svelte-check doesn't support TS 7 yet.
- **Vite 8 minifies with oxc.** Don't set `minify: "esbuild"`, because esbuild isn't installed.
- **This machine:** the `rustc` on PATH is Homebrew's (it can't add Rust targets), and the default `node` is v18. Use Node 22 (`~/.nvm/versions/node/v22.23.3/bin`). Sandboxed shells can't write `~/.npm` or `~/.cargo`, so set `npm_config_cache=$TMPDIR/npm-cache` and `CARGO_HOME=$TMPDIR/cargo-home` when running npm or cargo there.
- **Tauri can't truly cross-compile.** macOS builds need macOS and Linux builds need Linux. Release installers come from CI (`release.yml`).

## Legacy (2004) quick facts

- C++ against **Qt 3.2.1**, MSVC 6-era code (relies on `for`-loop scope leakage). It doesn't build with modern Qt or compilers.
- Its Shapefile parser misreads the header and drops the first 1–4 records of each file (docs/KNOWN_ISSUES.md #1). The bundled samples in `legacy/source/data/` have known true record counts: world 251, Country Boundaries 2 15, Water Bodies 2 22, Streets and Railroads 1 189, meanmotp 248. They're good fixtures for SmartMap 2's readers.
- The thesis (`legacy/documents/SmartMap.docx`) holds use cases UC1–UC26 and the SRS. Extract text with `textutil -convert txt -stdout legacy/documents/SmartMap.docx`.

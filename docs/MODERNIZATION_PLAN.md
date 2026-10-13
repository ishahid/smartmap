# SmartMap 2 — modernisation plan

**Goal:** rebuild SmartMap as a simple, standalone desktop GIS app that runs on Linux, macOS and Windows. It should keep the spirit of the 2004 original (view map layers and draw your own annotation layer on top) and add proper formats, projections, basemaps, attributes and a complete editor.

## Decisions (from the interview, 10 Oct 2026)

| Topic | Decision |
|---|---|
| Stack | **Rust + Tauri 2** shell, **Svelte 5 + TypeScript** UI, **MapLibre GL JS** map. Kept as simple as possible: one standalone app with no server, no accounts and no database server. |
| Data libraries | **Pure Rust only.** No GDAL or other C libraries to install, so `cargo tauri build` works on every OS. GDAL can come later as an optional add-on. |
| Audience | Personal / learning project |
| Experience | New to both Rust and TypeScript, so the plan includes a learning track and keeps each layer thin |
| Features | All four areas: formats + projections, a full annotation editor, basemaps + offline tiles, attributes + analysis |
| Legacy files | No compatibility with `.smproj` / `.scl` needed. This is a clean break. |
| Delivery | Big-bang: design everything up front, build in a fixed order, release once at the end |

## Why this stack

- **Tauri 2** runs a Rust backend inside the OS's own web view. Installers are typically a few MB (versus 100 MB+ for Electron), and one codebase builds for all three OSes.
- **MapLibre GL JS** gives a GPU-rendered, smooth map with zoom, rotation and an optional globe view. It handles all the drawing that `MapWindow`, `Convert` and the `Shape*` classes did by hand in 2004.
- **Svelte 5** has the least boilerplate of the major UI frameworks, which matters when you're learning.
- **Pure Rust readers** avoid the single biggest cross-platform headache in GIS software, which is bundling GDAL and PROJ native libraries.
- GeoLibre Desktop (Tauri v2 + MapLibre) shows the overall approach works.

**One honest constraint:** MapLibre displays maps in Web Mercator (or as a globe). "Projections" here therefore means *reading data in any coordinate system and reprojecting it correctly for display*, plus showing coordinates in a CRS you choose. Choosing an arbitrary *display* projection (for example Lambert conformal) would need a different renderer, and it's out of scope.

## Architecture

```
┌──────────────────────────── SmartMap 2 (one app) ────────────────────────────┐
│  UI: Svelte 5 + TypeScript (runs in the OS web view)                           │
│   ├── MapView        MapLibre GL JS map + terra-draw editing tools             │
│   ├── LayerPanel     order (drag), visibility, opacity, style editor           │
│   ├── AttributeTable virtual-scrolling table, filter, select ↔ map highlight   │
│   ├── Toolbar        navigate / identify / measure / draw tools                │
│   └── stores/        project state, selection, undo/redo stack                 │
│               ▲  Tauri commands (invoke) + events      │ tiles:// protocol     │
│               │  GeoJSON in WGS84, attribute rows      ▼                       │
│  Core: Rust                                                                    │
│   ├── io/        readers: Shapefile, GeoJSON, GeoPackage, FlatGeobuf, KML,     │
│   │              GPX, CSV(lat/lon); writers: GeoJSON, GeoPackage, Shapefile    │
│   ├── crs/       detect CRS (.prj / gpkg srs / default), reproject → EPSG:4326 │
│   ├── project/   load/save .smartmap project files (JSON)                      │
│   ├── tiles/     serve local PMTiles/MBTiles to MapLibre via custom protocol   │
│   └── analysis/  geodesic distance/area, attribute stats for styling           │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Division of work:** Rust does file I/O, format parsing, reprojection, tile serving and anything heavy. TypeScript does UI, map interaction and editing. Data crosses the boundary as **GeoJSON in WGS84**, the format MapLibre consumes natively. Because you're new to both languages, this split keeps each side small and easy to reason about.

**Size limit:** passing GeoJSON over Tauri IPC is comfortable up to roughly tens of MB per layer. That's far beyond anything the 2004 app handled. Pre-tiling very large datasets is a later enhancement.

## Technology choices

### Rust crates

| Need | Crate | Notes |
|---|---|---|
| App shell | `tauri` 2.x | Plus plugins `dialog`, `fs` and `store` (recent files and settings) |
| Geometry types / algorithms | `geo`, `geo-types` | Geodesic length and area for the measure tool |
| GeoJSON | `geojson` | Read and write. Also the IPC format. |
| Shapefile + .dbf attributes | `shapefile` | Read and write. The crate's last release was 2024. If it gets in the way, use `geozero` (`with-shp`) for reading. |
| GeoPackage | `rusqlite` (feature `bundled`) + `geozero` (`with-wkb`) | `bundled` compiles SQLite from source, so there's no system dependency. geozero's own `with-gpkg` pulls in async `sqlx`, so we query with rusqlite and only use geozero to decode the geometry blobs. |
| FlatGeobuf | `flatgeobuf` 6.x | Actively maintained |
| KML / GPX / CSV | `kml` (no default features), `zip` (deflate only, for KMZ), `gpx`, `csv` | CSV loads as points from lat/lon columns |
| Reprojection | `proj4rs` 0.2 (feature `crs-definitions`, the EPSG table) + `proj4wkt` | Works in radians and has no WKT parsing. `crs.rs` tries the WKT's own EPSG code, then common ESRI names, then `proj4wkt` (WKT → PROJ.4 string). |
| Offline tiles | `pmtiles` crate, plus `rusqlite` for MBTiles | Served through Tauri's `register_uri_scheme_protocol` |
| Errors / serde | `thiserror`, `serde`, `serde_json` | |

Check each crate's latest version on crates.io when you start. GeoRust release cadence varies.

### Frontend packages

| Need | Package |
|---|---|
| UI framework | Svelte 5 + Vite + TypeScript (plain Svelte, not SvelteKit: a single-window app needs no routing or SSR) |
| Map | `maplibre-gl` |
| Drawing / editing | **`terra-draw`** with its MapLibre adapter. It supports point, line, polygon, circle, rectangle and freehand drawing, plus select, drag, resize and rotate. It saves writing editing tools from scratch, which was the part of the 2004 app that never got finished. |
| Offline basemap in the browser | `pmtiles` JS protocol (only if you skip the Rust tile server) |
| Geometry helpers | `@turf/turf`, only for small client-side operations (for example a buffer preview) |
| Tauri API | `@tauri-apps/api`, `@tauri-apps/plugin-dialog` |
| Tests | `vitest` |

### Basemaps

- **Online:** OpenFreeMap styles (for example `https://tiles.openfreemap.org/styles/liberty`). It's free, needs no API key, allows commercial use and works directly with MapLibre.
- **Offline:** Protomaps basemap as **PMTiles**. Cut a regional extract with the `pmtiles extract` CLI (the full planet is about 120 GB, while a country at maxzoom 12–14 is a few hundred MB). Keep the fonts (glyphs) and sprites local too, or the map will still try to reach the network.
- **Attribution:** show "© OpenStreetMap contributors" on the map (required by the ODbL licence).

## Feature specification

### 1. Projects and files

- A project is a single **`.smartmap` file (JSON)**. It holds the map view (centre, zoom, bearing), the basemap choice, a list of layers (file path, style, visibility, opacity, order) and the annotation layers embedded as GeoJSON.
- Layer paths are stored *relative to the project file* where possible, so projects survive being moved. (The 2004 app used absolute `D:/` paths.)
- New / Open / Save / Save As, a recent-files list and an unsaved-changes prompt.
- Drag-and-drop a data file onto the window to add it as a layer.
  - *As built (step 5):* one **Open…** button (Ctrl/Cmd+O) takes projects and data files: a project replaces the current one, data files are added as layers. The file also stores the absolute path of each layer as a fallback for when only the project file is moved, the pitch and globe setting, and a `"format": "smartmap-project", "version": 1` marker. Layers whose files are missing stay in the project (listed under "Not found" and saved back) until removed. Moving the map doesn't count as an unsaved change. The Recent list is a toolbar drop-down kept in the webview's localStorage; it moves into the File menu in step 10, along with drag-and-drop and asking about unsaved changes on Cmd+Q (closing the window already asks).

### 2. Data layers (formats + projections)

- **Read:** Shapefile (`.shp` + `.dbf` + `.prj`), GeoJSON, GeoPackage (pick a table if there are several), FlatGeobuf, KML, GPX, and CSV with lat/lon columns.
- **Export a layer or annotations to:** GeoJSON, GeoPackage, Shapefile.
- **CRS handling:** detect the CRS from `.prj` or the GeoPackage SRS table. When it's unknown, ask the user, defaulting to EPSG:4326. Reproject to EPSG:4326 in Rust before sending to the UI.
  - *As built (step 3):* an unknown CRS is assumed to be EPSG:4326 and the layer gets a warning if its coordinates don't look like degrees. An unsupported CRS opens unconverted, with a warning. Asking the user is left for the layer panel (step 4) or shell polish (step 10).
- The status bar shows cursor coordinates in decimal degrees, DMS or a user-chosen CRS (for example UTM), plus a scale bar.
- Navigation: scroll zoom, drag pan, rotate/tilt, zoom to layer, zoom to selection, zoom to full extent, and a globe on/off toggle.
- **Layer panel:** drag to reorder, visibility checkbox, opacity slider, rename, remove, and a feature count.
- **Styling:**
  - single symbol (fill, stroke, width, point size, shape and icon)
  - categorized by attribute (a unique colour per value)
  - graduated by attribute (colour ramp over numeric ranges)
  - labels from an attribute
  - *As built (step 4):* point shapes are circle, square, triangle, diamond and star (SDF icons, recoloured by MapLibre). Custom image icons and a "choose CRS" prompt for unknown coordinate systems are not done yet; both fit step 10 (shell polish). Reordering uses pointer events, not HTML drag-and-drop, so it won't clash with Tauri's file drop.

### 3. Annotation editor (the "cosmetic layer", done properly)

- Multiple annotation layers per project, each with its own style.
- **Tools:** point, line, polygon, rectangle, circle, freehand, text label and icon/marker.
- **Select tool:** click or box-select, move, resize, rotate and edit vertices.
- **Edit actions:** cut, copy, paste, delete and duplicate. Undo/redo through a command stack covering all edits (Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z).
- **Per-feature properties:** name, description and style overrides. These show in the attribute table like any other layer.
- Snapping to vertices of other layers (optional toggle).
- Export annotations as GeoJSON or GeoPackage, so other tools (QGIS, for example) can open them.
- *As built (step 7):* terra-draw 1.35 with its MapLibre adapter 1.4.1. Annotation layers sit in the layer list like data layers (so they get the table, identify, search, filter, reorder and opacity) and are saved inline in the project (`annotation` on the layer entry; the top-level `annotations` field is gone). Each annotation layer is drawn by its own MapLibre layers with per-feature overrides, also while editing; terra-draw only draws outlines and handles. Tools: point, marker (the five SDF shapes), text, line, polygon, rectangle, circle, freehand. Select mode moves features, drags/adds/removes vertices, resizes rectangles and circles from their handles and rotates with Option/Alt+drag. Undo/redo is SmartMap's own command stack (`History`), not terra-draw's, so it also covers property edits, paste/delete/duplicate and adding/removing annotation layers; it's cleared by New/Open. Copy works on any selection (data-layer features become annotations, multi-part shapes split) and also puts GeoJSON on the system clipboard. Snapping goes to vertices of any visible layer within 10 px (line and polygon drawing and vertex dragging). Any layer can be exported to GeoPackage or GeoJSON (`export.rs`). Not done: box-select (terra-draw selects one feature at a time; select several in the attribute table), snapping for rectangle/circle/freehand, Shapefile export.

### 4. Attributes and analysis

- **Identify:** click a feature to see all its attributes in a side panel. When several features overlap, show a picker.
- **Attribute table:**
  - virtual scrolling (fast with 100k rows)
  - sort and per-column text search
  - selecting a row highlights the feature and selecting a feature highlights its row
  - "zoom to selected"
- **Filter:** a simple query builder (`field` `operator` `value`, combined with AND/OR) that compiles to a MapLibre filter expression, so only matching features show.
- **Search:** find features by attribute value across visible layers.
- **Measure:** geodesic distance (polyline) and area (polygon), computed in Rust with `geo`, with selectable units.
- **Basic stats** for numeric fields (min, max, mean, count). These also feed graduated styling.
- *As built (step 8):* `analysis.rs` measures with geo 0.33's Karney geodesics after re-orienting polygon rings (Shapefile and GeoJSON wind them oppositely). Tests check 1° of equator (exact), equator to pole (10,001,965.729 m), JFK–LHR (5,551.76 km), a 1°×1° cell against the ellipsoid zone formula, holes, ring direction, and that `world.shp`'s countries add up to Earth's land area. The measure tool (📏 in the toolbar) does distance and area with a live reading; double-click or Enter finishes, Backspace removes a point, Esc clears. Units: metric, imperial, nautical (kept for the session; saving the choice comes with preferences in step 10). Identify shows a feature's length, area and perimeter, or a point's position. A Statistics panel under the filter gives count, min, max, mean, median, standard deviation and sum for the features the filter shows, or only the selected ones; the graduated style shows the field's range and mean. In `npm run dev` (no Rust) measurements fall back to a spherical approximation, labelled as such.
- *As built (step 6):* identify shows in a panel over the map's top-left corner; clicking empty map clears it and the selection. The selection belongs to one layer at a time and is highlighted by a few extra MapLibre layers that pick the selected features by id (`["in", ["id"], …]`) rather than by feature-state, so no data layer's paint has to know about selection and it works for icons too. The table docks under the map (drag its top edge to resize), draws only the visible rows (24 px each) and was tried with 50,000 points. Filters compare numbers on numeric fields and text (ignoring case) otherwise; unfinished conditions are ignored; they're saved in projects. Search scans the visible layers' attributes for text, skips filtered-out features and lists the first 100 hits. Not done: Shift+click on the map to add to the selection, keyboard row navigation in the table, and a "zoom to full extent" button (step 10).

### 5. Basemaps and offline use

- Basemap picker: none, OpenFreeMap (several styles) or a local PMTiles/MBTiles file.
- Local tiles are served by the Rust `tiles://` protocol, so the app works fully offline.
- A "Getting offline maps" help page explains how to use `pmtiles extract`. No in-app download manager in v1.
- *As built (step 9):* `src-tauri/src/tiles/` reads PMTiles v3 (its own small reader: header, varint directories, leaf directories, Hilbert tile ids, gzip via `flate2`; no async `pmtiles` crate needed) and MBTiles (rusqlite, TMS rows flipped), and serves tiles through `register_asynchronous_uri_scheme_protocol("tiles")`. MapLibre asks for `smartmap-tiles://<id>/{z}/{x}/{y}`, a protocol registered with `addProtocol` that fetches from tiles:// on the page itself (worker requests to custom schemes aren't reliable in every web view). Styles come from `@protomaps/basemaps` (five colour schemes, labels in the OS language where available); older Protomaps files (scheme v3), other vector tiles and raster tiles get simpler styles. Offline styles have no `glyphs` URL, so MapLibre 6 draws all label text with the OS fonts: no font files to bundle, and Urdu/Arabic and other scripts shape correctly. The Protomaps icon sheets (~170 KB, MIT) are bundled in `public/basemap/`. A "None" basemap was added too. Projects save the offline file (relative path) and colour scheme in `offlineMap`. Tested with tiles built in the tests, and visually with the pmtiles.io Florence sample in the browser through the dev `tile_server` example; the native tiles:// path hasn't been tried in the desktop app yet.

### 6. App shell

- Native menus (File, Edit, View, Layer, Tools, Help) with platform shortcuts (Cmd on macOS, Ctrl elsewhere).
- Light and dark theme that follows the OS.
- Preferences: units, coordinate format and the default basemap.
- About dialog crediting the original 2004 SmartMap and its authors.

### Out of scope for v1

- Raster files (GeoTIFF and so on). These need GDAL; planned for v2 as an optional feature.
- Editing the *geometry* of imported data layers (only annotation layers are editable).
- Custom display projections, printing/PDF layouts, auto-update, code signing and a web version.

## Repository layout

The 2004 code moves to `legacy/`, untouched, for history. The new app lives at the repo root:

```
smartmap/
├── legacy/                 # 2004 Qt3 source + thesis documents (moved, unchanged)
├── src-tauri/              # Rust core
│   ├── src/
│   │   ├── main.rs         # Tauri setup, command registration, tiles:// protocol
│   │   ├── commands.rs     # #[tauri::command] functions (thin wrappers)
│   │   ├── io/             # one module per format + mod.rs dispatch by extension
│   │   ├── crs.rs
│   │   ├── project.rs
│   │   ├── tiles.rs
│   │   └── analysis.rs
│   ├── tests/              # integration tests with fixture files
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                    # Svelte UI
│   ├── lib/
│   │   ├── map/            # MapView, layer ↔ MapLibre source/layer sync, draw tools
│   │   ├── panels/         # LayerPanel, AttributeTable, Identify, StyleEditor
│   │   ├── stores/         # project, selection, history (undo/redo)
│   │   └── api.ts          # typed wrappers around invoke()
│   ├── App.svelte
│   └── main.ts
├── tests/fixtures/         # sample data (reuse legacy/source/data/*.shp + new formats)
├── docs/
└── .github/workflows/build.yml
```

## Build order

You chose a single release at the end, but the work still has to happen in some order. This order means each step builds on code that already works and can be tested. Checkpoints are internal, not releases.

| # | Step | Done when | Learning focus |
|---|---|---|---|
| 0 | **Learning sprint** | You've worked through the Rust Book ch. 1–10 and the Svelte tutorial, run the Tauri "create-tauri-app" Svelte-TS template, and loaded the MapLibre "display a map" example | Ownership, `Result`, structs and enums; Svelte runes (`$state`, `$derived`) |
| 1 | **Skeleton** (built on macOS; Linux/Windows CI not yet run) | Tauri + Svelte + MapLibre window with an OpenFreeMap basemap, opening on all 3 OSes through CI, plus build/release tooling for every target | Tauri config, IPC basics, GitHub Actions |
| 2 | **First reader** ✅ | Open a Shapefile → Rust parses it → GeoJSON → shown on the map. Fixture test: `world.shp` has **251** features (the 2004 parser lost one). | Rust I/O, serde, error handling |
| 3 | **All readers + CRS** ✅ | Every v1 format loads, and `.prj` reprojection is verified against known coordinates (EPSG Guidance Note 7-2 Transverse Mercator example, Web Mercator formula, UTM origin) | One `read()` function per format module (simpler than a trait for now), proj4rs |
| 4 | **Layer panel + styling** ✅ | Reorder, visibility, opacity, single, categorized and graduated styles, labels | Svelte stores, MapLibre style expressions |
| 5 | **Project files** ✅ | Save and reopen a project that restores everything, with relative paths | serde round-trips |
| 6 | **Identify + attribute table + filter + search** ✅ | Selection syncs between table and map, and filters apply | Virtual lists, MapLibre feature-state |
| 7 | **Annotation editor** ✅ | All draw tools, select/move/resize, cut/copy/paste, undo/redo, export | terra-draw, command pattern |
| 8 | **Measure + stats** ✅ | Geodesic distance and area match a reference tool within 0.1% | `geo` crate |
| 9 | **Offline tiles** ✅ | A local PMTiles basemap renders with networking off | Custom URI protocol, byte ranges |
| 10 | **Shell polish** | Menus, shortcuts, theme, preferences, about, drag-and-drop, recent files | Tauri menus / plugins |
| 11 | **Hardening + release** | Test pass on all 3 OSes, docs updated, CI builds installers (`.msi`/`.exe`, `.dmg`, `.AppImage`/`.deb`), tagged v2.0.0 | |

**Rough effort**, part-time and learning as you go:

| Steps | Estimate |
|---|---|
| 0 | 2–3 weeks |
| 1–3 | 4–6 weeks |
| 4–6 | 4–6 weeks |
| 7 | 3–4 weeks (the hardest UI step) |
| 8–11 | 3–4 weeks |
| **Total** | **about 4–6 months** |

**Risk of big-bang:** with nothing released until the end, it's easy to stall. The CI builds from step 1 onward mean you always have a working installer to try, even though nothing gets released.

## Testing

- **Rust:**
  - `cargo test` with fixture files for every reader (feature counts, first and last coordinates, attribute values)
  - CRS round-trip tests
  - project save/load round-trip
  - geodesic measurement checks
- **Frontend:** `vitest` for stores (undo/redo, filter-expression builder, style generation).
- **Manual checklist per OS:** open each format, edit annotations, save and reopen, go offline.
- **CI:** see the next section.

## Build and release tooling

The details live in [DEVELOPMENT.md](DEVELOPMENT.md). In summary:

**Supported targets (8 builds, 5 shipped by CI):**

| OS | CPUs | Installers | Built by |
|---|---|---|---|
| macOS | Universal (Apple Silicon + Intel), or either one | `.dmg`, `.app` | CI `macos-latest`, or any Mac |
| Windows | x64, ARM64 | `.msi` + `.exe` (x64), `.exe` (ARM64) | CI `windows-latest`, or any Windows PC. Experimental cross-build from macOS/Linux with `cargo-xwin`. |
| Linux | x64, ARM64 | `.deb`, `.rpm`, `.AppImage` | CI `ubuntu-22.04` / `ubuntu-22.04-arm`, or any Linux machine |

**Tooling:**

- **npm scripts** wrap every build: `build:mac`, `build:mac:arm`, `build:mac:intel`, `build:win`, `build:win:arm`, `build:win:cross`, `build:linux`, `build:linux:arm`, plus `app:dev`, `app:build`, `lint`, `test:all`.
- **`npm run doctor`** checks Node, rustup, the Rust targets and the platform libraries, and prints a fix for each problem. It also catches Homebrew Rust, which can't add targets.
- **`rust-toolchain.toml` and `.nvmrc`** pin the toolchains for rustup, nvm and CI.
- **`ci.yml`** runs lint and tests on Linux, macOS and Windows for every push and PR.
- **`release.yml`** builds all five shipped installers on native runners with `tauri-action` when you push a `v*` tag (or run it by hand), and attaches them to a draft GitHub release.
- **Builds are unsigned** for now. The workflow is ready for Apple/Windows signing secrets if you ever add them.

**Why CI does the release builds:** Tauri can't truly cross-compile. macOS builds need Apple's SDK, Linux builds need WebKitGTK, and Windows cross-builds are experimental and can't produce `.msi` files. Native runners avoid all of that.

## Platform notes

- **Linux:** Tauri needs `webkit2gtk-4.1` at build time; the AppImage bundles it.
- **macOS:** unsigned builds trigger Gatekeeper, so right-click → Open the first time. That's fine for personal use, and signing needs an Apple Developer account.
- **Windows:** uses the WebView2 runtime, which is preinstalled on Windows 10/11; the installer can bootstrap it.
- **Web view differences:** WebKitGTK on Linux sometimes lags on WebGL. Test MapLibre on Linux early, in step 1.

## Mapping from the 2004 design

| 2004 (Qt3/C++) | SmartMap 2 |
|---|---|
| `MapLayer` hand-written `.shp` parser | `io/` readers (crates), with attributes and CRS |
| `Convert` static plate-carrée maths | MapLibre (Web Mercator / globe) + proj4rs reprojection |
| `MapWindow` double buffer, `bitBlt` pan | MapLibre GPU rendering |
| `CosmeticLayer` + `ShapeCL*` (`.scl` XML) | Annotation layers (GeoJSON in the project, terra-draw tools) |
| `.smproj` XML, absolute paths | `.smartmap` JSON, relative paths |
| `LayerPanel` / `LayerManager` / `RemoveLayerDialog` | One LayerPanel with drag reorder and a style editor |
| Stubbed cut/copy/paste/delete, print, help | Implemented (except print) |
| `QWorkspace` MDI | One project per window. Tauri can open several windows if needed. |

## Sources

- [awesome-georust](https://github.com/pka/awesome-georust), [geozero](https://github.com/georust/geozero), [GeoRust org](https://www.github.com/georust)
- [flatgeobuf crate](https://docs.rs/crate/flatgeobuf/latest), [geoarrow crate](https://docs.rs/geoarrow), [shapefile crate](https://rust-digger.code-maven.com/crates/shapefile)
- [proj4rs](https://docs.rs/crate/proj4rs/latest)
- [GeoLibre Desktop (Tauri + MapLibre prototype)](https://github.com/saikosis/geolibre)
- [Protomaps PMTiles + MapLibre](https://docs.protomaps.com/pmtiles/maplibre), [Protomaps basemap downloads](https://docs.protomaps.com/basemaps/downloads)
- [OpenFreeMap](https://openfreemap.org)
- [Tauri v2 frontend guide (Svelte)](https://v2.tauri.app/start/frontend/sveltekit/)
- [walkers (egui map widget, considered)](https://docs.rs/walkers/latest/), [pyogrio install notes (Python option, considered)](https://pyogrio.readthedocs.io/en/latest/install.html)

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
| GeoPackage | `rusqlite` (feature `bundled`) + `geozero` (GPKG/WKB) | `bundled` compiles SQLite from source, so there's no system dependency |
| FlatGeobuf | `flatgeobuf` 6.x | Actively maintained |
| KML / GPX / CSV | `kml`, `gpx`, `csv` | CSV loads as points from lat/lon columns |
| Reprojection | `proj4rs` (pure Rust PROJ.4 port) | Works in radians, has no WKT parsing and no 3D. Pair it with an EPSG→proj4 lookup table (for example the `crs-definitions` crate, to be checked) and a small WKT→EPSG matcher for `.prj` files. |
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

### 2. Data layers (formats + projections)

- **Read:** Shapefile (`.shp` + `.dbf` + `.prj`), GeoJSON, GeoPackage (pick a table if there are several), FlatGeobuf, KML, GPX, and CSV with lat/lon columns.
- **Export a layer or annotations to:** GeoJSON, GeoPackage, Shapefile.
- **CRS handling:** detect the CRS from `.prj` or the GeoPackage SRS table. When it's unknown, ask the user, defaulting to EPSG:4326. Reproject to EPSG:4326 in Rust before sending to the UI.
- The status bar shows cursor coordinates in decimal degrees, DMS or a user-chosen CRS (for example UTM), plus a scale bar.
- Navigation: scroll zoom, drag pan, rotate/tilt, zoom to layer, zoom to selection, zoom to full extent, and a globe on/off toggle.
- **Layer panel:** drag to reorder, visibility checkbox, opacity slider, rename, remove, and a feature count.
- **Styling:**
  - single symbol (fill, stroke, width, point size, shape and icon)
  - categorized by attribute (a unique colour per value)
  - graduated by attribute (colour ramp over numeric ranges)
  - labels from an attribute

### 3. Annotation editor (the "cosmetic layer", done properly)

- Multiple annotation layers per project, each with its own style.
- **Tools:** point, line, polygon, rectangle, circle, freehand, text label and icon/marker.
- **Select tool:** click or box-select, move, resize, rotate and edit vertices.
- **Edit actions:** cut, copy, paste, delete and duplicate. Undo/redo through a command stack covering all edits (Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z).
- **Per-feature properties:** name, description and style overrides. These show in the attribute table like any other layer.
- Snapping to vertices of other layers (optional toggle).
- Export annotations as GeoJSON or GeoPackage, so other tools (QGIS, for example) can open them.

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

### 5. Basemaps and offline use

- Basemap picker: none, OpenFreeMap (several styles) or a local PMTiles/MBTiles file.
- Local tiles are served by the Rust `tiles://` protocol, so the app works fully offline.
- A "Getting offline maps" help page explains how to use `pmtiles extract`. No in-app download manager in v1.

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
| 1 | **Skeleton** | Tauri + Svelte + MapLibre window with an OpenFreeMap basemap, opening on all 3 OSes through CI | Tauri config, IPC basics, GitHub Actions |
| 2 | **First reader** | Open a Shapefile → Rust parses it → GeoJSON → shown on the map. Fixture test: `world.shp` has **251** features (the 2004 parser lost one). | Rust I/O, serde, error handling |
| 3 | **All readers + CRS** | Every v1 format loads, and `.prj` reprojection is verified against known coordinates | Traits (one `Reader` trait per format), proj4rs |
| 4 | **Layer panel + styling** | Reorder, visibility, opacity, single, categorized and graduated styles, labels | Svelte stores, MapLibre style expressions |
| 5 | **Project files** | Save and reopen a project that restores everything, with relative paths | serde round-trips |
| 6 | **Identify + attribute table + filter + search** | Selection syncs between table and map, and filters apply | Virtual lists, MapLibre feature-state |
| 7 | **Annotation editor** | All draw tools, select/move/resize, cut/copy/paste, undo/redo, export | terra-draw, command pattern |
| 8 | **Measure + stats** | Geodesic distance and area match a reference tool within 0.1% | `geo` crate |
| 9 | **Offline tiles** | A local PMTiles basemap renders with networking off | Custom URI protocol, byte ranges |
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
- **CI:** GitHub Actions matrix (`ubuntu-latest`, `macos-latest`, `windows-latest`) running tests, `cargo clippy`, `svelte-check`, and `tauri-action` to build unsigned installers as artifacts.

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

# SmartMap

A simple desktop GIS app: open map data, show it over a basemap, and draw your own annotation layers on top. It runs on **macOS, Windows and Linux**.

The repo holds two generations:

| | SmartMap 2 (in progress) | SmartMap 1 (2004, archived) |
|---|---|---|
| Where | repo root (`src/`, `src-tauri/`) | [`legacy/`](legacy/) |
| Stack | Rust + Tauri 2, Svelte 5 + TypeScript, MapLibre GL | C++ + Qt 3.2.1 |
| Status | Build step 6 of 11 (identify, attribute table, filter, search) | Finished MCS thesis project, doesn't build on modern systems |

## SmartMap 2

### What works today

- A desktop window with an OpenFreeMap basemap (3 styles), smooth zoom/pan/rotate, and a globe view
- Open Shapefile, GeoJSON, GeoPackage (every feature table), FlatGeobuf, KML/KMZ, GPX and CSV (lat/lon columns)
- Data in other coordinate systems (from `.prj` files, EPSG codes or GeoPackage SRS tables) is converted to longitude/latitude
- A layer panel: drag to reorder, show/hide, opacity, rename, zoom to layer, remove
- Styling: single colour, categorized by attribute, graduated by numeric attribute (quantile or equal interval, 5 colour ramps), outline and line widths, point size and shape (circle, square, triangle, diamond, star), and labels from an attribute
- Projects: New, Open, Save, Save As and a Recent list. A `.smartmap` file saves the layers, their styles, the basemap and the map view, with data paths relative to the project so a folder can be moved as a whole. Unsaved changes are flagged in the title bar and you're asked before they're lost.
- Identify: click a feature to see its attributes (with a picker when several overlap)
- An attribute table per layer: fast with 100,000 rows, sort, per-column search, multi-select (Ctrl/Cmd and Shift), zoom to selected; selecting in the table highlights on the map and the other way round
- Layer filters (`field operator value`, AND/OR) that hide non-matching features on the map, in the table and in search, saved with the project
- Search across the visible layers from the toolbar
- A status bar with live latitude/longitude (click it to switch between decimal and DMS), zoom level and build info from the Rust side
- Builds and release workflows for macOS (universal), Windows (x64/ARM64) and Linux (x64/ARM64)

The full feature set is planned in [docs/MODERNIZATION_PLAN.md](docs/MODERNIZATION_PLAN.md):

- a full annotation editor with undo/redo
- measuring and statistics
- offline PMTiles basemaps

### Quick start

You need Node 22+ and Rust installed through rustup. [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) has per-OS setup.

```bash
npm ci
```

```bash
npm run doctor
```

```bash
npm run app:dev
```

`npm run doctor` checks your toolchain. `npm run app:dev` runs the desktop app with hot reload.

### Building installers

```bash
npm run app:build
```

That builds for this machine's OS and CPU. Specific targets have their own scripts: `npm run build:mac` (universal), `build:win`, `build:win:arm`, `build:linux` and `build:linux:arm`. Pushing a `v*` tag makes GitHub Actions build all of them and attach them to a draft release. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#platform-and-cpu-targets).

## SmartMap 1 (2004)

SmartMap 1.0.3, "Cosmetic Layer Designer for GIS", was a Master of Computer Science project at the University of Arid Agriculture, Rawalpindi, for the National Development Complex, Pakistan. Muhammad Imran Shahid and Shahzad Anwar wrote it from March to August 2004.

It read ESRI Shapefiles with a hand-written parser, showed them as stacked layers with zoom and pan, and let analysts draw a "cosmetic" annotation layer saved as XML.

The source and thesis are preserved unchanged in [`legacy/`](legacy/).

## Documentation

| Doc | Contents |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Orientation for AI assistants and new contributors |
| [docs/MODERNIZATION_PLAN.md](docs/MODERNIZATION_PLAN.md) | SmartMap 2 design, features, build order |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | SmartMap 2 setup, commands, platform targets, CI and releases |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 2004 class model, signal flow, rendering, coordinate maths |
| [docs/FILE_FORMATS.md](docs/FILE_FORMATS.md) | 2004 Shapefile subset, `.smproj` and `.scl` formats |
| [docs/BUILDING.md](docs/BUILDING.md) | Building or porting the 2004 Qt 3 code |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | 2004 menus, tools and workflows |
| [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) | 2004 bugs and unfinished features |
| [docs/PROJECT_HISTORY.md](docs/PROJECT_HISTORY.md) | Background, client, thesis summary, credits |

## Licence

SmartMap 2 is declared MIT in `src-tauri/Cargo.toml`, but no LICENSE file has been added yet. The 2004 code has no licence; all rights belong to its authors.

Map data © OpenStreetMap contributors (ODbL), served by OpenFreeMap.

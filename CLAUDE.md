# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository.

## What this is

Two generations of **SmartMap**, a desktop GIS viewer and annotation tool:

- **SmartMap 2** (repo root, in progress): Rust + **Tauri 2** core, **Svelte 5 + TypeScript** UI, **MapLibre GL JS 6** map. A simple standalone app for macOS, Windows and Linux. The owner is learning Rust and TypeScript, so keep code plain and well-commented, and explain non-obvious choices. The plan and build order are in [docs/MODERNIZATION_PLAN.md](docs/MODERNIZATION_PLAN.md). Steps 1 (skeleton) and 2 (Shapefile reader) are done; next is **step 3 (all readers + CRS)**.
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
  App.svelte              shell: toolbar, map area, status bar
  lib/api.ts              ALL invoke() calls to Rust go through here (typed wrappers)
  lib/map/maplibre.ts     import MapLibre from here only (sets the worker URL)
  lib/map/MapView.svelte  the map component
  lib/map/basemaps.ts     basemap style list
  lib/map/layerStyle.ts   MapLibre fill/line/circle layers for a data layer
  lib/map/types.ts        MapLayer (loaded data + display settings)
  lib/util/               pure helpers with *.test.ts next to them
src-tauri/                Rust core
  src/lib.rs              Tauri builder + command registration
  src/commands.rs         #[tauri::command] fns (thin; logic goes in modules)
  src/io/mod.rs           Layer struct, IoError, open_layer() dispatch by extension
  src/io/shapefile.rs     .shp + .dbf + .prj reader (shapefile crate → geo-types → GeoJSON)
  tests/                  integration tests (shapefile_reader.rs uses legacy/source/data fixtures)
  examples/dump_layer.rs  `cargo run --example dump_layer -- file.shp` prints the layer JSON
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
- **Use `$state.raw` for anything holding GeoJSON** and replace it rather than mutating it (`layers = [...layers, x]`). Plain `$state` deep-proxies every coordinate, which is slow, and MapLibre can't post proxies to its worker.
- **Adding a format:** new module in `src-tauri/src/io/`, one match arm in `io::open_layer`, an extension in `DATA_FILE_FILTERS` (`src/lib/api.ts`), and integration tests.
- **Tests:** Rust unit tests in-module (`#[cfg(test)]`), Rust integration tests in `src-tauri/tests/`, and TS tests as `*.test.ts` beside the code.
- **Keep commands thin** and put logic in modules (`io/`, `crs.rs`, `project.rs`, `tiles.rs`, `analysis.rs`, as they're added per the plan).

## Gotchas

- **Tauri versions must match at major.minor** between the `tauri` crate and `@tauri-apps/api` / `@tauri-apps/cli` (pinned `~2.11`), or `tauri build` errors. Bump them together.
- **MapLibre 6 has named exports only** (`MapLibreMap`, `NavigationControl`, …), and its worker must be set via `setWorkerUrl`. That's done in `src/lib/map/maplibre.ts`, so always import from there.
- **Basemap switches wipe MapLibre sources.** `MapView` re-adds data layers on every `style.load` (via `styleVersion`), so keep that path working when changing layer code.
- **CSP** in `tauri.conf.json` only allows `tiles.openfreemap.org`. New network hosts need adding to `img-src` and `connect-src`.
- **TypeScript is pinned to 6.x** because svelte-check doesn't support TS 7 yet.
- **Vite 8 minifies with oxc.** Don't set `minify: "esbuild"`, because esbuild isn't installed.
- **This machine:** the `rustc` on PATH is Homebrew's (it can't add Rust targets), and the default `node` is v18. Use Node 22 (`~/.nvm/versions/node/v22.23.3/bin`). Sandboxed shells can't write `~/.npm` or `~/.cargo`, so set `npm_config_cache=$TMPDIR/npm-cache` and `CARGO_HOME=$TMPDIR/cargo-home` when running npm or cargo there.
- **Tauri can't truly cross-compile.** macOS builds need macOS and Linux builds need Linux. Release installers come from CI (`release.yml`).

## Legacy (2004) quick facts

- C++ against **Qt 3.2.1**, MSVC 6-era code (relies on `for`-loop scope leakage). It doesn't build with modern Qt or compilers.
- Its Shapefile parser misreads the header and drops the first 1–4 records of each file (docs/KNOWN_ISSUES.md #1). The bundled samples in `legacy/source/data/` have known true record counts: world 251, Country Boundaries 2 15, Water Bodies 2 22, Streets and Railroads 1 189, meanmotp 248. They're good fixtures for SmartMap 2's readers.
- The thesis (`legacy/documents/SmartMap.docx`) holds use cases UC1–UC26 and the SRS. Extract text with `textutil -convert txt -stdout legacy/documents/SmartMap.docx`.

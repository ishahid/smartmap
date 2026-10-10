# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository.

## What this is

**SmartMap 1.0.3 (build 589) — "Cosmetic Layer Designer for GIS".** A 2004 desktop GIS viewer written in **C++ against Qt 3.2.1**, built as an MCS final-year project (University of Arid Agriculture, Rawalpindi) for the National Development Complex (NDC). It:

- reads ESRI **Shapefiles** (`.shp` only — Point, PolyLine, Polygon) with a hand-written binary parser,
- renders them as stacked, colour-able, toggle-able map layers in MDI project windows,
- supports zoom in/out/full, pan, and a lat/long readout ("Identify"),
- lets the user draw a **cosmetic layer** (user annotations: points and lines; circles/polygons load from file but can't be drawn yet) saved as XML (`.scl`),
- saves the whole session as an XML project (`.smproj`).

This is an **archived/legacy codebase** (single commit, ~3.7k LOC). There is no test suite, no CI, and it does not build with any modern Qt as-is. Treat it as historical source unless the user asks to port or modernise it.

## Repository layout

```
documents/            Thesis report (SmartMap.docx / .pdf) + original Word .doc sources
source/               All code, assets and sample data (flat, no subdirs for code)
  *.cpp / *.h         21 classes — see docs/ARCHITECTURE.md
  sm.pro              qmake project (Qt 3, qmake 1.06c)
  Makefile            qmake-generated nmake file for MSVC on Windows (do not hand-edit)
  smartmap.rc         Windows resource (app icon)
  images/             Toolbar icons, cursors (.xpm), splash, logo
  data/               Sample shapefiles (.shp only, no .shx/.dbf)
  *.smproj, abc.xml   Sample project files (absolute D:/Docs/MCS/SmartMap/sm/... paths)
  *.scl, mycl.scl.xml Sample cosmetic layers
docs/                 Knowledge base written for this repo (start here)
```

## Docs index

- [README.md](README.md) — overview, features, quick start
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — classes, ownership, signal/slot wiring, render pipeline, coordinate math
- [docs/FILE_FORMATS.md](docs/FILE_FORMATS.md) — `.shp` subset parsed, `.smproj` and `.scl` schemas, shape type codes
- [docs/BUILDING.md](docs/BUILDING.md) — original build, why modern toolchains fail, porting map Qt3 → Qt5/6
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — menus, tools, shortcuts, workflows
- [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) — bugs, stubs, and design limitations with file:line refs
- [docs/PROJECT_HISTORY.md](docs/PROJECT_HISTORY.md) — authorship, client, timeline, thesis summary
- [docs/MODERNIZATION_PLAN.md](docs/MODERNIZATION_PLAN.md) — SmartMap 2 plan: Rust + Tauri 2 + Svelte 5 + MapLibre, pure-Rust data libs

## Key facts to keep in mind

- **Qt 3 API everywhere**: `QPtrList`, `QPointArray`, `QPopupMenu`, `QWorkspace`, `QDockWindow`, `QListView`/`QCheckListItem`, `IO_ReadOnly`, `setCaption`, `bitBlt`. Don't "fix" these piecemeal — they only make sense as part of a deliberate port.
- **Pre-standard C++ (MSVC 6 era)**: code relies on `for`-loop variable leaking out of scope (e.g. `source/shapepolygon.cpp:20`). Modern compilers reject it.
- **Runtime assets are loaded relative to CWD** (`"images/..."`), so the binary must be run from `source/`.
- **`Convert` is global static state** (screen size, centre, degrees→pixels factors). Every `MapWindow` shares it; `MapWindow::draw()` re-initialises it on every paint.
- **Projection** is plain equirectangular (plate carrée): x = lon·sf·(W/360) + W/2, y = H/2 − lat·sf·(H/180). Aspect ratio is not preserved.
- **Layer ordering**: `MapWindow::layers` index 0 is drawn first (bottom). The UI (LayerPanel, dialogs) lists layers top-first, so code converts with `n = count - (i + 1)` everywhere. Preserve this when touching layer code.
- **Cosmetic shape type codes** 996–999 are SmartMap extensions, not ESRI codes (996 line, 997 circle, 998 polygon, 999 bitmap).
- **Save path**: `ProjectWindow::_save()` writes the `.smproj` and then calls `MapWindow::saveCosmeticLayer()` — the `.scl` is only written when the project is saved.
- **Error handling** is deliberately exception-free (per the thesis); errors surface via `QMessageBox` or are silently ignored.

## Conventions (match when editing)

- Tabs for indentation; return type on its own line above `Class::method(` in most `.cpp` files.
- Member fields prefixed `_` (`_scaleFactor`, `_visible`) with same-named accessors.
- One class per `.h`/`.cpp` pair, lowercase filenames matching class name.
- Signals are re-emitted up the chain via `resend*` slots (MapWindow → ProjectWindow → ApplicationWindow/LayerPanel) rather than connecting across levels.
- `ApplicationWindow` actions forward to the active `ProjectWindow` (`ws->activeWindow()`), which forwards to its `MapWindow`.

## Working here

- No build/test commands work out of the box on macOS/Linux with Qt 5/6 (the machine has `qmake` and `qmake6` via Homebrew — both are Qt 5/6). See docs/BUILDING.md before attempting.
- Don't regenerate or edit `source/Makefile` by hand; it's a Windows nmake artefact kept for history.
- Sample `.smproj` files hold absolute Windows paths; edit them (or re-save from the app) to point at `source/data/` if you get a working build.
- `documents/` is the authoritative requirements/design record (use cases UC1–UC26, SRS). Extract text with `textutil -convert txt -stdout documents/SmartMap.docx`.

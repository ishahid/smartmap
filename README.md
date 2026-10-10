# SmartMap — Cosmetic Layer Designer for GIS

SmartMap is a desktop GIS viewer and annotation tool written in C++ with Qt 3.2.1 in 2004. It opens ESRI Shapefiles, displays them as stacked map layers, and lets an analyst draw a personal "cosmetic" layer of points and lines on top of the georeferenced map, saved separately so it can be reused across projects.

It was built as a Master of Computer Science final project at the Centre for Information Technology, University of Arid Agriculture, Rawalpindi, for the National Development Complex (NDC), Pakistan.

| | |
|---|---|
| Version | 1.0.3, build 589 (`source/sminfo.h`) |
| Language / toolkit | C++ (MSVC 6-era), Qt 3.2.1 |
| Targets (2004) | Windows XP / 2000, Red Hat Linux 9 |
| Size | ~3,700 lines across 21 classes |
| Authors | Muhammad Imran Shahid, Shahzad Anwar |
| Period | 17 Mar 2004 – 8 Aug 2004 |

## Features

- **Shapefile reader**: hand-written parser for the `.shp` main file (Point, PolyLine and Polygon records, including multi-part shapes)
- **Layers**: add, remove, reorder, show/hide, and change fill and line colours; a default palette assigns colours automatically
- **Navigation**: zoom in or out in ×1 scale steps, zoom to full extent, drag to pan, and a live longitude/latitude readout in the status bar
- **Rendering**: double-buffered through an off-screen `QPixmap`, with fast blitting while panning
- **Cosmetic layer**: one per project, where you click to place points or drag to draw lines. It's saved as XML (`.scl`). Circle and polygon shapes load from file but have no drawing tool yet.
- **Projects**: an MDI workspace holds several project windows, and each saves its layers, colours, visibility, zoom, pan and cosmetic layer path to XML (`.smproj`)
- **Export**: "Copy Map Image to File" saves the current view as a PNG

Cut, copy, paste, delete, print and help are still stubs. See [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md).

## Repository layout

```
documents/   Thesis report (SmartMap.docx/.pdf) and original .doc chapters
source/      C++ sources, qmake project, Windows Makefile, icons, sample data
docs/        Technical documentation (this knowledge base)
```

## Quick start

**The code builds as-is only with Qt 3.x and an old compiler.** No modern Qt release can build it unchanged. [docs/BUILDING.md](docs/BUILDING.md) covers:

- how it was built originally: `qmake sm.pro && nmake` with MSVC and Qt 3.2.1
- running it under a legacy Qt 3 toolchain (Trinity's TQt3 or a Qt 3.3 VM)
- a class-by-class map for porting to Qt 5 or 6

Once built, run the binary from inside `source/` because icons and the splash screen load from relative `images/` paths. Then:

1. Choose **File → New Project**.
2. Choose **Layer → Add Layer…** and pick `data/world.shp`.
3. Choose **Layer → New Cosmetic Layer…** and give it a file name. The shape toolbar appears.
4. Pick **Point** or **Line** and click or drag on the map.
5. Choose **File → Save Project**. This writes both the `.smproj` and the `.scl`.

## Documentation

| Doc | Contents |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Orientation for AI assistants and new contributors |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Class model, signal flow, rendering, coordinate transforms |
| [docs/FILE_FORMATS.md](docs/FILE_FORMATS.md) | Shapefile subset, `.smproj` and `.scl` schemas |
| [docs/BUILDING.md](docs/BUILDING.md) | Toolchain, build steps, porting guide |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Menus, tools, shortcuts, workflows |
| [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) | Bugs, unfinished features, limitations |
| [docs/PROJECT_HISTORY.md](docs/PROJECT_HISTORY.md) | Background, client, thesis summary, credits |

## Sample data

`source/data/` contains five shapefiles. Only the `.shp` files are included, which is all SmartMap reads.

| File | Type | Extent |
|---|---|---|
| `world.shp` | Polygon | Whole world |
| `Country Boundaries 2.shp` | Polygon | 52–87°E, 17–43°N (Pakistan region) |
| `Water Bodies 2.shp` | Polygon | Same region |
| `Streets and Railroads 1.shp` | PolyLine | Same region |
| `meanmotp.shp` | Point | North America |

## Licence

There is no licence file. All rights belong to the authors unless they state otherwise.

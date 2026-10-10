# Project history

This summary comes from the thesis report in `documents/SmartMap.docx` and `documents/SmartMap.pdf`. The original chapter files are in `documents/originals/`.

## Facts

| | |
|---|---|
| Title | SmartMap: Cosmetic Layer Designer for GIS |
| Degree | Master of Computer Science, Centre for Information Technology, University of Arid Agriculture, Rawalpindi, Pakistan (2004) |
| Client | National Development Complex (NDC). The project is a module of one of NDC's GIS projects. |
| Developers | Muhammad Imran Shahid (02-arid-935), Shahzad Anwar (02-arid-941) |
| Supervisors | Mr. Asif Hameed Qazi (NDC, external), Mr. Nasir Siddique (NDC, external), Mr. Tanveer Ahmed (internal) |
| Started / completed | 17 March 2004 / 8 August 2004 |
| Tech | C++, Qt 3.2.1. Windows XP/2000 and Red Hat Linux 9. UML in MS Visio and Rational Rose. |
| Splash screen | Designed by Ms. Amber Baig |

## Motivation

NDC used off-the-shelf GIS tools: MapInfo Professional and ESRI ArcView. The thesis identifies two shortcomings:

1. Analysts couldn't add their own custom overlay layers (customisation).
2. Display was slow because those tools redraw the whole map on every zoom or pan.

SmartMap addresses both with **cosmetic layers** (user-drawn, geo-referenced overlays such as hospitals or office locations, saved independently and re-applied to any map) and with **double-buffered rendering**.

## Stated objectives

- Read a digitised map (ESRI Shapefile)
- Display it efficiently
- Zoom, pan and projection operations
- Toggle layer visibility
- Create cosmetic layers and draw shapes on them

## Modules (thesis §1.5)

| Module | Responsibilities | Code |
|---|---|---|
| MapLayer | Open a shapefile, build shape objects, add/remove/reorder/hide layers | `MapLayer`, `Shape*`, `RemoveLayerDialog`, `LayerManager`, `LayerPanel` |
| Project File | Open, save and close projects | `ProjectWindow` |
| Map Display | Lat/long ↔ pixel conversion, display, zoom in/out/full, pan | `Convert`, `MapWindow` |
| Cosmetic Layer | Create, save, place, drag/resize, delete, cut/copy/paste objects | `CosmeticLayer`, `ShapeCL*`. Only create, save and place are implemented. |

## Requirements artefacts in the thesis

- **Use cases UC1–UC26** with pre- and post-conditions. Examples: UC3 Add layer, UC6–9 Zoom/Pan, UC13–15 Save/Open/Close project, UC16 New cosmetic layer, UC19/24–26 Delete/Cut/Copy/Paste, UC20 Print, UC22 Identify, UC23 Copy image to file.
- System boundary and interaction (sequence) diagrams
- An SRS covering the product perspective, the user type (Spatial Analyst), the operating environment (SGI/IRIX was recommended; in practice Win2000 on Pentium IV), and design constraints. The design constraints include "no exception handling, for performance" and "no GUI designer used".
- Class diagrams: the Qt-derived UI classes, and the `Shape` hierarchy

## Claimed benchmark (thesis §3.3.1)

| Shapefile | MapInfo | SmartMap | Machine |
|---|---|---|---|
| 3.2 MB | 6 s | 2 s | Pentium IV, 256 MB |
| 7.17 MB | 120 s | 4 s | Pentium 2.8 GHz, 512 MB |

## Differences between the thesis and the code

- The abstract says "multi-threaded" display. The code is single-threaded with double buffering, which is what the analysis chapter says.
- Projection operations, print, help, cut/copy/paste/delete, and drag/resize of cosmetic objects are described but not implemented. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md).
- The thesis says cosmetic objects are written "into the shapefile". The code writes a separate XML `.scl` file instead.

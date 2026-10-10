# Known issues

These findings come from reading the code in `source/` (October 2026). Line numbers refer to the initial commit `195b1eb`. They're grouped by impact. None of them has been fixed in the repo.

## Correctness bugs

### 1. Shapefile header misread drops the first records

`source/maplayer.cpp` reads the 64-byte bounding box as 8 `int`s (32 bytes), so record parsing begins at byte 68 instead of 100. The loop then reads garbage. Unknown types fall into `default: break;` (line 97), and each garbage iteration consumes 12 bytes until the stride happens to land on a real record header. From that point on, parsing is correct.

A simulation of the parser against the bundled data shows the loss:

| File | Real records | Parsed |
|---|---|---|
| world.shp | 251 | 250 |
| Country Boundaries 2.shp | 15 | 14 |
| Water Bodies 2.shp | 22 | 20 |
| Streets and Railroads 1.shp | 189 | 185 |
| meanmotp.shp | 248 | 247 |

If a garbage iteration decodes type 3 or 5, it allocates arrays sized from garbage counts, which can crash or exhaust memory. The fix is to read `double _boundingBox[8]`, or to seek to byte 100.

### 2. Unknown record types are not skipped and duplicate the previous shape

The `default:` branch (`maplayer.cpp:97`) neither skips `recLength*2 - 4` bytes nor resets `shape`, so `shapes->append(shape)` (line 100) appends the previous shape again, or NULL if no shape was read yet. MultiPoint and Z/M files pass `ShapeType::isValid` but desync the stream. A NULL entry stops `MapLayer::draw` early, because the iterator loop ends at the first null.

### 3. Header validated after the whole file is parsed

The file-code and type checks (`maplayer.cpp:109`) run after the record loop, so any binary file gets fully "parsed" first.

### 4. File handle never closed

`if ( !file ) file->close();` (`maplayer.cpp:106`) is inverted, and the `QFile` is heap-allocated and leaked.

### 5. Zoom doesn't centre on the click

`ZoomIn` and `ZoomOut` call `Convert::setCenter(lon, lat)` (`mapwindow.cpp:144`, `:152`), which passes degrees into a field used as a pixel offset. `draw()` then calls `Convert::init()` (`mapwindow.cpp:82`), which resets the centre to the widget midpoint anyway. In practice, zoom scales around the screen centre plus the current pan.

### 6. Circle geometry is inconsistent

`ShapeCLCircle`:

- uses integer `abs()` on doubles (`shapeclcircle.cpp:9-10`), which truncates to whole degrees
- `draw()` passes the size through `degreeToPixelX/Y`, which add the centre offset, so the on-screen size is wrong
- the constructor converts (centre, edge) to (top-left, size), but `coordinates()` saves (top-left, size) and loading feeds that back into the same constructor, so circles drift on every save/load cycle

### 7. "Open Existing Cosmetic Layer…" creates a new layer

The menu item is wired to `addCosmeticLayer()` (`application.cpp:209`). Existing `.scl` files can only be loaded through a `.smproj`.

### 8. Signal connected that doesn't exist

`ProjectWindow::layerManager()` connects `LayerManager::swapped(int,int)` to `resendSwapped` (`projectwindow.cpp:296`). Neither exists, so Qt logs a warning at runtime.

### 9. Points drawn off-centre

`ShapePoint::draw` passes the point as the top-left of a 4×4 ellipse, so the dot is offset by 2 px.

### 10. Bounding box copied wrongly

The `box` array is copied as `box[0]` four times (`shapepolygon.cpp:9-12`, `shapepolyline.cpp:9-12`). It's unused, so this has no visible effect.

### 11. Missing icon

`setIcon( QPixmap("images/smartmap.gif") )` (`application.cpp:246`) points to a file that isn't in the repo. Only `smartmap.png` and `smartmap.ico` exist.

## Unimplemented or stubbed features

| Feature | Location | State |
|---|---|---|
| Cut / Copy / Paste / Delete | `projectwindow.cpp:405-408` | Empty bodies. The menu items are disabled at startup. |
| Remove a cosmetic shape | `CosmeticLayer::removeShape` (`cosmeticlayer.cpp:125`) | Empty |
| Select / drag / resize cosmetic shapes | — | Not present (thesis lists it under the Cosmetic Layer module) |
| Draw circle / polygon / bitmap | `MapWindow::mouseReleaseEvent` | The modes exist, but there's no mouse handling |
| Print | `ApplicationWindow::print` (`application.cpp:327`) | Body commented out |
| Help contents | `ApplicationWindow::helpContents` (`application.cpp:667`) | Empty, and the menu item is disabled |
| Shapefile attributes (`.dbf`) / Identify feature info | — | Not read. Identify only shows lat/long. |
| Projections | — | Only equirectangular. The thesis lists "projection operations". |
| Multi-threaded drawing | — | The thesis abstract claims it, but the code is single-threaded with double buffering (the thesis analysis chapter itself says "double buffering"). |
| Cosmetic layer colours | `CosmeticLayer::setFillColor/LineColor` | Exist, but no UI uses them. Always red. |

## Design limitations

- **Global coordinate state.** `Convert` is all static, so multiple MDI project windows of different sizes share one transform. It only works because every `draw()` re-initialises it.
- **No aspect-ratio preservation.** X and Y scales differ unless the window is 2:1.
- **Integer zoom steps.** The scale factor changes by ±1 (1×, 2×, 3×…), so zoom-out granularity gets coarse at high zoom, and you can't zoom out below 1×.
- **Full redraw on every paint.** Every vertex is re-projected on every paint event. That's fine for the bundled data (<400 KB) but slow for large files.
- **Absolute paths in projects.** Projects aren't portable between machines.
- **Positional XML parsing.** `.smproj` layer elements must appear in the exact order the app writes them.
- **CWD-relative assets.** The `images/` path must resolve from the working directory.
- **Memory leaks.** No `setAutoDelete`, and the destructors are empty (`MapLayer`, `MapWindow`, `CosmeticLayer`). Shapes leak when a layer is removed or a window closes. `LayerManager` also leaks `QPixmap`/`QPainter` objects each time it builds a swatch.
- **One cosmetic layer per project.** Adding a new one replaces the pointer without saving or freeing the old one.
- **Non-standard C++.** It relies on `for`-scope leakage (`shapepolygon.cpp:20`, `shapepolyline.cpp:18,21`), so modern compilers fail. See [BUILDING.md](BUILDING.md).

## Repository hygiene

- `source/images/Thumbs.db` (a Windows thumbnail cache) is committed.
- `source/Makefile` is generated output with machine-specific paths (`D:\Docs\MCS\SmartMap\sm`, `C:\Qt\3.2.1`).
- `source/abc.xml` duplicates the `.smproj` format, and `mycl.scl.xml` is a `.scl` with an extra extension.

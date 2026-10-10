# Architecture

SmartMap is a single-process, single-threaded Qt 3 MDI application. There is no database, no networking and no plugin system; all state lives in memory and is persisted to two XML formats plus read-only shapefiles.

## Widget hierarchy

```
QApplication (main.cpp)
└── ApplicationWindow : QMainWindow            application.{h,cpp}
    ├── menus + 5 toolbars (file, edit, layer, tools, shapes)
    ├── QStatusBar  ← lat/long + messages
    ├── LayerPanel : QDockWindow (DockLeft)    layerpanel.{h,cpp}
    │   └── QListView of QCheckListItem (one per layer, top layer first)
    └── QVBox → QWorkspace (MDI area)
        └── ProjectWindow : QMainWindow  (0..n) projectwindow.{h,cpp}
            └── MapWindow : QFrame (central)    mapwindow.{h,cpp}
                ├── QPtrList<MapLayer>          maplayer.{h,cpp}
                │   └── QPtrList<Shape>         shape*.{h,cpp}
                ├── CosmeticLayer* (0..1)       cosmeticlayer.{h,cpp}
                │   └── QPtrList<Shape>
                ├── MapColors (default palette) mapcolors.{h,cpp}
                └── QPixmap buffer (back buffer)

Modal dialogs (created on the stack by ProjectWindow):
  RemoveLayerDialog : QDialog                  removelayerdialog.{h,cpp}
  LayerManager      : QDialog  (reorder + colours) layermanager.{h,cpp}
  SMAbout           : QDialog                  smabout.{h,cpp}
```

`main.cpp` shows a 2-second `QSplashScreen` (`images/smsplash.png`), creates `ApplicationWindow` maximised, and enters the event loop.

## Class reference

| Class | Role |
|---|---|
| `ApplicationWindow` | Builds menus/toolbars/status bar/dock. Every action slot looks up `ws->activeWindow()` as a `ProjectWindow*` and forwards. Keeps the toggle tool buttons mutually exclusive by hand (`zoomIn()` turns off the others, etc.). Shows/hides the shapes toolbar on `cosmeticLayer(bool)`. Rebuilds the LayerPanel whenever a project window gains focus. |
| `ProjectWindow` | One open project. Owns a `MapWindow`. Handles file dialogs, `.smproj` load (`load` → `traverseNode`) and save (`save`/`saveAs`/`_save`), the dirty flag (`saved`, prompts on close), and toggles `MapWindow` draw modes. Re-emits MapWindow signals upward. |
| `MapWindow` | The canvas. Holds layers + cosmetic layer, scale factor, pan offset and the current `DrawMode`. Implements painting and all mouse interaction. |
| `MapLayer` | One shapefile. Constructor parses the `.shp` into `Shape` objects; holds name, path, fill/line colour, visibility, header fields. `draw()` sets pen/brush by shape type and draws every shape. |
| `CosmeticLayer` | User annotation layer. Constructor overload reads an `.scl` via `QDomDocument`; `save()` writes it with `QTextStream`. Fixed red pen/brush. |
| `Shape` (abstract) | `shapeID()`, `type()`, `coordinates()` (XML `<Point>` lines for `.scl`), pure virtual `draw(sf, painter)`. |
| `NullShape` | Type 0, draws nothing. |
| `ShapePoint` | Type 1. 4×4 px ellipse. Used both by shapefiles and the cosmetic layer. |
| `ShapePolyLine` | Type 3. Multi-part polyline from a shapefile. |
| `ShapePolygon` | Type 5. Multi-part polygon from a shapefile; each part drawn as its own `drawPolygon`. |
| `ShapeCLLine` | Type 996. Cosmetic polyline (UI creates 2-point lines). |
| `ShapeCLCircle` | Type 997. Cosmetic ellipse stored as top-left + size (in degrees). |
| `ShapeCLPolygon` | Type 998. Cosmetic polygon. |
| `ShapeType` | Static helpers: `name(type)` and `isValid(type)` for ESRI codes 0–31 and SmartMap codes 996–999. |
| `Point` | Plain `double x, y` value type. |
| `Convert` | **Static** coordinate transform between degrees and widget pixels (see below). |
| `MapColors` | Palette of 60 fill + 20 line `QColor`s; `fillColor()`/`lineColor()` hand out a random entry for each new layer. |
| `SMInfo` | Static strings: name, version, build, authors, About text. |
| `LayerPanel` | Dock with checkboxes; emits `visibilityChanged(index, bool)`. |
| `LayerManager` | Dialog to move layers up/down and pick fill/line colours (`QColorDialog`). Operates directly on its parent `MapWindow`. |
| `RemoveLayerDialog` | Lists layers, removes the selected one. |
| `SMAbout` | About box (logo + `SMInfo::description()`). |

## Signal / slot flow

Signals travel up one level at a time; each level re-emits via a `resend*`/`msg` slot.

```
MapWindow ──message(str[,ms])──────▶ ProjectWindow.msg ──message──▶ QStatusBar.message
MapWindow ──layerRemoved(n)────────▶ ProjectWindow.resendLayerRemoved ──▶ LayerPanel.removeItem
MapWindow ──layerAddedAt(n,name)───▶ ProjectWindow.resendLayerAddedAt ──▶ LayerPanel.addItemAfter
MapWindow ──cosmeticLayer(bool)────▶ ProjectWindow.resendCosmeticLayer ─▶ ApplicationWindow.showShapeTools
ProjectWindow ──layerAdded(name,n)──────────────────────────────────────▶ LayerPanel.addItem
ProjectWindow ──addLayerPanelItem(name,n,vis) (during load) ────────────▶ LayerPanel.addItem
ProjectWindow ──focused()───────────────────────────────────────────────▶ ApplicationWindow.windowFocused
ProjectWindow ──closed()────────────────────────────────────────────────▶ LayerPanel.removeAllItems
LayerPanel ──visibilityChanged(i,b)──▶ ApplicationWindow.changeVisibility ──▶ ProjectWindow.changeVisibility ──▶ MapWindow.setVisible
MapWindow ──layerAdded / scaleFactorChanged──▶ MapWindow.draw   (self-connection; scaleFactorChanged is reused as "please redraw")
```

Connections are made in `ApplicationWindow::newProj()` (application ↔ project) and in the `ProjectWindow` constructor (project ↔ map).

## Layer indexing

`MapWindow::layers` is bottom-to-top: index 0 draws first. Every list shown to the user (LayerPanel, LayerManager, RemoveLayerDialog) is top-to-bottom. Conversions use `n = layerCount() - (i + 1)` in both directions. Any change to layer ordering must keep both sides consistent.

## Rendering pipeline

`MapWindow::draw()` (`source/mapwindow.cpp`), called from `paintEvent` and from redraw signals:

1. If in Pan/ZoomIn/ZoomOut mode and the mouse moved, accumulate `panPoint += currPoint - lastPoint`.
2. `Convert::init(width, height)`. This resets the screen size and the centre to the widget midpoint on every draw.
3. Allocate `buffer = QPixmap(size)`, fill white, open a `QPainter` on it, and `translate(panPoint)`.
4. Draw each visible `MapLayer` in list order, then the `CosmeticLayer`, if there is one.
5. `bitBlt` the buffer to the widget.

Interaction shortcuts:

- **Pan drag** (`mouseMoveEvent`): erases the exposed region and blits the cached buffer at the drag offset, with no re-render. A full redraw happens on release.
- **Line rubber-band**: restores the buffer under the previous rubber-band rectangle, then paints a red line straight onto the widget.

Each shape converts its own degree coordinates to pixels inside `draw()`, so every redraw transforms every vertex. Nothing is cached per zoom level.

## Coordinate transform (`Convert`)

The transform is equirectangular, with the scale factor `sf` applied around the widget centre:

```
diffx = W / 360          diffy = H / 180        centre = (W/2, H/2)
px = lon * sf * diffx + centerx
py = centery - lat * sf * diffy
lon = (px - centerx) / diffx / sf
lat = (centery - py) / diffy / sf
```

The pan offset is applied separately through `QPainter::translate`. Mouse-to-degree conversions subtract `panPoint` first.

Consequences:

- The aspect ratio is not preserved: `diffx != diffy` unless W:H is 2:1.
- The state is static and therefore global across all open project windows.
- Zoom in and out change `sf` by ±1. They also call `Convert::setCenter(lon, lat)`, but the next `draw()` resets the centre through `Convert::init`, so the zoom doesn't recentre on the click. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Draw modes

`MapWindow::DrawMode` sets the cursor and decides how mouse events are handled:

| Mode | Value | Mouse behaviour |
|---|---|---|
| Normal | 0 | None |
| ZoomIn / ZoomOut | 1 / 2 | Release → sf ± 1 |
| ZoomFull | 3 | Unused as a mode. `zoomFull()` calls `setDefaults()` (sf = 1, pan = 0) |
| Pan | 4 | Drag to move |
| Identify | 5 | Move → lat/long in the status bar (shows for every mode ≥ 5) |
| Point | 6 | Release → add a `ShapePoint` to the cosmetic layer |
| Line | 7 | Press–drag–release → add a 2-point `ShapeCLLine` |
| Circle / Polygon / Bitmap | 8 / 9 / 10 | Cursor only. Not implemented |

Clicking the active tool's button again returns to Normal (`ProjectWindow::zoomIn()` and the others work as toggles).

## Persistence

- **Project**: `ProjectWindow::_save()` hand-writes XML: scale factor, pan, the cosmetic layer path, and each layer's name, path, colours and visibility. `load()` reads it back with `QDomDocument`. It walks child elements by position, not by tag name, so element order matters.
- **Cosmetic layer**: `CosmeticLayer::save()` runs as part of the project save. Shape IDs are assigned as `shapeCount()` at creation time.
- **Shapefiles** are never written.

Schemas are in [FILE_FORMATS.md](FILE_FORMATS.md).

## Memory ownership

Ownership is mostly by Qt parent (`MapLayer` and `CosmeticLayer` are `QObject`s parented to the `MapWindow`). However, the `QPtrList<Shape>` lists don't use `setAutoDelete(true)`, and the destructors are empty, so shape objects, coordinate arrays and the `QFile` in `MapLayer` leak when a layer or window closes. That's acceptable for a short-lived desktop session. Fix it during any port.

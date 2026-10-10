# Building the 2004 version (SmartMap 1)

> For SmartMap 2 (Tauri), see [DEVELOPMENT.md](DEVELOPMENT.md). This page covers the archived Qt 3 code in `legacy/`.

## Original toolchain (2004)

| Item | Value |
|---|---|
| Qt | 3.2.1 (`qt-mt321.lib`, multithreaded DLL build) |
| qmake | 1.06c |
| Compiler | Microsoft Visual C++ 6 / 7 (`cl`, flags `-MDd -Zi -GX -W3`, debug build) |
| Platform | Windows 2000/XP. The thesis says it was also compiled on Red Hat Linux 9. |

Original build steps, from a Qt 3 command prompt in `legacy/source/`:

```
qmake -o Makefile sm.pro
nmake
```

`moc` runs on the `Q_OBJECT` headers: `application.h`, `cosmeticlayer.h`, `layermanager.h`, `layerpanel.h`, `maplayer.h`, `mapwindow.h`, `projectwindow.h`, `removelayerdialog.h` and `smabout.h`. `smartmap.rc` embeds `images/smartmap.ico`. The committed `Makefile` has hard-coded paths for the authors' machine, so regenerate it rather than using it.

On Linux/X11 the same `qmake sm.pro && make` works with Qt 3 installed. The `RC_FILE` line is ignored there.

## Running

Run the executable with `legacy/source/` as the working directory. Icons, cursors, the splash screen and the logo load from relative `images/...` paths.

## Why it won't build on a modern system

1. **Qt 3 API.** Qt 4 shipped `Qt3Support`, but Qt 5 and 6 removed every class below. Homebrew's `qmake` and `qmake6` are Qt 5/6.
2. **Pre-standard C++.** Loop variables are reused after the `for` scope ends (`shapepolygon.cpp:20`, `shapepolyline.cpp:18,21`, `maplayer.cpp` reuses the outer `i`). Modern GCC, Clang and MSVC reject this.
3. **Other old idioms.** `abs()` on doubles via `<stdlib.h>`. Passing temporaries to non-const `QString&` parameters (`emit layerAddedAt( n, layerName( index ) )`). Assigning a `QPainter` (`painter = QPainter( &buffer )`).

### Option A: run it as-is under a legacy toolchain

- **TQt3 (Trinity Desktop)** is a maintained Qt 3 fork. It builds on current Debian and Ubuntu. Rename the includes with Trinity's `tqt3` conversion tools, or use its `qt3` compatibility headers.
- **Virtual machine**: Windows XP + VC6 + Qt 3.2/3.3 (free edition), or an old Linux distro with the `qt3-dev` packages. Compile with `-fpermissive` on GCC for the `for`-scope issue (old GCC also has `-fno-for-scope`).

### Option B: port to Qt 5 or 6

There's no Qt Designer `.ui`, so every widget is created in code, and porting is mechanical. Suggested mapping:

| Qt 3 | Qt 5/6 replacement |
|---|---|
| `QPtrList<T>` + `QPtrListIterator` | `QList<T*>` (or `std::vector<std::unique_ptr<T>>`), range-for |
| `QPointArray` | `QPolygon` / `QPolygonF` |
| `QPopupMenu`, `menuBar()->insertItem` | `QMenu`, `QAction`, `menuBar()->addMenu` |
| `QToolButton(icon, text, …, slot, toolbar)` | `QAction` added to a `QToolBar`, checkable inside a `QActionGroup` (which replaces the manual mutual-exclusion code in `ApplicationWindow`) |
| `QWorkspace` | `QMdiArea` / `QMdiSubWindow` |
| `QDockWindow` | `QDockWidget` |
| `QListView` + `QCheckListItem` | `QListWidget` with checkable items, or `QTreeWidget` |
| `QListBox` | `QListWidget` |
| `QVBox` | `QWidget` + `QVBoxLayout` |
| `QFileDialog::getOpenFileName(dir, filter, parent, name, caption)` | `QFileDialog::getOpenFileName(parent, caption, dir, filter)` |
| `QColorDialog::getColor(c, parent)` | same, different overloads |
| `IO_ReadOnly` / `IO_WriteOnly` | `QIODevice::ReadOnly` / `WriteOnly` |
| `setCaption` / `setIcon` | `setWindowTitle` / `setWindowIcon` |
| `bitBlt(widget, …, &pixmap)` and painting outside `paintEvent` | Paint the cached `QPixmap` in `paintEvent` and call `update()`. Draw the rubber band in `paintEvent` too. Qt 5+ forbids painting on a widget outside `paintEvent`. |
| `QPainter::begin` on a widget from mouse events | Store the state and paint it in `paintEvent` |
| `QDataStream >> int` + `setByteOrder` | Unchanged, but use `qint32` and `double`, and read the bounding box as 8 doubles (see KNOWN_ISSUES #1) |
| `QDomDocument` | Unchanged (`QtXml`), or `QXmlStreamReader` |
| `QString::findRev`, `QString::compare` | `lastIndexOf`, `==` |
| `QMessageBox::warning(…, Yes, No, Cancel)` | `QMessageBox::warning(…, StandardButtons)` |
| `QSplashScreen` | Unchanged |
| `qApp->setMainWidget` | Remove it. `lastWindowClosed` → quit is the default. |
| `QWhatsThis::add` | `widget->setWhatsThis()` |
| `QAccel`, `CTRL+Key_N` | `QKeySequence::New` / `Qt::CTRL \| Qt::Key_N` |

Suggested `.pro` for a port:

```
QT += widgets xml
CONFIG += c++17
TEMPLATE = app
TARGET = smartmap
```

Or use CMake with `find_package(Qt6 COMPONENTS Widgets Xml)`.

While porting, also fix:

- the static `Convert` state (make it a per-`MapWindow` transform, or use a `QTransform` on the painter)
- shape ownership
- the shapefile header bug
- loading assets from Qt resources (`.qrc`) instead of CWD-relative paths

See [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Tests

There are no automated tests. The thesis describes manual black-box, white-box, unit, regression, system and acceptance testing. If you port the code, the easiest place to start testing is the pure logic:

- `Convert` round-trips
- `MapLayer` parsing against the sample `.shp` files (expected record counts: world 251, Country Boundaries 2 15, Water Bodies 2 22, Streets and Railroads 1 189, meanmotp 248)
- `.smproj` and `.scl` save/load round-trips

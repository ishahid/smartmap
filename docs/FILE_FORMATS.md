# File formats

SmartMap uses three file types:

| Extension | Direction | Format | Code |
|---|---|---|---|
| `.shp` | read only | ESRI Shapefile main file (binary) | `MapLayer::MapLayer` (`legacy/source/maplayer.cpp`) |
| `.smproj` | read/write | XML project | `ProjectWindow::load/traverseNode/_save` (`legacy/source/projectwindow.cpp`) |
| `.scl` | read/write | XML cosmetic layer | `CosmeticLayer` (`legacy/source/cosmeticlayer.cpp`) |

## Shapefile (`.shp`)

SmartMap reads only the main `.shp` file. It ignores the `.shx` index and the `.dbf` attributes, so there's no attribute data. "Identify" shows coordinates only.

### Header (100 bytes)

| Bytes | Field | Endian | Stored in |
|---|---|---|---|
| 0–3 | File code (must be 9994) | big | `_fileCode` |
| 4–23 | 5 unused ints | big | — |
| 24–27 | File length in 16-bit words | big | `_fileLength` (doubled to bytes) |
| 28–31 | Version (1000) | little | `_version` |
| 32–35 | Shape type | little | `_shapeType` |
| 36–99 | Bounding box: 8 doubles (Xmin, Ymin, Xmax, Ymax, Zmin, Zmax, Mmin, Mmax) | little | read as **8 ints** into `_boundingBox`. This is a bug: it consumes only 32 of the 64 bytes, so record parsing starts at byte 68 instead of 100 and the first records are lost. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md#1-shapefile-header-misread-drops-the-first-records) |

### Records

Each record has a big-endian header (record number, content length in words), followed by a little-endian shape type and its content:

| Type | Name | Content parsed | Class |
|---|---|---|---|
| 0 | Null | none | `NullShape` |
| 1 | Point | X, Y (double) | `ShapePoint` |
| 3 | PolyLine | Box[4], NumParts, NumPoints, Parts[], Points[] | `ShapePolyLine` |
| 5 | Polygon | same as PolyLine | `ShapePolygon` |
| other | — | **not skipped**, so the stream desyncs | (NULL appended) |

`ShapeType::isValid` accepts every ESRI code (0, 1, 3, 5, 8, 11, 13, 15, 18, 21, 23, 25, 28, 31), but only 0, 1, 3 and 5 actually parse.

The validation of the file code and shape type runs **after** all records have been read.

### Rendering by layer type (`MapLayer::draw`)

| Layer type | Pen | Brush |
|---|---|---|
| Point (1) | line colour | line colour |
| PolyLine (3) | line colour, width 2, DashDot | line colour |
| Polygon (5) and others | line colour, width 1 | fill colour |

## Project file (`.smproj`)

UTF-8 XML. Example from `legacy/source/abc.smproj`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<SmartMapProject>
  <Layers ScaleFactor="1.000000" PanX="0" PanY="0">
    <CosmeticLayer>
      <Path>D:/Docs/MCS/SmartMap/sm/mycl.scl</Path>
    </CosmeticLayer>
    <Layer>
      <Name>world</Name>
      <Path>D:/Docs/MCS/SmartMap/sm/data/world.shp</Path>
      <FillColor>#cd853f</FillColor>
      <LineColor>#000000</LineColor>
      <Visible>true</Visible>
    </Layer>
    <!-- more <Layer> elements, bottom-most first -->
  </Layers>
</SmartMapProject>
```

Rules the loader relies on:

- `<Layers>` must be the first child of the root, and `<CosmeticLayer>` must be the first child of `<Layers>`. The loader always writes this element, with an empty `<Path>` when there's no cosmetic layer.
- `<Layer>` children are read **by position**: Name, Path, FillColor, LineColor, Visible. Reordering or adding elements breaks loading.
- Colours are `QColor::name()` strings (`#rrggbb`). Visibility is the literal `true`. Anything else counts as false.
- `<Layer>` elements are listed bottom-to-top, matching `MapWindow::layers`.
- `ScaleFactor` is a double. `PanX`/`PanY` are integer pixel offsets.
- Paths are absolute and stored exactly as the user picked them. Every sample in the repo points to `D:/Docs/MCS/SmartMap/sm/...`, so update the paths to load them on another machine.

`legacy/source/abc.xml` is the same schema saved under a different extension.

## Cosmetic layer (`.scl`)

UTF-8 XML. `.scl` gets appended to the name when it's missing. Example from `legacy/source/mycl.scl.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<SmartMapCosmeticLayer>
  <Shapes>
    <Shape Id="0" Type="1">
      <Point X="70.028670" Y="31.202830"/>
    </Shape>
    <Shape Id="5" Type="996">
      <Point X="73.176606" Y="32.971698"/>
      <Point X="69.977064" Y="31.167453"/>
    </Shape>
  </Shapes>
</SmartMapCosmeticLayer>
```

- X = longitude and Y = latitude, in decimal degrees with 6 decimal places.
- `Id` is the shape count at the moment the shape was created. IDs aren't guaranteed unique once deletion exists, and deletion isn't implemented yet.

| Type | Meaning | Points | Notes |
|---|---|---|---|
| 1 | Point | 1 | |
| 996 | Line | ≥ 2 (UI writes 2) | |
| 997 | Circle | 2 | Saved as (top-left, size), but the **constructor reinterprets** them as (centre, edge) on load. A save→load round trip is not stable. See KNOWN_ISSUES. |
| 998 | Polygon | ≥ 3 | Load only (no drawing tool) |
| 999 | Bitmap | — | Reserved, ignored on load |

Samples: `legacy/source/test.scl` (11 shapes), `legacy/source/test2.scl` (5), `legacy/source/mycl.scl.xml` (11).

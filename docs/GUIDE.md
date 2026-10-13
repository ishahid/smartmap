# Using SmartMap 2

SmartMap opens map data files, shows them over a basemap, and lets you draw your own notes on the map. This guide covers SmartMap 2.0. (The 2004 SmartMap 1 guide is [USER_GUIDE.md](USER_GUIDE.md).)

Shortcuts below use **Cmd** for macOS. On Windows and Linux use **Ctrl** instead. Help → Keyboard Shortcuts lists them all.

## Installing

Download the installer for your computer from the project's GitHub Releases page:

| Computer | File |
|---|---|
| Mac (Apple Silicon or Intel) | `.dmg`: open it and drag SmartMap to Applications |
| Windows PC | the x64 `.exe` (or `.msi`); on an ARM PC (Snapdragon), the `arm64` `.exe` |
| Linux | the `.AppImage` (any distro), or the `.deb` (Debian, Ubuntu) or `.rpm` (Fedora, openSUSE). `aarch64` files are for ARM machines. |

The installers aren't signed, so the first launch needs one extra step:

- **macOS:** right-click SmartMap in Applications, choose Open, then Open again.
- **Windows:** if SmartScreen warns, choose More info → Run anyway.
- **Linux AppImage:** make it executable first (`chmod +x SmartMap*.AppImage`), then run it.

## The window

- **Toolbar:** New, Open…, Save and Save As…; the basemap menu; Globe; Measure; and the search box on the right.
- **Layers panel** (left): your layers, top layer drawn on top. Click a layer to style it; its style, filter and statistics appear below the list.
- **Map:** drag to pan, scroll to zoom, right-drag (or Ctrl+drag) to rotate and tilt. Click a feature to see its attributes.
- **Attribute table** (bottom, when open): the selected layer's features as rows.
- **Status bar:** the latitude and longitude under the mouse (click it to switch between decimal degrees and degrees/minutes/seconds), the zoom level and messages.

## Opening data

File → Open… (Cmd+O), or drop files on the window. SmartMap reads:

| Format | Files |
|---|---|
| Shapefile | `.shp` (with its `.dbf`, `.shx` and `.prj` next to it) |
| GeoJSON | `.geojson`, `.json` |
| GeoPackage | `.gpkg` (every feature table becomes a layer) |
| FlatGeobuf | `.fgb` |
| KML / KMZ | `.kml`, `.kmz` |
| GPX | `.gpx` (waypoints, routes and tracks) |
| CSV | `.csv`, `.tsv`, `.txt` with longitude/latitude columns (named `longitude`, `lon`, `lng`, `long` or `x`, and `latitude`, `lat` or `y`) |

Data in another coordinate system is converted to longitude/latitude using the Shapefile's `.prj`, the GeoPackage's SRS table or the file's EPSG code. If SmartMap can't work out the coordinate system, the layer still opens with its coordinates unchanged, and a message says why.

When you drop a Shapefile, drop the `.shp` (dropping its `.dbf` or `.shx` as well does no harm).

## Layers

In the layers panel:

- **Drag** the handle to change the drawing order (or focus it and press ↑/↓).
- The **check box** shows or hides a layer.
- **Double-click** a name to rename it.
- The buttons on each row open the **attribute table**, **zoom to the layer**, **export** it (GeoPackage or GeoJSON) and **remove** it. Annotation layers also have ✎ to edit them.

### Styling

Click a layer to open its style:

- **Single:** one colour for every feature.
- **Categorized:** a colour per value of a field (for example, by country or road type).
- **Graduated:** colours from a ramp for a numeric field, split by quantile or equal interval.

You can also set opacity, outline and line widths, point size and shape (circle, square, triangle, diamond, star), and labels from a field.

### Filters

A layer's filter hides features that don't match, on the map, in the table and in search. Add conditions as *field operator value* (=, ≠, <, ≤, >, ≥, contains, starts with, is empty, is not empty), joined with AND or OR. The feature count in the layers panel shows how many match.

## Finding things

- **Identify:** click a feature to see its attributes, with its length or area. Where several features overlap, pick one from the list.
- **Attribute table** (Cmd+T): sort by clicking a column, search per column, select rows with Cmd-click and Shift-click, and zoom to the selected features. Selections show on the map too.
- **Search** (Cmd+F): finds features in the visible layers by any attribute.
- **Select All** (Cmd+A): selects every feature of the chosen layer that passes its filter. Esc clears the selection.
- **Statistics** (below a layer's style): count, minimum, maximum, mean, median, standard deviation and sum of a numeric field, for the features the filter shows, or only the selected ones.

## Annotation layers

Annotation layers hold your own drawings and are saved inside the project.

1. Layer → New Annotation Layer (or **+ Annotation layer** in the layers panel).
2. Pick a tool from the floating toolbar: point, marker, text, line, polygon, rectangle, circle or freehand. For lines, click the last point again to finish; for polygons, click the first point.
3. Use **Select** (⬚) to move, reshape and resize shapes. Alt/Option+drag rotates. **Snap** makes new points stick to nearby vertices.
4. Click **Done** when you've finished.

With a shape selected, the panel on the left sets its name, description and style. Cut, Copy, Paste, Duplicate (Cmd+D) and Delete work on shapes; Copy also works on features selected in data layers, so you can paste them into an annotation layer. Every change can be undone (Cmd+Z) and redone (Cmd+Shift+Z).

## Measuring

Tools → Measure (Cmd+Shift+M) or **📏 Measure** in the toolbar. Click points on the map to measure a distance, or switch to area. Measurements are geodesic (on the WGS84 ellipsoid, like professional GIS software). Units are metric, imperial or nautical. Esc twice stops measuring.

## Projects

A project (`.smartmap` file) remembers the layers, their styles and filters, the annotation layers, the basemap and the map view. Paths to data files are stored relative to the project, so you can move or share a folder holding the project and its data.

- File → Save (Cmd+S) and Save As (Cmd+Shift+S). The title bar marks unsaved changes.
- File → Open Recent lists recent projects.
- If some of a project's data files can't be found (moved, or on an unplugged drive), the layers panel lists them under **Not found**. They stay in the project until you remove them, so plugging the drive back in and reopening the project brings them back.
- SmartMap asks before unsaved changes are lost: on New, Open, closing the window and Quit (Exit on Windows and Linux).

## Basemaps

The basemap menu offers three OpenFreeMap styles (these need the internet), None, and an **offline map**: a PMTiles or MBTiles file on your computer, which works with no connection at all. File → Open Offline Map… picks one, or drop it on the window. [OFFLINE_MAPS.md](OFFLINE_MAPS.md) explains how to make one for your area. **Globe** shows the world as a globe when zoomed out.

## Preferences

SmartMap → Settings… on macOS, File → Preferences… elsewhere (Cmd+,):

- **Appearance:** follow the system, light or dark.
- **Measurement units:** metric, imperial or nautical (measuring, identify and the scale bar).
- **Coordinates:** decimal degrees or degrees/minutes/seconds.
- **Basemap for new projects.**

## Known limitations in 2.0

- Raster files (GeoTIFF and similar) aren't supported.
- Data layers can't be edited; only annotation layers can. Copy data features into an annotation layer to change them.
- No printing.
- On macOS, quitting from the Dock doesn't ask about unsaved changes (Cmd+Q and SmartMap → Quit do).
- On Linux, clicking Edit → Cut, Copy or Paste in the menu does nothing; the keyboard shortcuts work.
- The installers aren't signed (see Installing).

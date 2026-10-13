# Changelog

## 2.0.0 (unreleased)

SmartMap 2 is a complete rebuild of the 2004 SmartMap 1 (Qt 3 / C++) with Rust, Tauri 2, Svelte 5 and MapLibre GL. It runs on macOS (Apple Silicon and Intel), Windows (x64 and ARM64) and Linux (x64 and ARM64). How to use it: [docs/GUIDE.md](docs/GUIDE.md).

### Data

- Opens Shapefile, GeoJSON, GeoPackage (every feature table), FlatGeobuf, KML/KMZ, GPX and CSV (longitude/latitude columns).
- Converts other coordinate systems to longitude/latitude (from `.prj` files, EPSG codes and GeoPackage SRS tables). A layer whose coordinate system isn't understood still opens, with a warning.
- Reads every record of the 2004 sample files, including the ones SmartMap 1's parser dropped.
- A damaged file gives an error message instead of closing the app.
- Exports any layer to GeoPackage or GeoJSON.

### Map

- Online basemaps (three OpenFreeMap styles), offline basemaps from PMTiles and MBTiles files, and a globe view.
- Layer panel: drawing order, visibility, opacity, rename, zoom to layer.
- Styles: single colour, categorized, graduated (quantile or equal interval), point shapes and labels.

### Tools

- Identify, attribute table (100,000+ rows), layer filters, search, select all.
- Annotation layers: points, markers, text, lines, polygons, rectangles, circles and freehand shapes, with move, reshape, rotate, snapping, cut/copy/paste, and undo/redo for every edit.
- Geodesic measuring of distances and areas, and field statistics.

### App

- Projects (`.smartmap`) with relative paths, Open Recent, and a prompt before unsaved changes are lost.
- Native menus and shortcuts on each OS, preferences (light/dark appearance, units, coordinate format, default basemap) and drag and drop.

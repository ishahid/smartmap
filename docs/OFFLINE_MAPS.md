# Offline maps

SmartMap can show a basemap from a file on your computer instead of downloading it, so the map works with no internet connection. It reads two kinds of file:

- **PMTiles** (`.pmtiles`): one file holding every tile of a map. This is the format to use.
- **MBTiles** (`.mbtiles`): an SQLite database of tiles, made by many older tools.

## Making a PMTiles file of your area

[Protomaps](https://protomaps.com) builds a map of the whole world from OpenStreetMap every day. You cut out the part you need with the free `pmtiles` command-line program.

1. Download `pmtiles` for your system from [github.com/protomaps/go-pmtiles/releases](https://github.com/protomaps/go-pmtiles/releases) and unzip it.
2. Find a recent build date at [maps.protomaps.com/builds](https://maps.protomaps.com/builds).
3. Cut out your area. For example, Pakistan up to zoom level 12:

   ```bash
   pmtiles extract https://build.protomaps.com/20261001.pmtiles pakistan.pmtiles --bbox=60.8,23.6,77.9,37.1 --maxzoom=12
   ```

   - `--bbox` is the area: west, south, east, north, in degrees. [bboxfinder.com](http://bboxfinder.com) helps find one.
   - `--maxzoom` sets how far in you can zoom with full detail. Zoom 12 shows streets in towns; 14 or 15 shows every building and footpath. Each extra level makes the file about four times bigger: a country at zoom 12 is a few hundred MB.
   - Only the tiles of your area are downloaded, not the whole world (about 120 GB).
4. In SmartMap, choose **Basemap → Open offline map…** and pick the file.

Save the project afterwards: the file's location (relative to the project, like data layers) and its colour scheme are stored in it, so the project opens with the same basemap next time. If the file has moved, the project still opens with an online basemap, and the message bar says what was missing.

## Colour schemes and labels

Protomaps maps can be shown in five colour schemes: Light, Dark, White, Grey and Black (the menu next to the basemap). Place names are shown in your computer's language where the map has them, otherwise in the local name.

Labels are drawn with your computer's own fonts, so they need nothing from the internet. The icons for shops, parks and so on come with SmartMap.

## Other files

- **Older Protomaps files** (layer scheme version 3, made before late 2024) name their attributes differently, so they're shown in a plain grey style. Make a new extract for the full style.
- **Image tiles** (PNG, JPEG or WebP, such as scanned or aerial maps in MBTiles) are shown as they are.
- **Other vector tiles** (for example OpenMapTiles MBTiles) get a plain grey style that draws every layer, with water in blue.

PMTiles files compressed with Brotli or Zstandard can't be read yet; `pmtiles extract` writes gzip, which works.

## How it works

Rust opens the file (`src-tauri/src/tiles/`) and serves its tiles to the map at `tiles://localhost/<id>/<z>/<x>/<y>` (`http://tiles.localhost/...` on Windows), reading only the bytes each tile needs. The map's style is built in `src/lib/map/offline.ts`. Nothing is sent over the network.

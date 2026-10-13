//! Damaged files must give an error message, never crash the app.
//!
//! A panic inside a command would take the whole app down (and any unsaved
//! work with it), so every reader and the offline-map code are fed cut-short
//! and scrambled copies of good files. Each one may open (a damaged byte can
//! land somewhere harmless) or fail with an error; what it may not do is panic.
//!
//! The damage is "random" but repeatable: the same seed gives the same files
//! on every run, so a failure can be reproduced.

mod common;

use std::io::Write;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::{Path, PathBuf};

use shapefile::dbase::{self, FieldValue};
use smartmap_lib::io::open_file;
use smartmap_lib::tiles::TileServer;

/// How many scrambled copies of each file to try.
const SCRAMBLED_COPIES: usize = 150;

/// A tiny, repeatable random number generator (xorshift). Good enough for
/// picking bytes to damage; not for anything that needs real randomness.
struct Random(u64);

impl Random {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    /// A number from 0 up to (not including) `limit`.
    fn below(&mut self, limit: usize) -> usize {
        (self.next() % limit.max(1) as u64) as usize
    }
}

/// Damaged copies of `good`: cut short at various lengths, then with a few
/// bytes overwritten. Half the scrambled copies hit the first 256 bytes, where
/// headers (and so lengths and offsets that a reader trusts) usually live.
fn damaged_copies(good: &[u8], seed: u64) -> Vec<(String, Vec<u8>)> {
    let mut copies = Vec::new();
    let len = good.len();
    for cut in [0, 1, 4, 16, 64, 100, 127, len / 4, len / 2, len - 1] {
        if cut < len {
            copies.push((format!("cut to {cut} bytes"), good[..cut].to_vec()));
        }
    }
    let mut random = Random(seed);
    for copy in 0..SCRAMBLED_COPIES {
        let mut bytes = good.to_vec();
        let range = if copy % 2 == 0 { len.min(256) } else { len };
        let count = 1 + random.below(8);
        let mut changed = Vec::new();
        for _ in 0..count {
            let at = random.below(range);
            // Sometimes an extreme value (0x00 / 0xFF), which makes huge or zero lengths.
            bytes[at] = match random.below(3) {
                0 => 0x00,
                1 => 0xFF,
                _ => random.next() as u8,
            };
            changed.push(at);
        }
        copies.push((format!("bytes {changed:?} changed"), bytes));
    }
    copies
}

/// Runs `open` on every damaged copy of `good` (saved as `name` in `dir`) and
/// returns a line for each copy that panicked.
fn panics_on_damage(
    dir: &Path,
    name: &str,
    good: &[u8],
    seed: u64,
    open: impl Fn(&Path),
) -> Vec<String> {
    let path = dir.join(name);
    let mut panics = Vec::new();
    for (damage, bytes) in damaged_copies(good, seed) {
        std::fs::write(&path, &bytes).unwrap();
        if let Err(panic) = catch_unwind(AssertUnwindSafe(|| open(&path))) {
            let message = panic
                .downcast_ref::<String>()
                .cloned()
                .or_else(|| panic.downcast_ref::<&str>().map(|s| s.to_string()))
                .unwrap_or_default();
            panics.push(format!("{name}, {damage}: {message}"));
        }
    }
    panics
}

fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name)
}

/// Fails the test with every panic found, so one run shows them all.
fn assert_no_panics(panics: Vec<String>) {
    assert!(
        panics.is_empty(),
        "{} damaged files panicked instead of giving an error:\n{}",
        panics.len(),
        panics.join("\n")
    );
}

/// Opens a data file the way the app does, ignoring whether it worked.
fn open_data(path: &Path) {
    let _ = open_file(path);
}

#[test]
fn damaged_text_formats_give_errors() {
    let dir = tempfile::tempdir().unwrap();
    let mut panics = Vec::new();
    for (seed, name) in [
        "mixed.geojson",
        "cities_3857.geojson",
        "cities.csv",
        "places.kml",
        "walk.gpx",
    ]
    .into_iter()
    .enumerate()
    {
        let good = std::fs::read(fixture(name)).unwrap();
        panics.extend(panics_on_damage(
            dir.path(),
            name,
            &good,
            seed as u64 + 1,
            open_data,
        ));
    }
    assert_no_panics(panics);
}

#[test]
fn damaged_shapefiles_give_errors() {
    let source = tempfile::tempdir().unwrap();
    let shp = source.path().join("cities.shp");
    // A small shapefile with attributes, so the .dbf can be damaged too.
    let table = dbase::TableWriterBuilder::new()
        .add_character_field("NAME".try_into().unwrap(), 30)
        .add_numeric_field("POP".try_into().unwrap(), 10, 0);
    let mut writer = shapefile::Writer::from_path(&shp, table).unwrap();
    for (name, pop, x, y) in [
        ("Rawalpindi", 2_100_000.0, 73.05, 33.6),
        ("Lahore", 13_000_000.0, 74.3, 31.5),
    ] {
        let mut record = dbase::Record::default();
        record.insert("NAME".into(), FieldValue::Character(Some(name.into())));
        record.insert("POP".into(), FieldValue::Numeric(Some(pop)));
        writer
            .write_shape_and_record(&shapefile::Point::new(x, y), &record)
            .unwrap();
    }
    drop(writer);
    let good_shp = std::fs::read(&shp).unwrap();
    let good_shx = std::fs::read(source.path().join("cities.shx")).unwrap();
    let good_dbf = std::fs::read(source.path().join("cities.dbf")).unwrap();
    // The polygons of the 2004 world map (no .dbf), for more varied records.
    let world = std::fs::read(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../legacy/source/data/world.shp"),
    )
    .unwrap();

    let dir = tempfile::tempdir().unwrap();
    let mut panics = Vec::new();
    // Damage one of the three files at a time; the other two stay good.
    let write_good = |except: &str| {
        for (ext, bytes) in [("shp", &good_shp), ("shx", &good_shx), ("dbf", &good_dbf)] {
            if ext != except {
                std::fs::write(dir.path().join(format!("cities.{ext}")), bytes).unwrap();
            }
        }
    };
    let open_cities = |_: &Path| open_data(&dir.path().join("cities.shp"));
    for (seed, ext, good) in [
        (10, "shp", &good_shp),
        (11, "shx", &good_shx),
        (12, "dbf", &good_dbf),
    ] {
        write_good(ext);
        panics.extend(panics_on_damage(
            dir.path(),
            &format!("cities.{ext}"),
            good,
            seed,
            open_cities,
        ));
    }
    panics.extend(panics_on_damage(
        dir.path(),
        "world.shp",
        &world,
        13,
        open_data,
    ));
    assert_no_panics(panics);
}

#[test]
fn damaged_binary_formats_give_errors() {
    let source = tempfile::tempdir().unwrap();
    let mut panics = Vec::new();
    let dir = tempfile::tempdir().unwrap();

    // KMZ: a zip holding a KML file.
    let kmz = source.path().join("places.kmz");
    let mut zip = zip::ZipWriter::new(std::fs::File::create(&kmz).unwrap());
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    zip.start_file("doc.kml", options).unwrap();
    zip.write_all(&std::fs::read(fixture("places.kml")).unwrap())
        .unwrap();
    zip.finish().unwrap();

    // FlatGeobuf, written by the flatgeobuf crate itself.
    let fgb = source.path().join("cities.fgb");
    {
        use flatgeobuf::{FgbWriter, GeometryType};
        use geozero::GeozeroDatasource;
        let mut writer = FgbWriter::create("cities", GeometryType::Point).unwrap();
        let text = std::fs::read_to_string(fixture("cities_3857.geojson")).unwrap();
        geozero::geojson::GeoJsonReader(text.as_bytes())
            .process(&mut writer)
            .unwrap();
        writer.write(std::fs::File::create(&fgb).unwrap()).unwrap();
    }

    // GeoPackage, written by SmartMap's own exporter.
    let gpkg = source.path().join("mixed.gpkg");
    let collection: geojson::FeatureCollection = std::fs::read_to_string(fixture("mixed.geojson"))
        .unwrap()
        .parse()
        .unwrap();
    smartmap_lib::export::export(&gpkg, "mixed", &collection).unwrap();

    for (seed, path) in [(20, &kmz), (21, &fgb), (22, &gpkg)] {
        let good = std::fs::read(path).unwrap();
        let name = path.file_name().unwrap().to_str().unwrap();
        panics.extend(panics_on_damage(dir.path(), name, &good, seed, open_data));
    }
    assert_no_panics(panics);
}

#[test]
fn damaged_offline_maps_give_errors() {
    let source = tempfile::tempdir().unwrap();
    let dir = tempfile::tempdir().unwrap();

    // Zoom 0 to 2 in leaf directories of 4 tiles, so damage can reach every part.
    let mut tiles = Vec::new();
    for z in 0..=2u8 {
        for x in 0..(1u32 << z) {
            for y in 0..(1u32 << z) {
                tiles.push(((z, x, y), format!("tile {z}/{x}/{y}").into_bytes()));
            }
        }
    }
    let borrowed: Vec<_> = tiles
        .iter()
        .map(|(zxy, data)| (*zxy, data.as_slice()))
        .collect();
    let pmtiles = source.path().join("map.pmtiles");
    common::write_pmtiles(&pmtiles, &borrowed, Some(4));

    let mbtiles = source.path().join("map.mbtiles");
    let db = rusqlite::Connection::open(&mbtiles).unwrap();
    db.execute_batch(
        "CREATE TABLE metadata (name TEXT, value TEXT);
         CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);
         INSERT INTO metadata VALUES ('name', 'Test'), ('format', 'png'), ('bounds', '-10,-20,30,40');
         INSERT INTO tiles VALUES (0, 0, 0, x'89504E47'), (1, 0, 1, x'89504E47');",
    )
    .unwrap();
    drop(db);

    // Open the file, then ask for every tile the way the map would.
    let open_and_read = |path: &Path| {
        let server = TileServer::default();
        if let Ok(info) = server.open(path) {
            for ((z, x, y), _) in &tiles {
                server.respond(&format!("/{}/{z}/{x}/{y}", info.id));
            }
        }
    };

    let mut panics = Vec::new();
    for (seed, path) in [(30, &pmtiles), (31, &mbtiles)] {
        let good = std::fs::read(path).unwrap();
        let name = path.file_name().unwrap().to_str().unwrap();
        panics.extend(panics_on_damage(
            dir.path(),
            name,
            &good,
            seed,
            open_and_read,
        ));
    }
    assert_no_panics(panics);
}

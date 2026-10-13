//! Offline basemap files: PMTiles and MBTiles files are built here, then read
//! back through `TileServer` the way the tiles:// protocol does.

mod common;

use std::path::Path;

use common::{Zxy, gzip, write_pmtiles};
use smartmap_lib::tiles::{TileServer, TileType};

/// Every tile from zoom 0 to 3, each holding its own address as text.
fn sample_tiles() -> Vec<(Zxy, Vec<u8>)> {
    let mut tiles = Vec::new();
    for z in 0..=3u8 {
        for x in 0..(1u32 << z) {
            for y in 0..(1u32 << z) {
                tiles.push(((z, x, y), format!("tile {z}/{x}/{y}").into_bytes()));
            }
        }
    }
    tiles
}

fn check_every_tile(server: &TileServer, id: &str, tiles: &[(Zxy, Vec<u8>)]) {
    for ((z, x, y), expected) in tiles {
        let response = server.respond(&format!("/{id}/{z}/{x}/{y}"));
        assert_eq!(response.status, 200, "{z}/{x}/{y}");
        assert_eq!(&response.body, expected, "{z}/{x}/{y}");
        assert_eq!(response.content_type, "application/x-protobuf");
    }
}

#[test]
fn pmtiles_with_one_directory() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("map.pmtiles");
    let tiles = sample_tiles();
    let borrowed: Vec<_> = tiles.iter().map(|(a, d)| (*a, d.as_slice())).collect();
    write_pmtiles(&path, &borrowed, None);

    let server = TileServer::default();
    let info = server.open(&path).unwrap();
    assert_eq!(info.name, "Test map");
    assert_eq!(info.format, "PMTiles");
    assert_eq!(info.tile_type, TileType::Vector);
    assert_eq!((info.min_zoom, info.max_zoom), (0, 3));
    assert_eq!(info.attribution.as_deref(), Some("Test data"));
    assert_eq!(info.version.as_deref(), Some("4.1.0"));
    assert_eq!(info.vector_layers, ["earth", "roads"]);
    let bounds = info.bounds.unwrap();
    assert!((bounds[0] - 11.1).abs() < 1e-6 && (bounds[3] - 43.9).abs() < 1e-6);
    assert_eq!(info.center.unwrap()[2], 10.0);

    check_every_tile(&server, &info.id, &tiles);
    // Beyond the file's zoom levels, and outside the zoom level's grid.
    assert_eq!(server.respond(&format!("/{}/4/0/0", info.id)).status, 204);
    assert_eq!(server.respond(&format!("/{}/1/2/0", info.id)).status, 204);
}

#[test]
fn pmtiles_with_leaf_directories() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("map.pmtiles");
    let tiles = sample_tiles();
    let borrowed: Vec<_> = tiles.iter().map(|(a, d)| (*a, d.as_slice())).collect();
    // 85 tiles in leaves of 10: the root points to 9 leaf directories.
    write_pmtiles(&path, &borrowed, Some(10));

    let server = TileServer::default();
    let info = server.open(&path).unwrap();
    check_every_tile(&server, &info.id, &tiles);
}

#[test]
fn pmtiles_with_gaps() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("sparse.pmtiles");
    write_pmtiles(&path, &[((0, 0, 0), b"world"), ((2, 1, 2), b"one")], None);

    let server = TileServer::default();
    let id = server.open(&path).unwrap().id;
    assert_eq!(server.respond(&format!("/{id}/0/0/0")).body, b"world");
    assert_eq!(server.respond(&format!("/{id}/2/1/2.pbf")).body, b"one");
    assert_eq!(server.respond(&format!("/{id}/2/1/1")).status, 204);
    assert_eq!(server.respond(&format!("/{id}/1/0/0")).status, 204);
}

#[test]
fn mbtiles_flips_rows() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("map.mbtiles");
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute_batch(
        "CREATE TABLE metadata (name TEXT, value TEXT);
         CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);
         INSERT INTO metadata VALUES ('name', 'Raster test'), ('format', 'png'),
            ('bounds', '-10,-20,30,40'), ('center', '1,2,3'), ('attribution', '© Me');",
    )
    .unwrap();
    // Zoom 1, column 0, *top* row (y = 0) is stored as tile_row 1 (counted from the bottom).
    for (z, x, row, data) in [
        (0, 0, 0, &b"zero"[..]),
        (1, 0, 1, b"top"),
        (1, 0, 0, b"bottom"),
    ] {
        db.execute(
            "INSERT INTO tiles VALUES (?1, ?2, ?3, ?4)",
            (z, x, row, data),
        )
        .unwrap();
    }
    drop(db);

    let server = TileServer::default();
    let info = server.open(&path).unwrap();
    assert_eq!(info.name, "Raster test");
    assert_eq!(info.format, "MBTiles");
    assert_eq!(info.tile_type, TileType::Png);
    assert_eq!((info.min_zoom, info.max_zoom), (0, 1)); // from the tiles table
    assert_eq!(info.bounds, Some([-10.0, -20.0, 30.0, 40.0]));
    assert_eq!(info.center, Some([1.0, 2.0, 3.0]));

    let id = info.id;
    let top = server.respond(&format!("/{id}/1/0/0"));
    assert_eq!((top.status, top.content_type), (200, "image/png"));
    assert_eq!(top.body, b"top");
    assert_eq!(server.respond(&format!("/{id}/1/0/1")).body, b"bottom");
    assert_eq!(server.respond(&format!("/{id}/1/1/1")).status, 204);
}

#[test]
fn mbtiles_vector_tiles_are_unzipped() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("vector.mbtiles");
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute_batch(
        r#"CREATE TABLE metadata (name TEXT, value TEXT);
           CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);
           INSERT INTO metadata VALUES ('format', 'pbf'), ('minzoom', '0'), ('maxzoom', '5'),
             ('json', '{"vector_layers":[{"id":"water"},{"id":"transportation"}]}');"#,
    )
    .unwrap();
    db.execute(
        "INSERT INTO tiles VALUES (0, 0, 0, ?1)",
        [gzip(b"vector tile")],
    )
    .unwrap();
    drop(db);

    let server = TileServer::default();
    let info = server.open(&path).unwrap();
    // No name in the metadata: the file name is used.
    assert_eq!(info.name, "vector");
    assert_eq!(info.tile_type, TileType::Vector);
    assert_eq!((info.min_zoom, info.max_zoom), (0, 5));
    assert_eq!(info.vector_layers, ["water", "transportation"]);
    assert_eq!(
        server.respond(&format!("/{}/0/0/0", info.id)).body,
        b"vector tile"
    );
}

#[test]
fn opening_the_same_file_again_keeps_its_id() {
    let dir = tempfile::tempdir().unwrap();
    let a = dir.path().join("a.pmtiles");
    let b = dir.path().join("b.pmtiles");
    write_pmtiles(&a, &[((0, 0, 0), b"a")], None);
    write_pmtiles(&b, &[((0, 0, 0), b"b")], None);

    let server = TileServer::default();
    let first = server.open(&a).unwrap().id;
    let second = server.open(&b).unwrap().id;
    assert_ne!(first, second);
    assert_eq!(server.open(&a).unwrap().id, first);
    assert_eq!(server.respond(&format!("/{second}/0/0/0")).body, b"b");
}

#[test]
fn other_files_are_rejected_with_a_reason() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("notes.pmtiles");
    std::fs::write(&path, "just some text").unwrap();
    let error = TileServer::default().open(&path).unwrap_err().to_string();
    assert!(
        error.contains("neither a PMTiles nor an MBTiles"),
        "{error}"
    );

    let missing = TileServer::default().open(&dir.path().join("gone.pmtiles"));
    assert!(missing.is_err());
}

/// The sample from https://pmtiles.io (Florence, Protomaps basemap), if it has
/// been downloaded to node_modules/.smartmap-test/ (see docs/DEVELOPMENT.md).
#[test]
fn real_protomaps_file_if_present() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../node_modules/.smartmap-test/firenze.pmtiles");
    if !path.exists() {
        eprintln!("skipped: {} not found", path.display());
        return;
    }
    let server = TileServer::default();
    let info = server.open(&path).unwrap();
    assert_eq!(info.tile_type, TileType::Vector);
    assert!(info.vector_layers.iter().any(|l| l == "roads"));
    // The middle of Florence at zoom 12 is tile 2176/1492.
    let tile = server.respond(&format!("/{}/12/2176/1492", info.id));
    assert_eq!(tile.status, 200);
    // An uncompressed vector tile is a protobuf message, not gzip.
    assert!(!tile.body.starts_with(&[0x1f, 0x8b]));
    assert!(tile.body.len() > 1000);
}

//! Integration tests for every reader except Shapefile (see shapefile_reader.rs).
//!
//! Text formats use small hand-written files in `tests/fixtures/`. Binary
//! formats (GeoPackage, FlatGeobuf, KMZ) are built in a temp folder by the
//! test itself, so the repo holds no opaque binary fixtures.

use std::io::Write;
use std::path::{Path, PathBuf};

use geojson::GeometryValue;
use serde_json::{Value, json};
use smartmap_lib::io::{Layer, open_file};

fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name)
}

/// Opens a file that should contain exactly one layer.
fn open_one(path: &Path) -> Layer {
    let mut layers = open_file(path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    assert_eq!(layers.len(), 1, "{}", path.display());
    layers.remove(0)
}

/// (longitude, latitude) of point feature `index`.
fn point(layer: &Layer, index: usize) -> (f64, f64) {
    match &layer.geojson.features[index]
        .geometry
        .as_ref()
        .expect("has geometry")
        .value
    {
        GeometryValue::Point { coordinates } => (coordinates[0], coordinates[1]),
        other => panic!("expected a point, got {other:?}"),
    }
}

fn assert_near(actual: (f64, f64), expected: (f64, f64)) {
    // 1e-6° ≈ 10 cm.
    assert!(
        (actual.0 - expected.0).abs() < 1e-6 && (actual.1 - expected.1).abs() < 1e-6,
        "got {actual:?}, expected {expected:?}"
    );
}

fn property(layer: &Layer, index: usize, name: &str) -> Value {
    layer.geojson.features[index].properties.as_ref().unwrap()[name].clone()
}

const ISLAMABAD: (f64, f64) = (73.0479, 33.6844);
const LAHORE: (f64, f64) = (74.3587, 31.5204);

// --- GeoJSON -----------------------------------------------------------------

#[test]
fn geojson_with_mixed_geometry() {
    let layer = open_one(&fixture("mixed.geojson"));
    assert_eq!(layer.format, "GeoJSON");
    assert_eq!(layer.name, "mixed");
    assert_eq!(layer.table, None);
    assert_eq!(layer.feature_count, 4);
    assert_eq!(layer.empty_geometries, 1);
    assert_eq!(layer.geometry_type, "Mixed");
    assert_eq!(layer.crs, "EPSG:4326");
    assert!(!layer.reprojected);
    // Fields in first-seen order; the file's own string id is kept as a property.
    assert_eq!(
        layer.fields,
        ["name", "population", "capital", "id", "lanes"]
    );
    assert_eq!(property(&layer, 0, "id"), "isb");
    assert_eq!(
        serde_json::to_value(&layer.geojson.features[0].id).unwrap(),
        json!(0)
    );
    assert_near(point(&layer, 0), ISLAMABAD);
    assert_eq!(layer.bbox, Some([73.0479, 31.5204, 74.3587, 33.6844]));
}

#[test]
fn geojson_with_old_style_web_mercator_crs_is_reprojected() {
    let layer = open_one(&fixture("cities_3857.geojson"));
    assert_eq!(layer.crs, "EPSG:3857");
    assert!(layer.reprojected);
    // The file was written from these degrees (rounded to the millimetre).
    assert_near(point(&layer, 0), ISLAMABAD);
    assert_near(point(&layer, 1), LAHORE);
    assert!(layer.warnings.is_empty(), "{:?}", layer.warnings);
}

#[test]
fn invalid_geojson_gives_a_readable_error() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("broken.geojson");
    std::fs::write(&path, "{ not json").unwrap();
    let message = open_file(&path).unwrap_err().to_string();
    assert!(message.starts_with("could not read GeoJSON"), "{message}");
}

// --- CSV ---------------------------------------------------------------------

#[test]
fn csv_points_from_lat_lon_columns() {
    let layer = open_one(&fixture("cities.csv"));
    assert_eq!(layer.format, "CSV");
    assert_eq!(layer.fields, ["name", "population", "lat", "lon"]);
    assert_eq!(layer.feature_count, 4);
    assert_eq!(layer.geometry_type, "Point");
    assert_near(point(&layer, 0), ISLAMABAD);
    assert_eq!(property(&layer, 0, "population"), 1_014_825);
    // "Atlantis" has no coordinates: kept, without geometry, and reported.
    assert_eq!(layer.empty_geometries, 1);
    assert!(property(&layer, 3, "population").is_null());
    assert_eq!(layer.warnings, ["1 rows had no valid coordinates"]);
}

#[test]
fn csv_with_semicolons_and_decimal_commas() {
    let layer = open_one(&fixture("cities_semicolon.csv"));
    assert_eq!(layer.fields, ["City", "Latitude", "Longitude", "Note"]);
    assert_near(point(&layer, 0), ISLAMABAD);
    assert_near(point(&layer, 1), LAHORE);
    assert_eq!(property(&layer, 1, "Note"), "has; semicolon");
    assert!(layer.warnings.is_empty(), "{:?}", layer.warnings);
}

#[test]
fn csv_without_coordinate_columns_explains_why() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("table.csv");
    std::fs::write(&path, "name,size\na,1\n").unwrap();
    let message = open_file(&path).unwrap_err().to_string();
    assert!(
        message.contains("no longitude/latitude columns found"),
        "{message}"
    );
    assert!(message.contains("the columns are: name, size"), "{message}");
}

// --- KML / KMZ ---------------------------------------------------------------

fn check_places(layer: &Layer) {
    assert_eq!(layer.feature_count, 3, "placemarks at every folder depth");
    assert_eq!(layer.geometry_type, "Mixed");
    assert_eq!(property(layer, 0, "name"), "Islamabad");
    assert_eq!(property(layer, 0, "description"), "Capital of Pakistan");
    assert_eq!(property(layer, 0, "population"), "1014825"); // <Data>
    assert_eq!(property(layer, 1, "kind"), "reservoir"); // <SchemaData>
    assert_near(point(layer, 0), ISLAMABAD);
    assert!(matches!(
        layer.geojson.features[1].geometry.as_ref().unwrap().value,
        GeometryValue::Polygon { .. }
    ));
    assert!(matches!(
        layer.geojson.features[2].geometry.as_ref().unwrap().value,
        GeometryValue::LineString { .. }
    ));
}

#[test]
fn kml_placemarks_with_extended_data() {
    let layer = open_one(&fixture("places.kml"));
    assert_eq!(layer.format, "KML");
    check_places(&layer);
}

#[test]
fn kmz_is_unzipped() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("places.kmz");
    let mut zip = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    zip.start_file("doc.kml", options).unwrap();
    zip.write_all(&std::fs::read(fixture("places.kml")).unwrap())
        .unwrap();
    zip.finish().unwrap();

    let layer = open_one(&path);
    assert_eq!(layer.format, "KMZ");
    check_places(&layer);
}

// --- GPX ---------------------------------------------------------------------

#[test]
fn gpx_waypoints_routes_and_tracks() {
    let layer = open_one(&fixture("walk.gpx"));
    assert_eq!(layer.format, "GPX");
    assert_eq!(layer.feature_count, 4);
    let kinds: Vec<Value> = (0..4).map(|i| property(&layer, i, "kind")).collect();
    assert_eq!(kinds, ["waypoint", "waypoint", "track", "route"]);
    assert_eq!(property(&layer, 0, "name"), "Daman-e-Koh");
    assert_eq!(property(&layer, 0, "elevation"), 1200.0);
    assert_eq!(property(&layer, 0, "time"), "2026-10-13T06:00:00Z");
    assert_near(point(&layer, 0), (73.0863, 33.7380));
    match &layer.geojson.features[2].geometry.as_ref().unwrap().value {
        GeometryValue::MultiLineString { coordinates } => {
            assert_eq!(coordinates.len(), 2, "two segments")
        }
        other => panic!("track should be a MultiLineString, got {other:?}"),
    }
}

// --- GeoPackage --------------------------------------------------------------

/// A GeoPackage geometry blob: the "GP" header, then a little-endian WKB geometry.
/// `envelope` adds the optional [minx, maxx, miny, maxy] box to the header.
fn gpkg_blob(srs_id: i32, wkb: &[u8], envelope: Option<[f64; 4]>) -> Vec<u8> {
    let flags: u8 = 0b0000_0001 | if envelope.is_some() { 0b0000_0010 } else { 0 };
    let mut blob = vec![b'G', b'P', 0, flags];
    blob.extend(srs_id.to_le_bytes());
    for value in envelope.iter().flatten() {
        blob.extend(value.to_le_bytes());
    }
    blob.extend(wkb);
    blob
}

fn wkb_point(x: f64, y: f64) -> Vec<u8> {
    let mut wkb = vec![1];
    wkb.extend(1u32.to_le_bytes());
    wkb.extend(x.to_le_bytes());
    wkb.extend(y.to_le_bytes());
    wkb
}

fn wkb_line(points: &[(f64, f64)]) -> Vec<u8> {
    let mut wkb = vec![1];
    wkb.extend(2u32.to_le_bytes());
    wkb.extend((points.len() as u32).to_le_bytes());
    for (x, y) in points {
        wkb.extend(x.to_le_bytes());
        wkb.extend(y.to_le_bytes());
    }
    wkb
}

const UTM_43N_ESRI_WKT: &str = r#"PROJCS["WGS_1984_UTM_Zone_43N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",75.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]"#;

/// Builds a minimal GeoPackage with three feature tables:
/// `cities` (EPSG:4326 points), `survey` (EPSG:32643 points) and
/// `roads` (a line in a CRS given only as WKT, with a header envelope).
fn build_geopackage(path: &Path) {
    let db = rusqlite::Connection::open(path).unwrap();
    db.execute_batch(
        "CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT, srs_id INTEGER PRIMARY KEY,
             organization TEXT, organization_coordsys_id INTEGER, definition TEXT, description TEXT);
         CREATE TABLE gpkg_contents (table_name TEXT PRIMARY KEY, data_type TEXT, identifier TEXT,
             description TEXT, last_change TEXT, min_x REAL, min_y REAL, max_x REAL, max_y REAL, srs_id INTEGER);
         CREATE TABLE gpkg_geometry_columns (table_name TEXT, column_name TEXT, geometry_type_name TEXT,
             srs_id INTEGER, z INTEGER, m INTEGER);
         INSERT INTO gpkg_spatial_ref_sys VALUES ('WGS 84', 4326, 'EPSG', 4326, '', '');
         INSERT INTO gpkg_spatial_ref_sys VALUES ('UTM 43N', 32643, 'EPSG', 32643, '', '');
         CREATE TABLE cities (fid INTEGER PRIMARY KEY, geom BLOB, name TEXT, pop INTEGER, area REAL);
         CREATE TABLE survey (fid INTEGER PRIMARY KEY, geom BLOB, label TEXT);
         CREATE TABLE roads (fid INTEGER PRIMARY KEY, shape BLOB, name TEXT);
         INSERT INTO gpkg_contents (table_name, data_type, srs_id) VALUES ('cities', 'features', 4326);
         INSERT INTO gpkg_contents (table_name, data_type, srs_id) VALUES ('survey', 'features', 32643);
         INSERT INTO gpkg_contents (table_name, data_type, srs_id) VALUES ('roads', 'features', 100000);
         INSERT INTO gpkg_contents (table_name, data_type, srs_id) VALUES ('notes', 'attributes', 0);
         INSERT INTO gpkg_geometry_columns VALUES ('cities', 'geom', 'POINT', 4326, 0, 0);
         INSERT INTO gpkg_geometry_columns VALUES ('survey', 'geom', 'POINT', 32643, 0, 0);
         INSERT INTO gpkg_geometry_columns VALUES ('roads', 'shape', 'LINESTRING', 100000, 0, 0);",
    )
    .unwrap();
    db.execute(
        "INSERT INTO gpkg_spatial_ref_sys VALUES ('custom', 100000, 'NONE', 1, ?1, '')",
        [UTM_43N_ESRI_WKT],
    )
    .unwrap();

    let insert_city = "INSERT INTO cities (geom, name, pop, area) VALUES (?1, ?2, ?3, ?4)";
    let (x, y) = ISLAMABAD;
    db.execute(
        insert_city,
        rusqlite::params![
            gpkg_blob(4326, &wkb_point(x, y), None),
            "Islamabad",
            1_014_825,
            906.5
        ],
    )
    .unwrap();
    db.execute(
        insert_city,
        rusqlite::params![None::<Vec<u8>>, "Unplaced", None::<i64>, None::<f64>],
    )
    .unwrap();
    db.execute(
        "INSERT INTO survey (geom, label) VALUES (?1, 'origin')",
        [gpkg_blob(32643, &wkb_point(500_000.0, 0.0), None)],
    )
    .unwrap();
    let line = [(500_000.0, 0.0), (500_000.0, 1_000.0)];
    db.execute(
        "INSERT INTO roads (shape, name) VALUES (?1, 'north')",
        [gpkg_blob(
            100000,
            &wkb_line(&line),
            Some([500_000.0, 500_000.0, 0.0, 1_000.0]),
        )],
    )
    .unwrap();
}

#[test]
fn geopackage_feature_tables_become_layers() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("test.gpkg");
    build_geopackage(&path);

    let layers = open_file(&path).unwrap();
    let names: Vec<&str> = layers.iter().map(|l| l.name.as_str()).collect();
    // Sorted by table; the non-spatial `notes` table is skipped.
    assert_eq!(names, ["test: cities", "test: roads", "test: survey"]);
    // Projects use the table name to reopen the same layer.
    let tables: Vec<Option<&str>> = layers.iter().map(|l| l.table.as_deref()).collect();
    assert_eq!(tables, [Some("cities"), Some("roads"), Some("survey")]);

    let cities = &layers[0];
    assert_eq!(cities.format, "GeoPackage");
    assert_eq!(cities.fields, ["fid", "name", "pop", "area"]);
    assert_eq!(cities.crs, "EPSG:4326");
    assert_near(point(cities, 0), ISLAMABAD);
    assert_eq!(property(cities, 0, "pop"), 1_014_825);
    assert_eq!(property(cities, 0, "area"), 906.5);
    assert_eq!(cities.empty_geometries, 1);
    assert!(property(cities, 1, "pop").is_null());

    // A WKT-only CRS, and a geometry blob with an envelope in its header.
    let roads = &layers[1];
    assert_eq!(roads.crs, "EPSG:32643 (WGS_1984_UTM_Zone_43N)");
    let [min_x, min_y, max_x, max_y] = roads.bbox.unwrap();
    assert_near((min_x, min_y), (75.0, 0.0));
    // 1 km north of the equator is about 0.00904°.
    assert!(
        (max_x - 75.0).abs() < 1e-9 && (max_y - 0.009_04).abs() < 1e-4,
        "{max_y}"
    );

    let survey = &layers[2];
    assert_eq!(survey.crs, "EPSG:32643");
    assert!(survey.reprojected);
    assert_near(point(survey, 0), (75.0, 0.0));
}

#[test]
fn a_geopackage_with_one_table_is_named_after_the_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("only.gpkg");
    build_geopackage(&path);
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute_batch("DELETE FROM gpkg_contents WHERE table_name IN ('roads', 'survey')")
        .unwrap();
    drop(db);
    assert_eq!(open_one(&path).name, "only");
}

#[test]
fn a_plain_sqlite_file_is_not_a_geopackage() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("plain.gpkg");
    rusqlite::Connection::open(&path)
        .unwrap()
        .execute_batch("CREATE TABLE t (a INTEGER)")
        .unwrap();
    let message = open_file(&path).unwrap_err().to_string();
    assert!(message.contains("not a GeoPackage?"), "{message}");
}

// --- FlatGeobuf --------------------------------------------------------------

/// Converts a GeoJSON fixture to FlatGeobuf with `flatgeobuf`'s own writer.
fn write_flatgeobuf(geojson_fixture: &str, path: &Path, epsg: i32) {
    use flatgeobuf::{FgbCrs, FgbWriter, FgbWriterOptions, GeometryType};
    use geozero::GeozeroDatasource;

    let options = FgbWriterOptions {
        crs: FgbCrs {
            code: epsg,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut writer =
        FgbWriter::create_with_options("test", GeometryType::Unknown, options).unwrap();
    let text = std::fs::read_to_string(fixture(geojson_fixture)).unwrap();
    geozero::geojson::GeoJsonReader(text.as_bytes())
        .process(&mut writer)
        .unwrap();
    writer.write(std::fs::File::create(path).unwrap()).unwrap();
}

#[test]
fn flatgeobuf_with_epsg_code() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("cities.fgb");
    write_flatgeobuf("cities_3857.geojson", &path, 3857);

    let layer = open_one(&path);
    assert_eq!(layer.format, "FlatGeobuf");
    assert_eq!(layer.feature_count, 3);
    assert_eq!(layer.fields, ["name"]);
    assert_eq!(layer.crs, "EPSG:3857");
    // FlatGeobuf stores features in spatial-index order, so find them by name.
    let index = |name: &str| {
        (0..layer.feature_count)
            .find(|&i| property(&layer, i, "name") == name)
            .unwrap()
    };
    assert_near(point(&layer, index("Islamabad")), ISLAMABAD);
    assert_near(point(&layer, index("Lahore")), LAHORE);
}

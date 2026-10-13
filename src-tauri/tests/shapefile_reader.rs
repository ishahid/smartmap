//! Integration tests for the Shapefile reader.
//!
//! Two kinds of fixture:
//! - the five sample files that shipped with SmartMap 1 in 2004 (`legacy/source/data/`).
//!   They have only a `.shp` (no `.dbf`/`.prj`). Their true record counts are known,
//!   and the 2004 parser lost 1–4 records from each (docs/KNOWN_ISSUES.md #1).
//! - a small shapefile with attributes and a `.prj`, written fresh into a temp folder.

use std::path::{Path, PathBuf};

use geojson::GeometryValue;
use shapefile::dbase::{self, FieldValue};
use smartmap_lib::io::{Layer, open_file};

/// Opens a file that should contain exactly one layer.
fn open_layer(path: &Path) -> Result<Layer, String> {
    let mut layers = open_file(path).map_err(|e| e.to_string())?;
    assert_eq!(layers.len(), 1, "one layer per shapefile");
    Ok(layers.remove(0))
}

/// Path to one of the 2004 sample files.
fn legacy_sample(file_name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../legacy/source/data")
        .join(file_name)
}

#[test]
fn reads_every_record_of_the_2004_samples() {
    // (file, record count, geometry type, records the 2004 parser actually read)
    let samples = [
        ("world.shp", 251, "Polygon", 250),
        ("Country Boundaries 2.shp", 15, "Polygon", 14),
        ("Water Bodies 2.shp", 22, "Polygon", 20),
        ("Streets and Railroads 1.shp", 189, "Line", 185),
        ("meanmotp.shp", 248, "Point", 247),
    ];

    for (file, expected, geometry_type, read_in_2004) in samples {
        let layer = open_layer(&legacy_sample(file)).unwrap_or_else(|e| panic!("{file}: {e}"));
        assert_eq!(layer.feature_count, expected, "{file}: feature count");
        assert_eq!(layer.geojson.features.len(), expected, "{file}: features");
        assert_eq!(layer.empty_geometries, 0, "{file}: empty geometries");
        assert_eq!(layer.geometry_type, geometry_type, "{file}: geometry type");
        assert!(
            expected > read_in_2004,
            "{file}: we now read more than SmartMap 1 did"
        );
        // No .dbf or .prj next to these files, so no attributes and an assumed CRS.
        assert!(layer.fields.is_empty(), "{file}: fields");
        assert_eq!(layer.crs, "unknown (assumed WGS 84)", "{file}: crs");
        assert!(!layer.reprojected, "{file}: reprojected");
        assert!(layer.warnings.is_empty(), "{file}: {:?}", layer.warnings);
    }
}

#[test]
fn world_layer_has_sensible_metadata() {
    let layer = open_layer(&legacy_sample("world.shp")).unwrap();
    assert_eq!(layer.name, "world");

    let [min_x, min_y, max_x, max_y] = layer.bbox.expect("world.shp has a bounding box");
    assert!((min_x - -180.0).abs() < 1e-6 && (max_x - 180.0).abs() < 1e-6);
    assert!((min_y - -90.0).abs() < 1e-6 && max_y > 83.0 && max_y < 84.0);

    // Feature ids are the 0-based record numbers.
    // Compare as JSON, which is exactly what the UI receives.
    let ids: Vec<serde_json::Value> = layer.geojson.features[..3]
        .iter()
        .map(|f| serde_json::to_value(&f.id).unwrap())
        .collect();
    assert_eq!(ids, [0, 1, 2]);
}

#[test]
fn the_first_record_dropped_in_2004_is_a_real_polygon() {
    // SmartMap 1 skipped world.shp's first record. Make sure we read it properly.
    let layer = open_layer(&legacy_sample("world.shp")).unwrap();
    let first = layer.geojson.features[0]
        .geometry
        .as_ref()
        .expect("has geometry");
    match &first.value {
        GeometryValue::MultiPolygon { coordinates } => {
            assert!(!coordinates.is_empty());
            let ring = &coordinates[0][0];
            assert!(ring.len() >= 4, "a closed ring has at least 4 points");
            assert_eq!(ring.first(), ring.last(), "rings are closed");
        }
        other => panic!("expected MultiPolygon, got {other:?}"),
    }
}

#[test]
fn polyline_and_point_layers_convert_to_the_right_geojson_types() {
    let roads = open_layer(&legacy_sample("Streets and Railroads 1.shp")).unwrap();
    assert!(matches!(
        roads.geojson.features[0].geometry.as_ref().unwrap().value,
        GeometryValue::MultiLineString { .. }
    ));

    let points = open_layer(&legacy_sample("meanmotp.shp")).unwrap();
    assert!(matches!(
        points.geojson.features[0].geometry.as_ref().unwrap().value,
        GeometryValue::Point { .. }
    ));
}

#[test]
fn reads_attributes_and_projection_files() {
    let dir = tempfile::tempdir().unwrap();
    let shp = dir.path().join("cities.shp");

    // Write a two-point shapefile with a name and a population column.
    let table = dbase::TableWriterBuilder::new()
        .add_character_field("NAME".try_into().unwrap(), 30)
        .add_numeric_field("POP".try_into().unwrap(), 10, 0);
    let mut writer = shapefile::Writer::from_path(&shp, table).unwrap();
    for (name, pop, x, y) in [
        ("Rawalpindi", Some(2_100_000.0), 73.05, 33.6),
        ("Nowhere", None, 0.0, 0.0),
    ] {
        let mut record = dbase::Record::default();
        record.insert(
            "NAME".to_string(),
            FieldValue::Character(Some(name.to_string())),
        );
        record.insert("POP".to_string(), FieldValue::Numeric(pop));
        writer
            .write_shape_and_record(&shapefile::Point::new(x, y), &record)
            .unwrap();
    }
    drop(writer); // flushes and closes the files
    std::fs::write(
        dir.path().join("cities.prj"),
        "GEOGCS[\"GCS_WGS_1984\",DATUM[\"D_WGS_1984\",SPHEROID[\"WGS_1984\",6378137.0,298.257223563]]]\n",
    )
    .unwrap();

    let layer = open_layer(&shp).unwrap();
    assert_eq!(layer.feature_count, 2);
    assert_eq!(layer.fields, ["NAME", "POP"]);
    assert_eq!(layer.crs, "GCS_WGS_1984");
    assert!(!layer.reprojected);

    let first = layer.geojson.features[0].properties.as_ref().unwrap();
    assert_eq!(first["NAME"], "Rawalpindi");
    assert_eq!(first["POP"], 2_100_000.0);
    // A blank number becomes null, not 0.
    let second = layer.geojson.features[1].properties.as_ref().unwrap();
    assert!(second["POP"].is_null());
}

#[test]
fn finds_upper_case_companion_files() {
    let dir = tempfile::tempdir().unwrap();
    let shp = dir.path().join("ROADS.shp");
    let table = dbase::TableWriterBuilder::new().add_character_field("ID".try_into().unwrap(), 5);
    let mut writer = shapefile::Writer::from_path(&shp, table).unwrap();
    let mut record = dbase::Record::default();
    record.insert(
        "ID".to_string(),
        FieldValue::Character(Some("A1".to_string())),
    );
    writer
        .write_shape_and_record(&shapefile::Point::new(1.0, 2.0), &record)
        .unwrap();
    drop(writer);
    // Rename the .dbf the writer created to an old-DOS-style upper-case name.
    std::fs::rename(dir.path().join("ROADS.dbf"), dir.path().join("ROADS.DBF")).unwrap();

    let layer = open_layer(&shp).unwrap();
    assert_eq!(layer.fields, ["ID"]);
}

/// A shapefile in UTM zone 43N metres, with the kind of `.prj` ArcGIS writes,
/// comes out in longitude/latitude.
#[test]
fn reprojects_using_the_prj_file() {
    let dir = tempfile::tempdir().unwrap();
    let shp = dir.path().join("utm.shp");
    let table = dbase::TableWriterBuilder::new().add_character_field("ID".try_into().unwrap(), 5);
    let mut writer = shapefile::Writer::from_path(&shp, table).unwrap();
    // On the zone's central meridian (75°E) at the equator: exactly (500000, 0).
    let mut record = dbase::Record::default();
    record.insert(
        "ID".to_string(),
        FieldValue::Character(Some("A".to_string())),
    );
    writer
        .write_shape_and_record(&shapefile::Point::new(500_000.0, 0.0), &record)
        .unwrap();
    drop(writer);
    std::fs::write(
        dir.path().join("utm.prj"),
        r#"PROJCS["WGS_1984_UTM_Zone_43N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",75.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]"#,
    )
    .unwrap();

    let layer = open_layer(&shp).unwrap();
    assert!(layer.reprojected);
    assert_eq!(layer.crs, "EPSG:32643 (WGS_1984_UTM_Zone_43N)");
    let [lon, lat, ..] = layer.bbox.unwrap();
    assert!(
        (lon - 75.0).abs() < 1e-9 && lat.abs() < 1e-9,
        "{lon}, {lat}"
    );
    assert!(layer.warnings.is_empty(), "{:?}", layer.warnings);
}

#[test]
fn missing_file_gives_a_readable_error() {
    let err = open_layer(Path::new("/definitely/not/here.shp")).unwrap_err();
    let message = err.to_string();
    assert!(
        message.starts_with("could not read shapefile /definitely/not/here.shp"),
        "{message}"
    );
}

//! Exporting layers and reading them back with SmartMap's own readers.

use std::fs;

use geojson::{FeatureCollection, GeometryValue};
use serde_json::json;
use smartmap_lib::export::export;
use smartmap_lib::io::open_file;

/// Annotations as the UI sends them: mixed geometry, style overrides, a
/// feature with no geometry, and awkward property names.
fn sample() -> FeatureCollection {
    serde_json::from_value(json!({
        "type": "FeatureCollection",
        "features": [
            { "type": "Feature", "id": "a",
              "geometry": { "type": "Point", "coordinates": [73.05, 33.6] },
              "properties": { "kind": "text", "name": "Home", "text": "Home", "size": 14, "fid": 9 } },
            { "type": "Feature", "id": "b",
              "geometry": { "type": "LineString", "coordinates": [[73.0, 33.5], [73.2, 33.7]] },
              "properties": { "kind": "line", "name": "Route", "width": 2.5, "visited": true } },
            { "type": "Feature", "id": "c",
              "geometry": { "type": "Polygon", "coordinates": [[[73, 33], [74, 33], [74, 34], [73, 33]]] },
              "properties": { "kind": "polygon", "name": "Area \"one\"", "tags": ["a", "b"] } },
            { "type": "Feature", "id": "d",
              "geometry": { "type": "MultiPolygon", "coordinates": [[[[70, 30], [71, 30], [71, 31], [70, 30]]]] },
              "properties": { "kind": "polygon", "name": null } },
            { "type": "Feature", "id": "e", "geometry": null, "properties": { "name": "no shape" } },
        ],
    }))
    .unwrap()
}

#[test]
fn geopackage_round_trip() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("notes.gpkg");
    assert_eq!(export(&path, "My notes", &sample()).unwrap(), 5);

    let layers = open_file(&path).unwrap();
    assert_eq!(layers.len(), 1);
    let layer = &layers[0];
    assert_eq!(layer.format, "GeoPackage");
    assert_eq!(layer.table.as_deref(), Some("My notes"));
    assert_eq!(layer.crs, "EPSG:4326");
    assert!(layer.warnings.is_empty(), "{:?}", layer.warnings);
    assert_eq!(layer.feature_count, 5);
    assert_eq!(layer.empty_geometries, 1);
    // `fid` is the table's own key; the property of that name is renamed.
    assert_eq!(
        layer.fields,
        [
            "fid", "kind", "name", "text", "size", "fid_1", "width", "visited", "tags"
        ]
    );

    let features = &layer.geojson.features;
    let props = |i: usize| features[i].properties.as_ref().unwrap();
    assert_eq!(props(0)["text"], "Home");
    assert_eq!(props(0)["size"], 14);
    assert_eq!(props(0)["fid_1"], 9);
    assert_eq!(props(1)["width"], 2.5);
    assert_eq!(props(1)["visited"], 1); // GeoPackage has no true/false type
    assert_eq!(props(2)["name"], "Area \"one\"");
    assert_eq!(props(2)["tags"], r#"["a","b"]"#);
    assert!(props(3)["name"].is_null());

    let geometry = |i: usize| features[i].geometry.as_ref().map(|g| g.value.clone());
    assert_eq!(geometry(0), Some(GeometryValue::new_point([73.05, 33.6])));
    assert_eq!(
        geometry(1),
        Some(GeometryValue::new_line_string([[73.0, 33.5], [73.2, 33.7]]))
    );
    assert!(matches!(
        geometry(3),
        Some(GeometryValue::MultiPolygon { .. })
    ));
    assert_eq!(geometry(4), None);
    assert_eq!(layer.bbox, Some([70.0, 30.0, 74.0, 34.0]));
}

#[test]
fn geojson_round_trip_and_overwrite() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("notes.geojson");
    fs::write(&path, "old contents").unwrap();
    export(&path, "notes", &sample()).unwrap();

    let layer = &open_file(&path).unwrap()[0];
    assert_eq!(layer.feature_count, 5);
    assert_eq!(
        layer.geojson.features[1].properties.as_ref().unwrap()["visited"],
        true
    );
    assert!(!dir.path().join("notes.geojson.saving").exists());
}

#[test]
fn exporting_twice_replaces_the_geopackage() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("notes.gpkg");
    export(&path, "first", &sample()).unwrap();
    export(&path, "second", &sample()).unwrap();
    let layers = open_file(&path).unwrap();
    assert_eq!(layers.len(), 1);
    assert_eq!(layers[0].table.as_deref(), Some("second"));
}

#[test]
fn unknown_extensions_are_refused() {
    let dir = tempfile::tempdir().unwrap();
    let error = export(&dir.path().join("notes.kml"), "n", &sample()).unwrap_err();
    assert!(error.to_string().contains(".kml"), "{error}");
}

//! Exporting a layer (data or annotations) to a file other GIS tools can open.
//!
//! The UI sends the layer as a GeoJSON FeatureCollection in WGS84, the same
//! form it receives layers in. The file extension picks the format:
//! - `.geojson` / `.json`: written as is.
//! - `.gpkg`: a GeoPackage (an SQLite database) with one feature table. The
//!   attribute columns are worked out from the features' properties.
//!
//! Both are written to a temporary file first and then renamed into place, so
//! a failed export never leaves half a file behind.

use std::fs;
use std::path::{Path, PathBuf};

use geojson::{Feature, FeatureCollection, GeometryValue};
use geozero::{CoordDimensions, ToWkb};
use rusqlite::{Connection, types::Value as SqlValue};
use serde_json::Value;

/// Everything that can go wrong while exporting.
#[derive(Debug, thiserror::Error)]
pub enum ExportError {
    #[error("can't export to {0} files; choose .geojson or .gpkg")]
    UnsupportedFormat(String),

    #[error("could not write {path}: {message}")]
    Write { path: String, message: String },
}

/// Writes `layer` to `path` in the format its extension names, as a table or
/// file called `name`. Returns how many features were written.
pub fn export(path: &Path, name: &str, layer: &FeatureCollection) -> Result<usize, ExportError> {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let failed = |message: String| ExportError::Write {
        path: path.display().to_string(),
        message,
    };
    match extension.as_str() {
        "geojson" | "json" => {
            let text = serde_json::to_string(layer).map_err(|e| failed(e.to_string()))?;
            write_via_temp(path, |temp| {
                fs::write(temp, &text).map_err(|e| e.to_string())
            })
            .map_err(failed)?;
        }
        "gpkg" => {
            write_via_temp(path, |temp| write_geopackage(temp, name, layer)).map_err(failed)?;
        }
        "" => return Err(ExportError::UnsupportedFormat("extension-less".into())),
        other => return Err(ExportError::UnsupportedFormat(format!(".{other}"))),
    }
    Ok(layer.features.len())
}

/// Runs `write` on a temporary path next to `path`, then moves the result into place.
fn write_via_temp(
    path: &Path,
    write: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<(), String> {
    let mut temp_name = path.file_name().unwrap_or_default().to_os_string();
    temp_name.push(".saving");
    let temp: PathBuf = path.with_file_name(temp_name);
    let _ = fs::remove_file(&temp); // left over from an earlier crash
    let result = write(&temp).and_then(|()| fs::rename(&temp, path).map_err(|e| e.to_string()));
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

// --- GeoPackage ----------------------------------------------------------------

/// The tables every GeoPackage needs, from the OGC GeoPackage 1.3 standard,
/// plus the three coordinate systems it requires (WGS84 is the one we use).
const GEOPACKAGE_SCHEMA: &str = r#"
PRAGMA application_id = 1196444487; -- the letters "GPKG"
PRAGMA user_version = 10300;        -- version 1.3.0
CREATE TABLE gpkg_spatial_ref_sys (
    srs_name TEXT NOT NULL, srs_id INTEGER PRIMARY KEY, organization TEXT NOT NULL,
    organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT);
INSERT INTO gpkg_spatial_ref_sys VALUES
    ('Undefined cartesian SRS', -1, 'NONE', -1, 'undefined', 'undefined cartesian coordinate reference system'),
    ('Undefined geographic SRS', 0, 'NONE', 0, 'undefined', 'undefined geographic coordinate reference system'),
    ('WGS 84 geodetic', 4326, 'EPSG', 4326,
     'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]]',
     'longitude/latitude coordinates in decimal degrees on the WGS 84 spheroid');
CREATE TABLE gpkg_contents (
    table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE,
    description TEXT DEFAULT '', last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER,
    FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id));
CREATE TABLE gpkg_geometry_columns (
    table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL,
    srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL,
    PRIMARY KEY (table_name, column_name), UNIQUE (table_name),
    FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
    FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id));
"#;

const WGS84: i32 = 4326;

/// What kind of values a column holds, which decides its SQL type.
#[derive(Debug, Clone, Copy, PartialEq)]
enum ColumnKind {
    Integer,
    Real,
    Text,
}

/// One attribute column: the property it comes from and its (unique) column name.
#[derive(Debug)]
struct Column {
    property: String,
    name: String,
    kind: ColumnKind,
}

fn write_geopackage(path: &Path, name: &str, layer: &FeatureCollection) -> Result<(), String> {
    let mut db = Connection::open(path).map_err(|e| e.to_string())?;
    db.execute_batch(GEOPACKAGE_SCHEMA)
        .map_err(|e| e.to_string())?;

    let table = if name.trim().is_empty() {
        "layer"
    } else {
        name.trim()
    };
    let columns = columns_for(&layer.features);
    let definitions: String = columns
        .iter()
        .map(|c| {
            let sql_type = match c.kind {
                ColumnKind::Integer => "INTEGER",
                ColumnKind::Real => "REAL",
                ColumnKind::Text => "TEXT",
            };
            format!(", {} {sql_type}", quote(&c.name))
        })
        .collect();
    let bbox = layer_bbox(&layer.features);

    let tx = db.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        &format!(
            "CREATE TABLE {} (fid INTEGER PRIMARY KEY AUTOINCREMENT, geom GEOMETRY{definitions})",
            quote(table)
        ),
        [],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO gpkg_contents (table_name, data_type, identifier, min_x, min_y, max_x, max_y, srs_id)
         VALUES (?1, 'features', ?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![table, bbox.map(|b| b[0]), bbox.map(|b| b[1]), bbox.map(|b| b[2]), bbox.map(|b| b[3]), WGS84],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO gpkg_geometry_columns VALUES (?1, 'geom', ?2, ?3, 0, 0)",
        rusqlite::params![table, geometry_type_name(&layer.features), WGS84],
    )
    .map_err(|e| e.to_string())?;

    {
        let placeholders = "?, ".repeat(columns.len() + 1);
        let column_list: String = columns
            .iter()
            .map(|c| format!(", {}", quote(&c.name)))
            .collect();
        let mut insert = tx
            .prepare(&format!(
                "INSERT INTO {} (geom{column_list}) VALUES ({})",
                quote(table),
                placeholders.trim_end_matches(", ")
            ))
            .map_err(|e| e.to_string())?;
        for (index, feature) in layer.features.iter().enumerate() {
            let geometry = match &feature.geometry {
                Some(g) => SqlValue::Blob(
                    geometry_blob(&g.value).map_err(|e| format!("feature {index}: {e}"))?,
                ),
                None => SqlValue::Null,
            };
            let mut values = vec![geometry];
            for column in &columns {
                let value = feature
                    .properties
                    .as_ref()
                    .and_then(|p| p.get(&column.property));
                values.push(sql_value(value, column.kind));
            }
            insert
                .execute(rusqlite::params_from_iter(values))
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())
}

/// Quotes a table or column name for SQL: `my "x"` → `"my ""x"""`.
fn quote(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// The attribute columns: every property name in first-seen order, typed by
/// its values, renamed where it would clash (SQLite ignores case in names,
/// and `fid` and `geom` are taken).
fn columns_for(features: &[Feature]) -> Vec<Column> {
    let mut columns: Vec<Column> = Vec::new();
    for properties in features.iter().filter_map(|f| f.properties.as_ref()) {
        for key in properties.keys() {
            if columns.iter().any(|c| &c.property == key) {
                continue;
            }
            let mut name = key.clone();
            let mut suffix = 1;
            let taken = |n: &str, columns: &[Column]| {
                ["fid", "geom"].iter().any(|t| t.eq_ignore_ascii_case(n))
                    || columns.iter().any(|c| c.name.eq_ignore_ascii_case(n))
            };
            while taken(&name, &columns) {
                name = format!("{key}_{suffix}");
                suffix += 1;
            }
            columns.push(Column {
                property: key.clone(),
                name,
                kind: column_kind(features, key),
            });
        }
    }
    columns
}

/// INTEGER if every value is a whole number or true/false, REAL if every value
/// is a number, TEXT otherwise. Blank values don't count either way.
fn column_kind(features: &[Feature], key: &str) -> ColumnKind {
    let mut kind = None;
    for value in features
        .iter()
        .filter_map(|f| f.properties.as_ref()?.get(key))
    {
        let this = match value {
            Value::Null => continue,
            Value::Bool(_) => ColumnKind::Integer,
            Value::Number(n) if n.is_i64() || n.is_u64() => ColumnKind::Integer,
            Value::Number(_) => ColumnKind::Real,
            _ => return ColumnKind::Text,
        };
        kind = Some(match (kind, this) {
            (None, k) => k,
            (Some(ColumnKind::Integer), ColumnKind::Integer) => ColumnKind::Integer,
            _ => ColumnKind::Real,
        });
    }
    kind.unwrap_or(ColumnKind::Text)
}

/// A property value as SQL, matching its column's type.
fn sql_value(value: Option<&Value>, kind: ColumnKind) -> SqlValue {
    match value {
        None | Some(Value::Null) => SqlValue::Null,
        Some(Value::Bool(b)) => SqlValue::Integer(i64::from(*b)),
        Some(Value::Number(n)) => match kind {
            ColumnKind::Integer => n
                .as_i64()
                .map_or(SqlValue::Real(n.as_f64().unwrap_or(0.0)), SqlValue::Integer),
            ColumnKind::Real => SqlValue::Real(n.as_f64().unwrap_or(0.0)),
            ColumnKind::Text => SqlValue::Text(n.to_string()),
        },
        Some(Value::String(s)) => SqlValue::Text(s.clone()),
        // Lists and objects are kept as JSON text.
        Some(other) => SqlValue::Text(other.to_string()),
    }
}

/// The GeoPackage geometry type: the one all features share, or GEOMETRY for a mix.
fn geometry_type_name(features: &[Feature]) -> &'static str {
    let mut found: Option<&'static str> = None;
    for geometry in features.iter().filter_map(|f| f.geometry.as_ref()) {
        let name = match geometry.value {
            GeometryValue::Point { .. } => "POINT",
            GeometryValue::MultiPoint { .. } => "MULTIPOINT",
            GeometryValue::LineString { .. } => "LINESTRING",
            GeometryValue::MultiLineString { .. } => "MULTILINESTRING",
            GeometryValue::Polygon { .. } => "POLYGON",
            GeometryValue::MultiPolygon { .. } => "MULTIPOLYGON",
            GeometryValue::GeometryCollection { .. } => "GEOMETRYCOLLECTION",
        };
        match found {
            None => found = Some(name),
            Some(other) if other != name => return "GEOMETRY",
            _ => {}
        }
    }
    found.unwrap_or("GEOMETRY")
}

/// A GeoPackage geometry: a short header ("GP", version, flags, coordinate
/// system and bounding box) followed by the geometry as standard WKB.
fn geometry_blob(value: &GeometryValue) -> Result<Vec<u8>, String> {
    let geometry: geo_types::Geometry<f64> = value.try_into().map_err(|e| format!("{e}"))?;
    let wkb = geometry
        .to_wkb(CoordDimensions::xy())
        .map_err(|e| e.to_string())?;

    let mut blob = Vec::with_capacity(8 + 32 + wkb.len());
    blob.extend_from_slice(b"GP");
    blob.push(0); // version 1
    match envelope(value) {
        Some([min_x, min_y, max_x, max_y]) => {
            // Flags: bit 0 = little-endian numbers, bits 1–3 = 1 (an x/y bounding box follows).
            blob.push(0b0000_0011);
            blob.extend_from_slice(&WGS84.to_le_bytes());
            for n in [min_x, max_x, min_y, max_y] {
                blob.extend_from_slice(&n.to_le_bytes());
            }
        }
        None => {
            // An empty geometry: no bounding box, and bit 4 marks it as empty.
            blob.push(0b0001_0001);
            blob.extend_from_slice(&WGS84.to_le_bytes());
        }
    }
    blob.extend_from_slice(&wkb);
    Ok(blob)
}

/// The bounding box [min_x, min_y, max_x, max_y] of a geometry, or None if it has no coordinates.
fn envelope(value: &GeometryValue) -> Option<[f64; 4]> {
    let mut b = [
        f64::INFINITY,
        f64::INFINITY,
        f64::NEG_INFINITY,
        f64::NEG_INFINITY,
    ];
    let mut add = |p: &[f64]| {
        b = [
            b[0].min(p[0]),
            b[1].min(p[1]),
            b[2].max(p[0]),
            b[3].max(p[1]),
        ];
    };
    match value {
        GeometryValue::Point { coordinates } => add(coordinates.as_slice()),
        GeometryValue::MultiPoint { coordinates } | GeometryValue::LineString { coordinates } => {
            coordinates.iter().for_each(|p| add(p.as_slice()))
        }
        GeometryValue::MultiLineString { coordinates } | GeometryValue::Polygon { coordinates } => {
            coordinates.iter().flatten().for_each(|p| add(p.as_slice()))
        }
        GeometryValue::MultiPolygon { coordinates } => coordinates
            .iter()
            .flatten()
            .flatten()
            .for_each(|p| add(p.as_slice())),
        GeometryValue::GeometryCollection { geometries } => {
            for g in geometries.iter().filter_map(|g| envelope(&g.value)) {
                add(&[g[0], g[1]]);
                add(&[g[2], g[3]]);
            }
        }
    }
    (b[0] <= b[2]).then_some(b)
}

/// The bounding box of all features, for gpkg_contents.
fn layer_bbox(features: &[Feature]) -> Option<[f64; 4]> {
    features
        .iter()
        .filter_map(|f| envelope(&f.geometry.as_ref()?.value))
        .reduce(|a, b| {
            [
                a[0].min(b[0]),
                a[1].min(b[1]),
                a[2].max(b[2]),
                a[3].max(b[3]),
            ]
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn features(values: serde_json::Value) -> Vec<Feature> {
        serde_json::from_value::<FeatureCollection>(
            json!({ "type": "FeatureCollection", "features": values }),
        )
        .unwrap()
        .features
    }

    #[test]
    fn columns_get_types_and_unique_names() {
        let fs = features(json!([
            { "type": "Feature", "geometry": null, "properties": { "n": 1, "x": 1, "t": "a", "b": true, "fid": 7, "Name": "A" } },
            { "type": "Feature", "geometry": null, "properties": { "n": 2, "x": 1.5, "t": 3, "b": null, "name": "b" } },
        ]));
        let columns = columns_for(&fs);
        let summary: Vec<(&str, &str, ColumnKind)> = columns
            .iter()
            .map(|c| (c.property.as_str(), c.name.as_str(), c.kind))
            .collect();
        assert_eq!(
            summary,
            [
                ("n", "n", ColumnKind::Integer),
                ("x", "x", ColumnKind::Real),
                ("t", "t", ColumnKind::Text),
                ("b", "b", ColumnKind::Integer),
                ("fid", "fid_1", ColumnKind::Integer),
                ("Name", "Name", ColumnKind::Text),
                ("name", "name_1", ColumnKind::Text),
            ]
        );
    }

    #[test]
    fn geometry_type_is_shared_type_or_geometry() {
        let points = features(json!([
            { "type": "Feature", "geometry": { "type": "Point", "coordinates": [1, 2] }, "properties": {} },
            { "type": "Feature", "geometry": null, "properties": {} },
        ]));
        assert_eq!(geometry_type_name(&points), "POINT");
        let mixed = features(json!([
            { "type": "Feature", "geometry": { "type": "Point", "coordinates": [1, 2] }, "properties": {} },
            { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[1, 2], [3, 4]] }, "properties": {} },
        ]));
        assert_eq!(geometry_type_name(&mixed), "GEOMETRY");
        assert_eq!(layer_bbox(&mixed), Some([1.0, 2.0, 3.0, 4.0]));
    }

    #[test]
    fn blob_has_header_envelope_and_wkb() {
        let value = GeometryValue::new_line_string([[1.0, 2.0], [3.0, -4.0]]);
        let blob = geometry_blob(&value).unwrap();
        assert_eq!(&blob[..4], b"GP\0\x03");
        assert_eq!(i32::from_le_bytes(blob[4..8].try_into().unwrap()), 4326);
        let read = |i: usize| f64::from_le_bytes(blob[8 + i * 8..16 + i * 8].try_into().unwrap());
        assert_eq!([read(0), read(1), read(2), read(3)], [1.0, 3.0, -4.0, 2.0]);
        assert_eq!(
            blob[40], 1,
            "WKB starts with its byte-order mark (little-endian)"
        );
    }
}

//! ESRI Shapefile reader.
//!
//! A "shapefile" is really a set of files with the same base name:
//!
//! | File   | Contents                                   | Required?            |
//! |--------|--------------------------------------------|----------------------|
//! | `.shp` | the geometries                             | yes                  |
//! | `.shx` | an index into the `.shp`                   | no (we don't need it)|
//! | `.dbf` | the attribute table (dBase format)         | no                   |
//! | `.prj` | the coordinate system, as WKT text         | no                   |
//!
//! The 2004 SmartMap parsed `.shp` by hand and got the header size wrong,
//! silently losing the first few records (see docs/KNOWN_ISSUES.md #1).
//! Here the well-tested `shapefile` crate does the parsing.

use std::path::Path;

use geojson::{Feature, FeatureCollection, Geometry, feature::Id};
use serde_json::{Map, Value};
// The crate is also called `shapefile`, the same as this module. `::shapefile`
// (with leading colons) means "the external crate", not "this module".
use ::shapefile::dbase::{FieldValue, Record};
use ::shapefile::{Shape, ShapeReader};

use super::{IoError, Layer, layer_name};

/// Reads a `.shp` file (plus its `.dbf` and `.prj`, if present) into a [`Layer`].
pub fn read(path: &Path) -> Result<Layer, IoError> {
    let shapefile_error = |message: String| IoError::Shapefile {
        path: path.display().to_string(),
        message,
    };

    // --- Geometries (.shp) -------------------------------------------------
    let reader = ShapeReader::from_path(path).map_err(|e| shapefile_error(e.to_string()))?;
    let header = *reader.header();
    let shapes: Vec<Shape> = reader.read().map_err(|e| shapefile_error(e.to_string()))?;

    // --- Attributes (.dbf), optional --------------------------------------
    let dbf_path = sibling_file(path, "dbf");
    let (fields, records) = match dbf_path {
        Some(dbf) => read_attributes(&dbf).map_err(shapefile_error)?,
        None => (Vec::new(), Vec::new()),
    };
    if !records.is_empty() && records.len() != shapes.len() {
        return Err(shapefile_error(format!(
            "the .shp has {} shapes but the .dbf has {} rows",
            shapes.len(),
            records.len()
        )));
    }

    // --- Coordinate system (.prj), optional --------------------------------
    let crs_wkt = match sibling_file(path, "prj") {
        Some(prj) => Some(
            std::fs::read_to_string(&prj)
                .map_err(|source| IoError::File {
                    path: prj.display().to_string(),
                    source,
                })?
                .trim()
                .to_string(),
        ),
        None => None,
    };

    // --- Build GeoJSON features --------------------------------------------
    // Walk the shapes and attribute rows side by side. `record_iter.next()` gives
    // `Some(row)` for each shape, or `None` throughout when there is no .dbf.
    let mut record_iter = records.into_iter();
    let mut empty_geometries = 0;
    let mut features = Vec::with_capacity(shapes.len());

    for (index, shape) in shapes.into_iter().enumerate() {
        let geometry = shape_to_geometry(shape);
        if geometry.is_none() {
            empty_geometries += 1;
        }
        let properties = record_iter.next().map(record_to_properties);

        features.push(Feature {
            bbox: None,
            geometry,
            // A numeric id per feature lets MapLibre highlight features later (step 6).
            id: Some(Id::Number(index.into())),
            properties,
            foreign_members: None,
        });
    }

    let bbox = [
        header.bbox.min.x,
        header.bbox.min.y,
        header.bbox.max.x,
        header.bbox.max.y,
    ];

    Ok(Layer {
        name: layer_name(path),
        path: path.display().to_string(),
        geometry_type: format!("{:?}", header.shape_type),
        feature_count: features.len(),
        empty_geometries,
        // An empty file has an all-zero (or NaN) box; don't zoom to that.
        bbox: bbox
            .iter()
            .all(|v| v.is_finite())
            .then_some(bbox)
            .filter(|b| b[0] < b[2] || b[1] < b[3]),
        fields,
        crs_wkt,
        geojson: FeatureCollection {
            bbox: None,
            features,
            foreign_members: None,
        },
    })
}

/// Finds a companion file such as `world.dbf` next to `world.shp`.
///
/// Checks both lower- and upper-case extensions because shapefiles copied from
/// Windows often have names like `WORLD.DBF`, and Linux/macOS file names are
/// case-sensitive.
fn sibling_file(shp_path: &Path, extension: &str) -> Option<std::path::PathBuf> {
    [extension.to_lowercase(), extension.to_uppercase()]
        .into_iter()
        .map(|ext| shp_path.with_extension(ext))
        .find(|candidate| candidate.is_file())
}

/// Converts one shape to a GeoJSON geometry, or `None` for null/invalid shapes.
fn shape_to_geometry(shape: Shape) -> Option<Geometry> {
    // `shapefile` converts to `geo_types` (the standard Rust geometry types),
    // and `geojson` converts from `geo_types`. Polygons need care: a shapefile
    // stores outer rings and holes as a flat list, and this conversion works out
    // which hole belongs to which outer ring.
    let geo: geo_types::Geometry<f64> = shape.try_into().ok()?;
    Some(Geometry::new((&geo).into()))
}

/// Reads the `.dbf` attribute table: column names (in order) and every row.
fn read_attributes(dbf_path: &Path) -> Result<(Vec<String>, Vec<Record>), String> {
    let mut reader = ::shapefile::dbase::Reader::from_path(dbf_path)
        .map_err(|e| format!("attribute table {}: {e}", dbf_path.display()))?;
    let fields = reader
        .fields()
        .iter()
        .map(|field| field.name().to_string())
        .collect();
    let records = reader
        .read()
        .map_err(|e| format!("attribute table {}: {e}", dbf_path.display()))?;
    Ok((fields, records))
}

/// Turns one attribute row into a JSON object for the GeoJSON `properties`.
fn record_to_properties(record: Record) -> Map<String, Value> {
    record
        .into_iter()
        .map(|(name, value)| (name, field_to_json(value)))
        .collect()
}

/// Converts one dBase value to JSON. Blank values become `null`.
fn field_to_json(value: FieldValue) -> Value {
    match value {
        FieldValue::Character(text) => text.map(Value::String).unwrap_or(Value::Null),
        FieldValue::Memo(text) => Value::String(text),
        FieldValue::Numeric(number) => number.map(json_number).unwrap_or(Value::Null),
        FieldValue::Float(number) => number.map(|n| json_number(n.into())).unwrap_or(Value::Null),
        FieldValue::Double(number) | FieldValue::Currency(number) => json_number(number),
        FieldValue::Integer(number) => Value::from(number),
        FieldValue::Logical(flag) => flag.map(Value::Bool).unwrap_or(Value::Null),
        // Dates become ISO text ("2004-08-08") so they sort and display sensibly.
        FieldValue::Date(date) => date
            .map(|d| Value::String(format!("{:04}-{:02}-{:02}", d.year(), d.month(), d.day())))
            .unwrap_or(Value::Null),
        FieldValue::DateTime(date_time) => Value::String(format!("{date_time:?}")),
    }
}

/// JSON can't represent NaN or infinity, so those become `null`.
fn json_number(n: f64) -> Value {
    serde_json::Number::from_f64(n)
        .map(Value::Number)
        .unwrap_or(Value::Null)
}

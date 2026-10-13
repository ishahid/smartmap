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

use ::geojson::{Feature, Geometry};
use serde_json::{Map, Value};
// The crate is also called `shapefile`, the same as this module. `::shapefile`
// (with leading colons) means "the external crate", not "this module".
use ::shapefile::dbase::{FieldValue, Record};
use ::shapefile::{Shape, ShapeReader};

use super::{IoError, RawLayer, json_number, layer_name, read_text, sibling_file};
use crate::crs::SourceCrs;

/// Reads a `.shp` file (plus its `.dbf` and `.prj`, if present).
pub fn read(path: &Path) -> Result<RawLayer, IoError> {
    let error = |message: String| IoError::format("shapefile", path, message);

    // --- Geometries (.shp) -------------------------------------------------
    let shapes: Vec<Shape> = ShapeReader::from_path(path)
        .and_then(|reader| reader.read())
        .map_err(|e| error(e.to_string()))?;

    // --- Attributes (.dbf), optional --------------------------------------
    let (fields, records) = match sibling_file(path, "dbf") {
        Some(dbf) => read_attributes(&dbf).map_err(error)?,
        None => (Vec::new(), Vec::new()),
    };
    if !records.is_empty() && records.len() != shapes.len() {
        return Err(error(format!(
            "the .shp has {} shapes but the .dbf has {} rows",
            shapes.len(),
            records.len()
        )));
    }

    // --- Coordinate system (.prj), optional --------------------------------
    // Without a .prj we can't know; old data like the 2004 samples is usually
    // plain longitude/latitude, and `io::finish` warns if it doesn't look like it.
    let crs = match sibling_file(path, "prj") {
        Some(prj) => SourceCrs::Wkt(read_text(&prj)?.trim().to_string()),
        None => SourceCrs::Unknown,
    };

    // --- Build GeoJSON features --------------------------------------------
    // Walk the shapes and attribute rows side by side. `record_iter.next()` gives
    // `Some(row)` for each shape, or `None` throughout when there is no .dbf.
    let mut record_iter = records.into_iter();
    let features = shapes
        .into_iter()
        .map(|shape| Feature {
            geometry: shape_to_geometry(shape),
            properties: record_iter.next().map(record_to_properties),
            ..Default::default()
        })
        .collect();

    Ok(RawLayer {
        name: layer_name(path),
        format: "Shapefile",
        table: None,
        features,
        fields: Some(fields),
        crs,
        warnings: Vec::new(),
    })
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

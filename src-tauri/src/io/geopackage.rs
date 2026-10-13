//! GeoPackage reader (`.gpkg`).
//!
//! A GeoPackage is an SQLite database with some standard tables:
//!
//! - `gpkg_contents` lists the data tables; `data_type = 'features'` ones hold vector data.
//! - `gpkg_geometry_columns` says which column of each table holds the geometry.
//! - `gpkg_spatial_ref_sys` describes coordinate systems (EPSG code and WKT).
//!
//! Geometries are stored as "GeoPackage binary": a small header followed by
//! standard WKB (well-known binary). `geozero` decodes both parts.
//!
//! One GeoPackage can hold many feature tables; each becomes its own layer.

use std::path::Path;

use ::geojson::{Feature, Geometry};
use geozero::ToGeo;
use geozero::wkb::GpkgWkb;
use rusqlite::types::ValueRef;
use rusqlite::{Connection, OpenFlags};
use serde_json::{Map, Value};

use super::{IoError, RawLayer, json_number, layer_name};
use crate::crs::SourceCrs;

/// One feature table, as listed in `gpkg_contents`/`gpkg_geometry_columns`.
struct FeatureTable {
    table: String,
    geometry_column: String,
    srs_id: i64,
}

pub fn read(path: &Path) -> Result<Vec<RawLayer>, IoError> {
    let error = |message: String| IoError::format("GeoPackage", path, message);
    let sql_error = |e: rusqlite::Error| error(e.to_string());

    // Read-only, so we can never change the user's file.
    let db =
        Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(sql_error)?;

    let tables = list_feature_tables(&db).map_err(|e| error(format!("not a GeoPackage? ({e})")))?;
    if tables.is_empty() {
        return Err(error("it has no feature tables".to_string()));
    }

    let file_name = layer_name(path);
    let mut layers = Vec::with_capacity(tables.len());
    for table in &tables {
        let mut layer = read_table(&db, table).map_err(sql_error)?;
        // Name single-table files after the file, others after the table.
        layer.name = if tables.len() == 1 {
            file_name.clone()
        } else {
            format!("{file_name}: {}", table.table)
        };
        layers.push(layer);
    }
    Ok(layers)
}

fn list_feature_tables(db: &Connection) -> rusqlite::Result<Vec<FeatureTable>> {
    let mut statement = db.prepare(
        "SELECT c.table_name, g.column_name, g.srs_id
         FROM gpkg_contents c
         JOIN gpkg_geometry_columns g ON g.table_name = c.table_name
         WHERE c.data_type = 'features'
         ORDER BY c.table_name",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(FeatureTable {
            table: row.get(0)?,
            geometry_column: row.get(1)?,
            srs_id: row.get(2)?,
        })
    })?;
    rows.collect()
}

fn read_table(db: &Connection, table: &FeatureTable) -> rusqlite::Result<RawLayer> {
    let crs = table_crs(db, table.srs_id)?;
    let mut warnings = Vec::new();

    // `SELECT *` keeps the table's own column order for the attribute list.
    let mut statement = db.prepare(&format!("SELECT * FROM {}", quote(&table.table)))?;
    let columns: Vec<String> = statement
        .column_names()
        .into_iter()
        .map(String::from)
        .collect();
    let geometry_index = columns
        .iter()
        .position(|c| c.eq_ignore_ascii_case(&table.geometry_column));
    let fields: Vec<String> = columns
        .iter()
        .enumerate()
        .filter(|(i, _)| Some(*i) != geometry_index)
        .map(|(_, name)| name.clone())
        .collect();

    let mut unreadable = 0;
    let mut features = Vec::new();
    let mut rows = statement.query([])?;
    while let Some(row) = rows.next()? {
        let mut properties = Map::new();
        let mut geometry = None;
        for (index, name) in columns.iter().enumerate() {
            let value = row.get_ref(index)?;
            if Some(index) == geometry_index {
                if let ValueRef::Blob(bytes) = value {
                    geometry = decode_geometry(bytes);
                    unreadable += usize::from(geometry.is_none());
                }
            } else {
                properties.insert(name.clone(), sql_to_json(value));
            }
        }
        features.push(Feature {
            geometry,
            properties: Some(properties),
            ..Default::default()
        });
    }
    if unreadable > 0 {
        warnings.push(format!("{unreadable} geometries couldn't be decoded"));
    }

    Ok(RawLayer {
        name: table.table.clone(),
        format: "GeoPackage",
        table: Some(table.table.clone()),
        features,
        fields: Some(fields),
        crs,
        warnings,
    })
}

/// Looks up a table's coordinate system in `gpkg_spatial_ref_sys`.
fn table_crs(db: &Connection, srs_id: i64) -> rusqlite::Result<SourceCrs> {
    // The spec reserves -1 (undefined Cartesian) and 0 (undefined geographic).
    if srs_id <= 0 {
        return Ok(SourceCrs::Unknown);
    }
    let row = db.query_row(
        "SELECT organization, organization_coordsys_id, definition
         FROM gpkg_spatial_ref_sys WHERE srs_id = ?1",
        [srs_id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
            ))
        },
    );
    Ok(match row {
        Ok((organization, code, _)) if organization.eq_ignore_ascii_case("EPSG") && code > 0 => {
            SourceCrs::Epsg(code as u32)
        }
        Ok((_, _, definition)) if !definition.trim().is_empty() && definition != "undefined" => {
            SourceCrs::Wkt(definition)
        }
        Ok(_) | Err(rusqlite::Error::QueryReturnedNoRows) => SourceCrs::Unknown,
        Err(e) => return Err(e),
    })
}

/// Decodes a GeoPackage geometry blob, or `None` if it's empty or invalid.
fn decode_geometry(bytes: &[u8]) -> Option<Geometry> {
    let geometry: geo_types::Geometry<f64> = GpkgWkb(bytes).to_geo().ok()?;
    // Empty geometries decode as empty collections; treat them as missing.
    if matches!(&geometry, geo_types::Geometry::GeometryCollection(c) if c.0.is_empty()) {
        return None;
    }
    Some(Geometry::new((&geometry).into()))
}

/// Converts an SQLite value to JSON. Binary data has no sensible JSON form, so it's dropped.
fn sql_to_json(value: ValueRef) -> Value {
    match value {
        ValueRef::Null | ValueRef::Blob(_) => Value::Null,
        ValueRef::Integer(n) => Value::from(n),
        ValueRef::Real(n) => json_number(n),
        ValueRef::Text(bytes) => Value::String(String::from_utf8_lossy(bytes).into_owned()),
    }
}

/// Quotes a table name for SQL: `my "table"` → `"my ""table"""`.
fn quote(identifier: &str) -> String {
    format!("\"{}\"", identifier.replace('"', "\"\""))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_identifiers() {
        assert_eq!(quote("roads"), "\"roads\"");
        assert_eq!(quote("my \"table\""), "\"my \"\"table\"\"\"");
    }
}

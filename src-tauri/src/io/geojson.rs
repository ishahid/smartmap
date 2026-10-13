//! GeoJSON reader (`.geojson`, `.json`).
//!
//! GeoJSON is already the format the UI uses, so this is mostly parsing.
//! A file can hold a `FeatureCollection`, a single `Feature`, or a bare
//! geometry; all three become a list of features.
//!
//! The current standard (RFC 7946) says coordinates are always WGS84
//! longitude/latitude. Older files (the 2008 spec) could name another CRS in a
//! `"crs"` member, e.g. `"urn:ogc:def:crs:EPSG::3857"`, so we honour that.

use std::path::Path;

use ::geojson::{Feature, GeoJson, JsonObject};
use serde_json::Value;

use super::{IoError, RawLayer, layer_name, read_text};
use crate::crs::SourceCrs;

pub fn read(path: &Path) -> Result<RawLayer, IoError> {
    let text = read_text(path)?;
    let geojson: GeoJson = text
        .parse()
        .map_err(|e| IoError::format("GeoJSON", path, e))?;

    let (features, foreign_members) = match geojson {
        GeoJson::FeatureCollection(collection) => (collection.features, collection.foreign_members),
        GeoJson::Feature(feature) => {
            let members = feature.foreign_members.clone();
            (vec![feature], members)
        }
        GeoJson::Geometry(geometry) => (
            vec![Feature {
                geometry: Some(geometry),
                ..Default::default()
            }],
            None,
        ),
    };

    Ok(RawLayer {
        name: layer_name(path),
        format: "GeoJSON",
        features,
        fields: None,
        crs: legacy_crs(foreign_members.as_ref()),
        warnings: Vec::new(),
    })
}

/// Reads the old-style `"crs": {"type": "name", "properties": {"name": "EPSG:3857"}}`.
/// With no `crs` member the file is WGS84, as the standard requires.
fn legacy_crs(members: Option<&JsonObject>) -> SourceCrs {
    let name = members
        .and_then(|m| m.get("crs"))
        .and_then(|crs| crs.pointer("/properties/name"))
        .and_then(Value::as_str);
    let Some(name) = name else {
        return SourceCrs::Epsg(4326);
    };
    // "urn:ogc:def:crs:OGC:1.3:CRS84" is WGS84 longitude/latitude.
    if name.to_ascii_uppercase().ends_with("CRS84") {
        return SourceCrs::Epsg(4326);
    }
    // "EPSG:3857", "urn:ogc:def:crs:EPSG::3857": the code is after the last colon.
    match name.rsplit(':').next().and_then(|code| code.parse().ok()) {
        Some(code) => SourceCrs::Epsg(code),
        None => SourceCrs::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn members(crs_name: &str) -> JsonObject {
        let value = json!({ "crs": { "type": "name", "properties": { "name": crs_name } } });
        value.as_object().unwrap().clone()
    }

    #[test]
    fn reads_legacy_crs_names() {
        assert_eq!(legacy_crs(None), SourceCrs::Epsg(4326));
        assert_eq!(
            legacy_crs(Some(&members("EPSG:3857"))),
            SourceCrs::Epsg(3857)
        );
        assert_eq!(
            legacy_crs(Some(&members("urn:ogc:def:crs:EPSG::32643"))),
            SourceCrs::Epsg(32643)
        );
        assert_eq!(
            legacy_crs(Some(&members("urn:ogc:def:crs:OGC:1.3:CRS84"))),
            SourceCrs::Epsg(4326)
        );
        assert_eq!(
            legacy_crs(Some(&members("something odd"))),
            SourceCrs::Unknown
        );
    }
}

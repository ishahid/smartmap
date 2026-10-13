//! KML and KMZ reader (`.kml`, `.kmz`), the Google Earth formats.
//!
//! KML is XML. Features are `<Placemark>` elements, which can sit at any depth
//! inside `<Document>` and `<Folder>` elements, so we walk the tree. Each
//! placemark gives its name, description and any `<ExtendedData>` values as
//! attributes. KMZ is a zip file containing a KML file (usually `doc.kml`).
//!
//! KML coordinates are always WGS84 longitude/latitude.

use std::fs::File;
use std::io::Read;
use std::path::Path;

use ::geojson::{Feature, Geometry};
use ::kml::types::{Element, Placemark};
use ::kml::{Kml, KmlReader};
use serde_json::{Map, Value};

use super::{IoError, RawLayer, layer_name, read_text};
use crate::crs::SourceCrs;

pub fn read(path: &Path) -> Result<RawLayer, IoError> {
    let error = |message: String| IoError::format("KML", path, message);

    let is_kmz = path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("kmz"));
    let text = if is_kmz {
        read_kmz(path)?
    } else {
        read_text(path)?
    };

    let root: Kml<f64> = KmlReader::from_string(&text)
        .read()
        .map_err(|e| error(e.to_string()))?;

    let mut placemarks = Vec::new();
    collect_placemarks(root, &mut placemarks);

    let features = placemarks.into_iter().map(placemark_to_feature).collect();

    Ok(RawLayer {
        name: layer_name(path),
        format: if is_kmz { "KMZ" } else { "KML" },
        features,
        fields: None,
        crs: SourceCrs::Epsg(4326),
        warnings: Vec::new(),
    })
}

/// Pulls the main KML file out of a KMZ (zip) archive.
fn read_kmz(path: &Path) -> Result<String, IoError> {
    let error = |message: String| IoError::format("KMZ", path, message);
    let file = File::open(path).map_err(|source| IoError::file(path, source))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| error(e.to_string()))?;

    // The spec says the first .kml entry is the main one; it's normally doc.kml.
    let name = archive
        .file_names()
        .filter_map(Result::ok) // skip entries whose names can't be decoded
        .find(|name| name.to_ascii_lowercase().ends_with(".kml"))
        .map(|name| name.into_owned())
        .ok_or_else(|| error("it contains no .kml file".to_string()))?;
    let mut text = String::new();
    archive
        .by_name(&name)
        .map_err(|e| error(e.to_string()))?
        .read_to_string(&mut text)
        .map_err(|e| error(e.to_string()))?;
    Ok(text)
}

/// Collects every placemark in the tree, in document order.
fn collect_placemarks(node: Kml<f64>, out: &mut Vec<Placemark<f64>>) {
    match node {
        Kml::Placemark(placemark) => out.push(placemark),
        Kml::KmlDocument(document) => document
            .elements
            .into_iter()
            .for_each(|e| collect_placemarks(e, out)),
        Kml::Document { elements, .. } => elements
            .into_iter()
            .for_each(|e| collect_placemarks(e, out)),
        Kml::Folder(folder) => folder
            .elements
            .into_iter()
            .for_each(|e| collect_placemarks(e, out)),
        // Styles, ground overlays and so on aren't features.
        _ => {}
    }
}

fn placemark_to_feature(placemark: Placemark<f64>) -> Feature {
    let mut properties = Map::new();
    if let Some(name) = placemark.name {
        properties.insert("name".into(), Value::String(name));
    }
    if let Some(description) = placemark.description {
        properties.insert("description".into(), Value::String(description));
    }
    for element in &placemark.children {
        if element.name == "ExtendedData" {
            extended_data(element, &mut properties);
        }
    }

    // `kml` converts its geometry types to `geo_types`, and `geojson` converts those.
    let geometry = placemark
        .geometry
        .and_then(|g| geo_types::Geometry::<f64>::try_from(g).ok())
        .map(|g| Geometry::new((&g).into()));

    Feature {
        geometry,
        properties: Some(properties),
        ..Default::default()
    }
}

/// Reads both styles of KML custom attributes:
///
/// ```xml
/// <ExtendedData>
///   <Data name="population"><value>1200</value></Data>
///   <SchemaData schemaUrl="#s"><SimpleData name="population">1200</SimpleData></SchemaData>
/// </ExtendedData>
/// ```
fn extended_data(element: &Element, properties: &mut Map<String, Value>) {
    for child in &element.children {
        match child.name.as_str() {
            "Data" => {
                let value = child
                    .children
                    .iter()
                    .find(|c| c.name == "value")
                    .and_then(|c| c.content.clone());
                insert_named(child, value, properties);
            }
            "SchemaData" => {
                for simple in child.children.iter().filter(|c| c.name == "SimpleData") {
                    insert_named(simple, simple.content.clone(), properties);
                }
            }
            _ => {}
        }
    }
}

fn insert_named(element: &Element, value: Option<String>, properties: &mut Map<String, Value>) {
    if let Some(name) = element.attrs.get("name") {
        properties.insert(
            name.clone(),
            value.map(Value::String).unwrap_or(Value::Null),
        );
    }
}

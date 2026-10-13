//! GPX reader (`.gpx`), the GPS exchange format.
//!
//! A GPX file has three kinds of thing, which all go into one layer:
//!
//! - waypoints → points
//! - tracks (recorded paths, possibly in several segments) → multi-lines
//! - routes (planned paths) → lines
//!
//! Each feature gets a `kind` attribute ("waypoint", "track" or "route") so
//! they can be told apart. GPX coordinates are always WGS84.

use std::fs::File;
use std::io::BufReader;
use std::path::Path;

use ::geojson::{Feature, Geometry};
use serde_json::{Map, Value};

use super::{IoError, RawLayer, json_number, layer_name};
use crate::crs::SourceCrs;

pub fn read(path: &Path) -> Result<RawLayer, IoError> {
    let file = File::open(path).map_err(|source| IoError::file(path, source))?;
    let data = ::gpx::read(BufReader::new(file)).map_err(|e| IoError::format("GPX", path, e))?;

    let mut features = Vec::new();

    for waypoint in &data.waypoints {
        let mut properties = common("waypoint", &waypoint.name, &waypoint.description);
        if let Some(elevation) = waypoint.elevation {
            properties.insert("elevation".into(), json_number(elevation));
        }
        if let Some(time) = waypoint.time.and_then(|t| t.format().ok()) {
            // ISO 8601 text; drop the "nothing after the second" part GPX adds.
            let time = time.replace(".000000000Z", "Z");
            properties.insert("time".into(), Value::String(time));
        }
        features.push(feature(
            (&geo_types::Geometry::Point(waypoint.point())).into(),
            properties,
        ));
    }

    for track in &data.tracks {
        let properties = common("track", &track.name, &track.description);
        let lines = track.multilinestring();
        features.push(feature(
            (&geo_types::Geometry::MultiLineString(lines)).into(),
            properties,
        ));
    }

    for route in &data.routes {
        let properties = common("route", &route.name, &route.description);
        let line = route.linestring();
        features.push(feature(
            (&geo_types::Geometry::LineString(line)).into(),
            properties,
        ));
    }

    Ok(RawLayer {
        name: layer_name(path),
        format: "GPX",
        features,
        fields: Some(
            ["kind", "name", "description", "elevation", "time"]
                .map(String::from)
                .to_vec(),
        ),
        crs: SourceCrs::Epsg(4326),
        warnings: Vec::new(),
    })
}

/// The attributes every GPX feature has.
fn common(kind: &str, name: &Option<String>, description: &Option<String>) -> Map<String, Value> {
    let text = |value: &Option<String>| value.clone().map(Value::String).unwrap_or(Value::Null);
    let mut properties = Map::new();
    properties.insert("kind".into(), Value::String(kind.into()));
    properties.insert("name".into(), text(name));
    properties.insert("description".into(), text(description));
    properties
}

fn feature(value: ::geojson::GeometryValue, properties: Map<String, Value>) -> Feature {
    Feature {
        geometry: Some(Geometry::new(value)),
        properties: Some(properties),
        ..Default::default()
    }
}

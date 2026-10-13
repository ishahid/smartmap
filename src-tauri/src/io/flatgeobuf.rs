//! FlatGeobuf reader (`.fgb`).
//!
//! FlatGeobuf is a fast binary format: a header (geometry type, columns, CRS),
//! an optional spatial index, then the features. `geozero` can stream the
//! features straight into GeoJSON text, which we then parse.

use std::fs::File;
use std::io::BufReader;
use std::path::Path;

use ::flatgeobuf::FgbReader;
use ::geojson::FeatureCollection;
use geozero::geojson::GeoJsonWriter;

use super::{IoError, RawLayer, layer_name};
use crate::crs::SourceCrs;

pub fn read(path: &Path) -> Result<RawLayer, IoError> {
    let error = |message: String| IoError::format("FlatGeobuf", path, message);

    let file = File::open(path).map_err(|source| IoError::file(path, source))?;
    let mut reader = BufReader::new(file);
    let fgb = FgbReader::open(&mut reader).map_err(|e| error(e.to_string()))?;

    // Header facts, read before `select_all` takes ownership of the reader.
    let header = fgb.header();
    let fields: Vec<String> = header
        .columns()
        .map(|columns| columns.iter().map(|c| c.name().to_string()).collect())
        .unwrap_or_default();
    let crs = match header.crs() {
        Some(crs)
            if crs.code() > 0 && crs.org().is_none_or(|org| org.eq_ignore_ascii_case("EPSG")) =>
        {
            SourceCrs::Epsg(crs.code() as u32)
        }
        Some(crs) => crs
            .wkt()
            .map_or(SourceCrs::Unknown, |wkt| SourceCrs::Wkt(wkt.to_string())),
        None => SourceCrs::Unknown,
    };

    // Stream every feature into a GeoJSON FeatureCollection string.
    let mut json = Vec::new();
    let mut features = fgb.select_all().map_err(|e| error(e.to_string()))?;
    features
        .process_features(&mut GeoJsonWriter::new(&mut json))
        .map_err(|e| error(e.to_string()))?;
    let text = String::from_utf8(json).map_err(|e| error(e.to_string()))?;
    let collection: FeatureCollection = text
        .parse()
        .map_err(|e: ::geojson::Error| error(e.to_string()))?;

    Ok(RawLayer {
        name: layer_name(path),
        format: "FlatGeobuf",
        features: collection.features,
        fields: Some(fields),
        crs,
        warnings: Vec::new(),
    })
}

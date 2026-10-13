//! CSV reader (`.csv`, `.tsv`, `.txt`): a table with longitude/latitude columns.
//!
//! Each row becomes a point. The coordinate columns are found by name
//! (`lon`/`lng`/`longitude`/`x` and `lat`/`latitude`/`y`, any case). The
//! separator (comma, semicolon or tab) is guessed from the header line.
//! Numbers become JSON numbers; everything else stays text.
//!
//! A CSV can't say what coordinate system it uses, so we assume WGS84, unless
//! there's a `.prj` file next to it (some tools write one).

use std::path::Path;

use ::geojson::{Feature, Geometry};
use serde_json::{Map, Value};

use super::{IoError, RawLayer, json_number, layer_name, read_text, sibling_file};
use crate::crs::SourceCrs;

/// Accepted column names, lower-case, in order of preference.
const LONGITUDE_NAMES: &[&str] = &["longitude", "lon", "lng", "long", "x"];
const LATITUDE_NAMES: &[&str] = &["latitude", "lat", "y"];

pub fn read(path: &Path) -> Result<RawLayer, IoError> {
    let error = |message: String| IoError::format("CSV", path, message);
    let text = read_text(path)?;
    // Some spreadsheet programs start the file with an invisible byte-order mark.
    let text = text.strip_prefix('\u{feff}').unwrap_or(&text);

    let delimiter = guess_delimiter(text);
    let mut reader = ::csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .flexible(true) // tolerate rows with missing trailing cells
        .from_reader(text.as_bytes());

    let headers: Vec<String> = reader
        .headers()
        .map_err(|e| error(e.to_string()))?
        .iter()
        .map(|h| h.trim().to_string())
        .collect();
    let (Some(lon_index), Some(lat_index)) = (
        find_column(&headers, LONGITUDE_NAMES),
        find_column(&headers, LATITUDE_NAMES),
    ) else {
        return Err(error(format!(
            "no longitude/latitude columns found (looked for lon, lng, longitude, x and lat, latitude, y; the columns are: {})",
            headers.join(", ")
        )));
    };

    let mut features = Vec::new();
    let mut bad_rows = 0;
    for record in reader.records() {
        let record = record.map_err(|e| error(e.to_string()))?;
        let properties: Map<String, Value> = headers
            .iter()
            .enumerate()
            .map(|(i, name)| (name.clone(), cell_to_json(record.get(i).unwrap_or(""))))
            .collect();

        let coordinate = |index: usize| {
            record
                .get(index)
                .and_then(|v| parse_coordinate(v, delimiter))
        };
        let geometry = match (coordinate(lon_index), coordinate(lat_index)) {
            (Some(lon), Some(lat)) => Some(Geometry::new_point([lon, lat])),
            _ => {
                bad_rows += 1;
                None
            }
        };
        features.push(Feature {
            geometry,
            properties: Some(properties),
            ..Default::default()
        });
    }

    let mut warnings = Vec::new();
    if bad_rows > 0 {
        warnings.push(format!("{bad_rows} rows had no valid coordinates"));
    }
    let crs = match sibling_file(path, "prj") {
        Some(prj) => SourceCrs::Wkt(read_text(&prj)?.trim().to_string()),
        None => SourceCrs::Unknown,
    };

    Ok(RawLayer {
        name: layer_name(path),
        format: "CSV",
        table: None,
        features,
        fields: Some(headers),
        crs,
        warnings,
    })
}

/// Picks whichever of comma, semicolon or tab appears most in the first line.
/// (European spreadsheets often use semicolons because the comma is their decimal point.)
fn guess_delimiter(text: &str) -> u8 {
    let first_line = text.lines().next().unwrap_or("");
    b",;\t"
        .iter()
        .copied()
        .max_by_key(|&d| first_line.bytes().filter(|&b| b == d).count())
        .unwrap_or(b',')
}

/// Parses a coordinate. When commas aren't the separator, a comma may be a
/// decimal point ("33,6844"), as in many European locales.
fn parse_coordinate(text: &str, delimiter: u8) -> Option<f64> {
    let text = text.trim();
    let parsed = if delimiter == b',' {
        text.parse()
    } else {
        text.replace(',', ".").parse()
    };
    parsed.ok().filter(|n: &f64| n.is_finite())
}

/// Index of the first header matching one of `names` (case-insensitive), by preference order.
fn find_column(headers: &[String], names: &[&str]) -> Option<usize> {
    names
        .iter()
        .find_map(|name| headers.iter().position(|h| h.eq_ignore_ascii_case(name)))
}

/// Empty cells become null, numbers become numbers, anything else stays text.
fn cell_to_json(cell: &str) -> Value {
    let trimmed = cell.trim();
    if trimmed.is_empty() {
        Value::Null
    } else if let Ok(integer) = trimmed.parse::<i64>() {
        Value::from(integer)
    } else if let Ok(number) = trimmed.parse::<f64>() {
        json_number(number)
    } else {
        Value::String(cell.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guesses_delimiters() {
        assert_eq!(guess_delimiter("name,lat,lon\n"), b',');
        assert_eq!(guess_delimiter("name;lat;lon\n1,5;2,5;3\n"), b';');
        assert_eq!(guess_delimiter("name\tlat\tlon"), b'\t');
    }

    #[test]
    fn finds_coordinate_columns_in_preference_order() {
        let headers: Vec<String> = ["ID", "X", "Longitude", "LAT"].map(String::from).to_vec();
        assert_eq!(find_column(&headers, LONGITUDE_NAMES), Some(2));
        assert_eq!(find_column(&headers, LATITUDE_NAMES), Some(3));
    }

    #[test]
    fn parses_decimal_commas_unless_comma_separated() {
        assert_eq!(parse_coordinate(" 33.5 ", b','), Some(33.5));
        assert_eq!(parse_coordinate("33,5", b';'), Some(33.5));
        assert_eq!(parse_coordinate("33,5", b','), None);
        assert_eq!(parse_coordinate("", b','), None);
        assert_eq!(parse_coordinate("NaN", b','), None);
    }

    #[test]
    fn converts_cells() {
        assert_eq!(cell_to_json(""), Value::Null);
        assert_eq!(cell_to_json("42"), Value::from(42));
        assert_eq!(cell_to_json("3.5"), Value::from(3.5));
        assert_eq!(cell_to_json("Rawalpindi"), Value::from("Rawalpindi"));
    }
}

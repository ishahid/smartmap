//! Reading GIS data files into map layers.
//!
//! Each format has its own module with a `read(path)` function. A reader only
//! has to do the format-specific part: turn the file into GeoJSON features and
//! say what coordinate system they're in (a [`RawLayer`]). [`finish`] then does
//! the shared work for every format: reprojecting to WGS84, numbering the
//! features, working out the extent and geometry type, and adding warnings.
//!
//! Adding a format = one new module + one line in [`open_file`].

mod csv;
mod flatgeobuf;
mod geojson;
mod geopackage;
mod gpx;
mod kml;
mod shapefile;

use std::path::Path;

use ::geojson::{Feature, FeatureCollection, GeometryValue, feature::Id};
use serde::Serialize;
use serde_json::Value;

use crate::crs::{self, Reprojector, SourceCrs};

/// A data file loaded into memory, ready to send to the UI.
///
/// `#[derive(Serialize)]` lets Tauri turn this struct into JSON automatically.
/// `rename_all = "camelCase"` makes `feature_count` arrive in TypeScript as
/// `featureCount`, matching JavaScript naming style.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Layer {
    /// Display name, e.g. "world" (the file name), or "roads" (a GeoPackage table).
    pub name: String,
    /// Full path of the file that was opened.
    pub path: String,
    /// For files with several layers (GeoPackage), the table this layer came
    /// from, so a project can reopen the same one. `None` for other formats.
    pub table: Option<String>,
    /// File format, e.g. "Shapefile" or "GeoPackage".
    pub format: String,
    /// "Point", "Line", "Polygon", "Mixed" (several kinds), or "None".
    pub geometry_type: String,
    /// Number of features, including ones with no geometry.
    pub feature_count: usize,
    /// Features with no usable geometry. They're kept (with `geometry: null`)
    /// so their attributes still show and record numbers line up.
    pub empty_geometries: usize,
    /// Extent as `[min_lon, min_lat, max_lon, max_lat]`, or `None` if there's no geometry.
    pub bbox: Option<[f64; 4]>,
    /// Attribute column names, in file order.
    pub fields: Vec<String>,
    /// The file's coordinate system, e.g. "EPSG:32643 (WGS_1984_UTM_Zone_43N)".
    pub crs: String,
    /// True if coordinates were converted to WGS84 longitude/latitude.
    pub reprojected: bool,
    /// Things the user should know, e.g. "12 rows had no valid coordinates".
    pub warnings: Vec<String>,
    /// The features, always in WGS84 longitude/latitude.
    pub geojson: FeatureCollection,
}

/// What a format reader produces, before the shared steps in [`finish`].
pub struct RawLayer {
    pub name: String,
    pub format: &'static str,
    /// The table name, for formats with several layers per file (GeoPackage).
    pub table: Option<String>,
    pub features: Vec<Feature>,
    /// Column names in file order, if the format has a fixed list. `None` means
    /// "work it out from the features' properties" (GeoJSON, KML, GPX).
    pub fields: Option<Vec<String>>,
    pub crs: SourceCrs,
    pub warnings: Vec<String>,
}

/// Everything that can go wrong while opening a file.
///
/// `thiserror` generates the `Display` text from the `#[error(...)]` lines,
/// which is what the user ends up seeing in the UI.
#[derive(Debug, thiserror::Error)]
pub enum IoError {
    #[error("unsupported file type: {0}")]
    UnsupportedFormat(String),

    #[error("could not read {path}: {source}")]
    File {
        path: String,
        #[source]
        source: std::io::Error,
    },

    /// A file that exists but couldn't be understood. `format` is e.g. "shapefile".
    #[error("could not read {format} {path}: {message}")]
    Format {
        format: &'static str,
        path: String,
        message: String,
    },

    /// A reader panicked, usually a library tripping over a damaged file
    /// (see `crate::panics`).
    #[error("could not read {path}: the file may be damaged ({message})")]
    Damaged { path: String, message: String },
}

impl IoError {
    /// Shorthand for an [`IoError::Format`] error.
    pub fn format(format: &'static str, path: &Path, message: impl ToString) -> Self {
        IoError::Format {
            format,
            path: path.display().to_string(),
            message: message.to_string(),
        }
    }

    /// Shorthand for an [`IoError::File`] error (couldn't open or read the file).
    pub fn file(path: &Path, source: std::io::Error) -> Self {
        IoError::File {
            path: path.display().to_string(),
            source,
        }
    }
}

/// File extensions SmartMap can open. Keep in step with `FORMATS` in src/lib/api.ts.
pub const EXTENSIONS: &[&str] = &[
    "shp", "geojson", "json", "gpkg", "fgb", "kml", "kmz", "gpx", "csv", "tsv", "txt",
];

/// Opens any supported data file, choosing the reader from the file extension.
///
/// Returns a list because one file can hold several layers (a GeoPackage can
/// have many tables). Most formats give exactly one.
///
/// If a reader panics (a library tripping over a damaged file), that comes
/// back as an [`IoError::Damaged`] error instead of closing the app.
pub fn open_file(path: &Path) -> Result<Vec<Layer>, IoError> {
    crate::panics::catch(|| read_layers(path)).unwrap_or_else(|message| {
        Err(IoError::Damaged {
            path: path.display().to_string(),
            message,
        })
    })
}

/// [`open_file`] without the safety net.
fn read_layers(path: &Path) -> Result<Vec<Layer>, IoError> {
    // `to_ascii_lowercase` so "WORLD.SHP" works too (common on old Windows data).
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let raw_layers = match extension.as_str() {
        "shp" => vec![shapefile::read(path)?],
        "geojson" | "json" => vec![geojson::read(path)?],
        "gpkg" => geopackage::read(path)?,
        "fgb" => vec![flatgeobuf::read(path)?],
        "kml" | "kmz" => vec![kml::read(path)?],
        "gpx" => vec![gpx::read(path)?],
        "csv" | "tsv" | "txt" => vec![csv::read(path)?],
        "" => {
            return Err(IoError::UnsupportedFormat(
                "file has no extension".to_string(),
            ));
        }
        other => return Err(IoError::UnsupportedFormat(format!(".{other}"))),
    };

    Ok(raw_layers
        .into_iter()
        .map(|raw| finish(raw, path))
        .collect())
}

/// The shared steps every layer goes through after its reader is done.
fn finish(raw: RawLayer, path: &Path) -> Layer {
    let RawLayer {
        name,
        format,
        table,
        mut features,
        fields,
        crs: source_crs,
        mut warnings,
    } = raw;

    // --- Reproject to WGS84 -------------------------------------------------
    // If the CRS can't be understood, show the coordinates unchanged and say so,
    // rather than refusing to open the file.
    let reprojector = Reprojector::new(&source_crs).unwrap_or_else(|error| {
        warnings.push(format!("{error}, so its coordinates are shown unconverted"));
        Reprojector::new(&SourceCrs::Unknown).expect("Unknown always works")
    });
    let mut failed_points = 0;
    if reprojector.is_needed() {
        for geometry in features.iter_mut().filter_map(|f| f.geometry.as_mut()) {
            failed_points += reprojector.geometry(geometry);
        }
    }
    if failed_points > 0 {
        warnings.push(format!(
            "{failed_points} points couldn't be converted to longitude/latitude"
        ));
    }

    // --- Number the features ------------------------------------------------
    // MapLibre needs numeric ids to highlight features (step 6), so every
    // feature gets its position as id. An id the file had is kept as a property.
    for (index, feature) in features.iter_mut().enumerate() {
        if let Some(old_id) = feature.id.take() {
            let properties = feature.properties.get_or_insert_with(Default::default);
            if !properties.contains_key("id") {
                let value = match old_id {
                    Id::String(text) => Value::String(text),
                    Id::Number(number) => Value::Number(number),
                };
                properties.insert("id".to_string(), value);
            }
        }
        feature.id = Some(Id::Number(index.into()));
    }

    // --- Facts about the layer ----------------------------------------------
    let fields = fields.unwrap_or_else(|| fields_from_properties(&features));
    let empty_geometries = features.iter().filter(|f| f.geometry.is_none()).count();
    let bbox = bounding_box(&features);

    let looks_like_degrees =
        |b: &[f64; 4]| b[0] >= -180.5 && b[2] <= 180.5 && b[1] >= -90.5 && b[3] <= 90.5;
    if let Some(b) = bbox.filter(|b| !looks_like_degrees(b)) {
        warnings.push(if source_crs == SourceCrs::Unknown {
            format!(
                "the file doesn't say which coordinate system it uses, and its coordinates \
                 ({:.0}, {:.0} to {:.0}, {:.0}) aren't longitude/latitude, so it will appear in the wrong place",
                b[0], b[1], b[2], b[3]
            )
        } else {
            "some coordinates are outside the longitude/latitude range".to_string()
        });
    }

    Layer {
        name,
        path: path.display().to_string(),
        table,
        format: format.to_string(),
        geometry_type: geometry_type(&features).to_string(),
        feature_count: features.len(),
        empty_geometries,
        bbox,
        fields,
        reprojected: reprojector.is_needed(),
        crs: reprojector.label,
        warnings,
        geojson: FeatureCollection {
            bbox: None,
            features,
            foreign_members: None,
        },
    }
}

/// Every property name used by any feature, in the order first seen.
fn fields_from_properties(features: &[Feature]) -> Vec<String> {
    let mut fields: Vec<String> = Vec::new();
    for properties in features.iter().filter_map(|f| f.properties.as_ref()) {
        for key in properties.keys() {
            if !fields.contains(key) {
                fields.push(key.clone());
            }
        }
    }
    fields
}

/// Smallest box around all coordinates, or `None` if there are none.
fn bounding_box(features: &[Feature]) -> Option<[f64; 4]> {
    let mut bbox = [
        f64::INFINITY,
        f64::INFINITY,
        f64::NEG_INFINITY,
        f64::NEG_INFINITY,
    ];
    for feature in features {
        // `for_each_position` wants a mutable geometry; cloning one geometry at a
        // time is cheap next to sending the whole layer to the UI.
        let Some(mut geometry) = feature.geometry.clone() else {
            continue;
        };
        crs::for_each_position(&mut geometry.value, &mut |position| {
            let (x, y) = (position[0], position[1]);
            if x.is_finite() && y.is_finite() {
                bbox = [
                    bbox[0].min(x),
                    bbox[1].min(y),
                    bbox[2].max(x),
                    bbox[3].max(y),
                ];
            }
        });
    }
    bbox[0].is_finite().then_some(bbox)
}

/// Sums up the kinds of geometry in a layer.
fn geometry_type(features: &[Feature]) -> &'static str {
    let mut kind = "None";
    for geometry in features.iter().filter_map(|f| f.geometry.as_ref()) {
        let this = match geometry.value {
            GeometryValue::Point { .. } | GeometryValue::MultiPoint { .. } => "Point",
            GeometryValue::LineString { .. } | GeometryValue::MultiLineString { .. } => "Line",
            GeometryValue::Polygon { .. } | GeometryValue::MultiPolygon { .. } => "Polygon",
            GeometryValue::GeometryCollection { .. } => "Mixed",
        };
        kind = match kind {
            "None" => this,
            same if same == this => same,
            _ => return "Mixed",
        };
    }
    kind
}

/// The file name without directory or extension, used as the layer's display name.
fn layer_name(path: &Path) -> String {
    path.file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Untitled".to_string())
}

/// Finds a companion file such as `world.dbf` next to `world.shp`.
///
/// Checks both lower- and upper-case extensions because files copied from
/// Windows often have names like `WORLD.DBF`, and Linux/macOS file names are
/// case-sensitive.
fn sibling_file(path: &Path, extension: &str) -> Option<std::path::PathBuf> {
    [extension.to_lowercase(), extension.to_uppercase()]
        .into_iter()
        .map(|ext| path.with_extension(ext))
        .find(|candidate| candidate.is_file())
}

/// Reads a whole text file, mapping errors to [`IoError::File`].
fn read_text(path: &Path) -> Result<String, IoError> {
    std::fs::read_to_string(path).map_err(|source| IoError::file(path, source))
}

/// JSON can't represent NaN or infinity, so those become `null`.
fn json_number(n: f64) -> Value {
    serde_json::Number::from_f64(n)
        .map(Value::Number)
        .unwrap_or(Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ::geojson::Geometry;

    fn feature(geometry: Option<Geometry>) -> Feature {
        Feature {
            geometry,
            ..Default::default()
        }
    }

    #[test]
    fn rejects_unknown_extensions() {
        let err = open_file(Path::new("roads.xyz")).unwrap_err();
        assert_eq!(err.to_string(), "unsupported file type: .xyz");
    }

    #[test]
    fn rejects_files_without_extension() {
        let err = open_file(Path::new("roads")).unwrap_err();
        assert_eq!(
            err.to_string(),
            "unsupported file type: file has no extension"
        );
    }

    #[test]
    fn layer_name_strips_folder_and_extension() {
        assert_eq!(
            layer_name(Path::new("/data/Water Bodies 2.shp")),
            "Water Bodies 2"
        );
    }

    #[test]
    fn geometry_type_summarises_single_and_mixed_layers() {
        let point = || feature(Some(Geometry::new_point([1.0, 2.0])));
        let line = || feature(Some(Geometry::new_line_string([[0.0, 0.0], [1.0, 1.0]])));
        assert_eq!(geometry_type(&[]), "None");
        assert_eq!(geometry_type(&[point(), feature(None), point()]), "Point");
        assert_eq!(geometry_type(&[line()]), "Line");
        assert_eq!(geometry_type(&[point(), line()]), "Mixed");
    }

    #[test]
    fn bounding_box_covers_all_points_and_skips_empty() {
        let features = [
            feature(Some(Geometry::new_point([10.0, -5.0]))),
            feature(None),
            feature(Some(Geometry::new_line_string([[-3.0, 2.0], [4.0, 8.0]]))),
        ];
        assert_eq!(bounding_box(&features), Some([-3.0, -5.0, 10.0, 8.0]));
        assert_eq!(bounding_box(&[feature(None)]), None);
    }

    #[test]
    fn finish_numbers_features_and_keeps_old_ids() {
        let mut with_id = feature(Some(Geometry::new_point([1.0, 1.0])));
        with_id.id = Some(Id::String("road-7".into()));
        let raw = RawLayer {
            name: "test".into(),
            format: "GeoJSON",
            table: None,
            features: vec![feature(None), with_id],
            fields: None,
            crs: SourceCrs::Epsg(4326),
            warnings: vec![],
        };
        let layer = finish(raw, Path::new("test.geojson"));
        let ids: Vec<_> = layer
            .geojson
            .features
            .iter()
            .map(|f| f.id.clone())
            .collect();
        assert_eq!(
            ids,
            vec![Some(Id::Number(0.into())), Some(Id::Number(1.into()))]
        );
        assert_eq!(
            layer.geojson.features[1].properties.as_ref().unwrap()["id"],
            "road-7"
        );
        assert_eq!(layer.fields, vec!["id"]);
        assert_eq!(layer.empty_geometries, 1);
        assert!(layer.warnings.is_empty());
    }

    #[test]
    fn finish_warns_about_projected_looking_data_with_no_crs() {
        let raw = RawLayer {
            name: "test".into(),
            format: "CSV",
            table: None,
            features: vec![feature(Some(Geometry::new_point([500_000.0, 3_700_000.0])))],
            fields: Some(vec![]),
            crs: SourceCrs::Unknown,
            warnings: vec![],
        };
        let layer = finish(raw, Path::new("test.csv"));
        assert_eq!(layer.warnings.len(), 1);
        assert!(
            layer.warnings[0].contains("doesn't say which coordinate system"),
            "{:?}",
            layer.warnings
        );
    }
}

//! Reading GIS data files into map layers.
//!
//! Every format reader turns a file into the same [`Layer`] value: a GeoJSON
//! `FeatureCollection` plus some facts about the file. The UI only ever sees
//! `Layer`, so adding a new format later (GeoJSON, GeoPackage, ...) means adding
//! one module here and one line in [`open_layer`].

mod shapefile;

use std::path::Path;

use geojson::FeatureCollection;
use serde::Serialize;

/// A data file loaded into memory, ready to send to the UI.
///
/// `#[derive(Serialize)]` lets Tauri turn this struct into JSON automatically.
/// `rename_all = "camelCase"` makes `feature_count` arrive in TypeScript as
/// `featureCount`, matching JavaScript naming style.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Layer {
    /// Display name: the file name without its extension, e.g. "world".
    pub name: String,
    /// Full path of the file that was opened.
    pub path: String,
    /// Kind of geometry in the file: "Point", "Polyline", "Polygon", ...
    pub geometry_type: String,
    /// Number of records in the file, including ones with no geometry.
    pub feature_count: usize,
    /// Records whose geometry was missing ("null shapes") or couldn't be converted.
    /// They are still included, with `geometry: null`, so record numbers line up.
    pub empty_geometries: usize,
    /// Extent of the data as `[min_x, min_y, max_x, max_y]`, or `None` if unknown.
    pub bbox: Option<[f64; 4]>,
    /// Attribute column names, in file order. Empty if the file has no attributes.
    pub fields: Vec<String>,
    /// Coordinate system description from a `.prj` file, if there is one.
    /// Step 3 of the plan uses this to reproject; for now it's informational.
    pub crs_wkt: Option<String>,
    /// The features themselves.
    pub geojson: FeatureCollection,
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

    #[error("could not read shapefile {path}: {message}")]
    Shapefile { path: String, message: String },
}

/// Opens any supported data file, choosing the reader from the file extension.
pub fn open_layer(path: &Path) -> Result<Layer, IoError> {
    // `to_ascii_lowercase` so "WORLD.SHP" works too (common on old Windows data).
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    match extension.as_str() {
        "shp" => shapefile::read(path),
        other => Err(IoError::UnsupportedFormat(if other.is_empty() {
            "file has no extension".to_string()
        } else {
            format!(".{other}")
        })),
    }
}

/// The file name without directory or extension, used as the layer's display name.
fn layer_name(path: &Path) -> String {
    path.file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Untitled".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_extensions() {
        let err = open_layer(Path::new("roads.xyz")).unwrap_err();
        assert_eq!(err.to_string(), "unsupported file type: .xyz");
    }

    #[test]
    fn rejects_files_without_extension() {
        let err = open_layer(Path::new("roads")).unwrap_err();
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
}

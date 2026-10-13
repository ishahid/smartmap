//! Offline basemaps: serving tiles from a local PMTiles or MBTiles file.
//!
//! The UI opens a file with [`TileServer::open`], which gives it an id and
//! returns a [`TileInfo`] describing the map. MapLibre then asks for tiles at
//! `tiles://localhost/<id>/<z>/<x>/<y>` (on Windows `http://tiles.localhost/...`).
//! `lib.rs` sends those requests to [`TileServer::respond`], which reads the
//! tile from the file. Nothing goes over the network, so the map works offline.
//!
//! [`pmtiles`] and [`mbtiles`] know the two file formats; this module picks one
//! by looking at the file's first bytes and answers requests.

pub mod mbtiles;
pub mod pmtiles;

use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use serde_json::Value;

use mbtiles::MbTiles;
use pmtiles::PmTiles;

/// What kind of tiles a file holds.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TileType {
    /// Mapbox Vector Tiles: shapes with attributes, styled by MapLibre.
    Vector,
    Png,
    Jpeg,
    Webp,
    Avif,
}

impl TileType {
    /// The `Content-Type` a tile of this kind is served with.
    pub fn mime_type(self) -> &'static str {
        match self {
            TileType::Vector => "application/x-protobuf",
            TileType::Png => "image/png",
            TileType::Jpeg => "image/jpeg",
            TileType::Webp => "image/webp",
            TileType::Avif => "image/avif",
        }
    }
}

/// Everything that can go wrong opening a tile file or reading a tile.
#[derive(Debug, thiserror::Error)]
pub enum TileError {
    #[error("{0}")]
    Io(#[from] std::io::Error),

    #[error("it isn't a valid tile file: {0}")]
    Invalid(String),

    #[error("SmartMap can't read {0}")]
    Unsupported(String),

    #[error("{0}")]
    Sqlite(#[from] rusqlite::Error),
}

impl TileError {
    pub(crate) fn invalid(message: &str) -> Self {
        TileError::Invalid(message.to_string())
    }
}

/// Un-gzips a block of bytes.
pub(crate) fn decompress_gzip(data: &[u8]) -> Result<Vec<u8>, TileError> {
    let mut out = Vec::with_capacity(data.len() * 4);
    flate2::read::GzDecoder::new(data).read_to_end(&mut out)?;
    Ok(out)
}

/// An open tile file of either format.
pub enum TileFile {
    PmTiles(PmTiles),
    MbTiles(MbTiles),
}

impl TileFile {
    /// Opens a PMTiles or MBTiles file, telling them apart by their first bytes
    /// (so a file with the wrong extension still opens).
    pub fn open(path: &Path) -> Result<Self, TileError> {
        let mut start = [0u8; 16];
        let read = File::open(path)?.read(&mut start)?;
        if start[..read].starts_with(b"PMTiles") {
            Ok(TileFile::PmTiles(PmTiles::open(path)?))
        } else if start[..read].starts_with(b"SQLite format 3\0") {
            Ok(TileFile::MbTiles(MbTiles::open(path)?))
        } else {
            Err(TileError::invalid(
                "it's neither a PMTiles nor an MBTiles file",
            ))
        }
    }

    /// Returns tile `z/x/y` (rows counted from the top, as MapLibre does),
    /// uncompressed, or `None` if the file doesn't have it.
    pub fn tile(&self, z: u8, x: u32, y: u32) -> Result<Option<Vec<u8>>, TileError> {
        match self {
            TileFile::PmTiles(file) => file.tile(z, x, y),
            TileFile::MbTiles(file) => file.tile(z, x, y),
        }
    }

    pub fn tile_type(&self) -> TileType {
        match self {
            TileFile::PmTiles(file) => file.tile_type(),
            TileFile::MbTiles(file) => file.tile_type(),
        }
    }

    /// A description of the map for the UI. `id` is the address it's served under.
    pub fn info(&self, id: &str, path: &Path) -> TileInfo {
        let file_name = path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        let text = |value: Option<&Value>| {
            value
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
        };
        // Vector tile files list their layers as `vector_layers: [{ "id": "roads", ... }]`.
        let layer_ids = |json: &Value| -> Vec<String> {
            json.get("vector_layers")
                .and_then(Value::as_array)
                .map(|layers| layers.iter().filter_map(|l| text(l.get("id"))).collect())
                .unwrap_or_default()
        };

        match self {
            TileFile::PmTiles(file) => {
                let meta = file.metadata();
                TileInfo {
                    id: id.to_string(),
                    path: path.display().to_string(),
                    name: text(meta.get("name")).unwrap_or(file_name),
                    format: "PMTiles",
                    tile_type: file.tile_type(),
                    min_zoom: file.min_zoom(),
                    max_zoom: file.max_zoom(),
                    bounds: Some(file.bounds()).filter(valid_bounds),
                    center: Some(file.center()),
                    attribution: text(meta.get("attribution")),
                    version: text(meta.get("version")),
                    vector_layers: layer_ids(meta),
                }
            }
            TileFile::MbTiles(file) => TileInfo {
                id: id.to_string(),
                path: path.display().to_string(),
                name: file
                    .metadata("name")
                    .map(str::to_string)
                    .unwrap_or(file_name),
                format: "MBTiles",
                tile_type: file.tile_type(),
                min_zoom: file.min_zoom(),
                max_zoom: file.max_zoom(),
                bounds: file.bounds().filter(valid_bounds),
                center: file.center(),
                attribution: file.metadata("attribution").map(str::to_string),
                version: file.metadata("version").map(str::to_string),
                vector_layers: layer_ids(&file.json()),
            },
        }
    }
}

/// True if `[west, south, east, north]` is a real area on the map.
fn valid_bounds(b: &[f64; 4]) -> bool {
    let [west, south, east, north] = *b;
    (-180.0..=180.0).contains(&west)
        && (-180.0..=180.0).contains(&east)
        && (-90.0..=90.0).contains(&south)
        && (-90.0..=90.0).contains(&north)
        && west < east
        && south < north
}

/// What the UI needs to know to show a tile file as a basemap.
/// Mirrors `TileInfo` in src/lib/api.ts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TileInfo {
    /// Where the tiles are served: `tiles://localhost/<id>/{z}/{x}/{y}`.
    pub id: String,
    pub path: String,
    /// The map's name from the file, or the file name.
    pub name: String,
    /// "PMTiles" or "MBTiles".
    pub format: &'static str,
    pub tile_type: TileType,
    pub min_zoom: u8,
    pub max_zoom: u8,
    /// [west, south, east, north], if the file says.
    pub bounds: Option<[f64; 4]>,
    /// [longitude, latitude, zoom], if the file says.
    pub center: Option<[f64; 3]>,
    /// Credit for the map data (may contain HTML links).
    pub attribution: Option<String>,
    /// The map's version from its metadata. For Protomaps maps it's the
    /// version of their layer scheme ("4.x" is current; "3.x" files are older).
    pub version: Option<String>,
    /// For vector tiles, the names of their layers (e.g. "earth", "water", "roads").
    pub vector_layers: Vec<String>,
}

/// An answer to a tile request. `lib.rs` turns it into an HTTP response.
#[derive(Debug, PartialEq)]
pub struct TileResponse {
    pub status: u16,
    pub content_type: &'static str,
    pub body: Vec<u8>,
}

impl TileResponse {
    fn text(status: u16, message: String) -> Self {
        TileResponse {
            status,
            content_type: "text/plain; charset=utf-8",
            body: message.into_bytes(),
        }
    }
}

/// The open tile files, by id. Shared by every request (Tauri keeps one
/// instance as app state), so it's behind a mutex.
#[derive(Default)]
pub struct TileServer {
    files: Mutex<HashMap<String, Arc<TileFile>>>,
    /// The id given to each path, so opening the same file again reuses it.
    ids: Mutex<HashMap<String, String>>,
}

impl TileServer {
    /// Opens a tile file and starts serving it. Returns its description,
    /// including the id its tiles are served under.
    pub fn open(&self, path: &Path) -> Result<TileInfo, TileError> {
        let file = TileFile::open(path)?;
        let key = path.display().to_string();
        let id = {
            let mut ids = self.ids.lock().unwrap();
            let next = format!("t{}", ids.len() + 1);
            ids.entry(key).or_insert(next).clone()
        };
        let info = file.info(&id, path);
        // Replaces an older copy of the same file, in case it changed on disk.
        self.files.lock().unwrap().insert(id, Arc::new(file));
        Ok(info)
    }

    /// Answers a request for `/<id>/<z>/<x>/<y>` (a trailing extension such
    /// as `.pbf` is ignored). A tile the file doesn't have gets an empty
    /// "204 No Content", which MapLibre treats as an empty tile.
    pub fn respond(&self, path: &str) -> TileResponse {
        let parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
        let [id, z, x, y] = parts[..] else {
            return TileResponse::text(404, format!("not a tile address: {path}"));
        };
        let y = y.split('.').next().unwrap_or(y);
        let (Ok(z), Ok(x), Ok(y)) = (z.parse::<u8>(), x.parse::<u32>(), y.parse::<u32>()) else {
            return TileResponse::text(404, format!("not a tile address: {path}"));
        };
        // Take a reference to the file and let go of the lock before reading,
        // so other tiles can be read at the same time.
        let Some(file) = self.files.lock().unwrap().get(id).cloned() else {
            return TileResponse::text(404, format!("no open tile file \"{id}\""));
        };
        match file.tile(z, x, y) {
            Ok(Some(body)) => TileResponse {
                status: 200,
                content_type: file.tile_type().mime_type(),
                body,
            },
            Ok(None) => TileResponse {
                status: 204,
                content_type: file.tile_type().mime_type(),
                body: Vec::new(),
            },
            Err(e) => TileResponse::text(500, e.to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_addresses() {
        let server = TileServer::default();
        assert_eq!(server.respond("/t1/1/2").status, 404);
        assert_eq!(server.respond("/t1/a/0/0").status, 404);
        assert_eq!(server.respond("/t1/0/0/0").status, 404); // nothing open
    }

    #[test]
    fn checks_bounds() {
        assert!(valid_bounds(&[-180.0, -85.0, 180.0, 85.0]));
        assert!(!valid_bounds(&[10.0, 0.0, 5.0, 1.0]));
        assert!(!valid_bounds(&[0.0, 0.0, 0.0, 0.0]));
        assert!(!valid_bounds(&[0.0, -100.0, 1.0, 1.0]));
    }
}

//! Reading tiles from an MBTiles file: an SQLite database with a `metadata`
//! table (name/value pairs) and a `tiles` table (zoom level, column, row, data).
//!
//! One catch: MBTiles numbers rows from the *bottom* of the map (the "TMS"
//! scheme), while MapLibre asks for rows counted from the top, so the row is
//! flipped before looking a tile up.
//!
//! Spec: <https://github.com/mapbox/mbtiles-spec/blob/master/1.3/spec.md>

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde_json::Value;

use super::{TileError, TileType, decompress_gzip};

/// An open MBTiles file.
pub struct MbTiles {
    /// An SQLite connection can only be used by one thread at a time.
    db: Mutex<Connection>,
    metadata: HashMap<String, String>,
    tile_type: TileType,
    min_zoom: u8,
    max_zoom: u8,
}

impl MbTiles {
    /// Opens an MBTiles file (read-only) and reads its metadata.
    pub fn open(path: &Path) -> Result<Self, TileError> {
        let db = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let metadata: HashMap<String, String> = db
            .prepare("SELECT name, value FROM metadata")
            .and_then(|mut query| {
                query
                    .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                    .collect()
            })
            .map_err(|_| TileError::invalid("it has no MBTiles metadata table"))?;

        let tile_type = match metadata.get("format").map(|f| f.to_lowercase()).as_deref() {
            Some("pbf" | "mvt") => TileType::Vector,
            Some("png") => TileType::Png,
            Some("jpg" | "jpeg") => TileType::Jpeg,
            Some("webp") => TileType::Webp,
            Some(other) => {
                return Err(TileError::Unsupported(format!(
                    "MBTiles with \"{other}\" tiles"
                )));
            }
            None => {
                return Err(TileError::invalid(
                    "its metadata doesn't say the tile format",
                ));
            }
        };

        // The zoom range is optional in the metadata; ask the tiles table if it's missing.
        let zoom = |key: &str| metadata.get(key).and_then(|z| z.trim().parse::<u8>().ok());
        let (min_zoom, max_zoom) = match (zoom("minzoom"), zoom("maxzoom")) {
            (Some(min), Some(max)) => (min, max),
            _ => db
                .query_row(
                    "SELECT MIN(zoom_level), MAX(zoom_level) FROM tiles",
                    [],
                    |row| Ok((row.get::<_, Option<u8>>(0)?, row.get::<_, Option<u8>>(1)?)),
                )
                .map(|(min, max)| (min.unwrap_or(0), max.unwrap_or(0)))
                .map_err(|_| TileError::invalid("it has no MBTiles tiles table"))?,
        };

        Ok(MbTiles {
            db: Mutex::new(db),
            metadata,
            tile_type,
            min_zoom,
            max_zoom,
        })
    }

    pub fn tile_type(&self) -> TileType {
        self.tile_type
    }
    pub fn min_zoom(&self) -> u8 {
        self.min_zoom
    }
    pub fn max_zoom(&self) -> u8 {
        self.max_zoom
    }

    /// A metadata value, e.g. "name" or "attribution".
    pub fn metadata(&self, key: &str) -> Option<&str> {
        self.metadata
            .get(key)
            .map(String::as_str)
            .filter(|v| !v.is_empty())
    }

    /// [west, south, east, north] from the metadata, if it's there and readable.
    pub fn bounds(&self) -> Option<[f64; 4]> {
        numbers(self.metadata("bounds")?)?.try_into().ok()
    }

    /// [longitude, latitude, zoom] from the metadata, if it's there and readable.
    pub fn center(&self) -> Option<[f64; 3]> {
        numbers(self.metadata("center")?)?.try_into().ok()
    }

    /// The `json` metadata entry (vector tiles list their layers there).
    pub fn json(&self) -> Value {
        self.metadata("json")
            .and_then(|text| serde_json::from_str(text).ok())
            .unwrap_or(Value::Null)
    }

    /// Returns tile `z/x/y` (rows counted from the top), uncompressed, or `None` if it isn't in the file.
    pub fn tile(&self, z: u8, x: u32, y: u32) -> Result<Option<Vec<u8>>, TileError> {
        if z > 31 || u64::from(y) >= 1u64 << z {
            return Ok(None);
        }
        // Flip the row: MBTiles counts from the bottom. (SQLite numbers are i64.)
        let row = (1i64 << z) - 1 - i64::from(y);
        let data: Option<Vec<u8>> = self
            .db
            .lock()
            .unwrap()
            .query_row(
                "SELECT tile_data FROM tiles WHERE zoom_level = ?1 AND tile_column = ?2 AND tile_row = ?3",
                (z, i64::from(x), row),
                |r| r.get(0),
            )
            .optional()?;
        match data {
            // Vector tiles in MBTiles are usually gzipped; images never are.
            Some(bytes) if bytes.starts_with(&[0x1f, 0x8b]) => decompress_gzip(&bytes).map(Some),
            other => Ok(other),
        }
    }
}

/// Parses "1.5,2,3" into numbers; `None` if any part isn't a number.
fn numbers(text: &str) -> Option<Vec<f64>> {
    text.split(',').map(|n| n.trim().parse().ok()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_number_lists() {
        assert_eq!(numbers("1, 2.5,-3"), Some(vec![1.0, 2.5, -3.0]));
        assert_eq!(numbers("1,x"), None);
    }
}

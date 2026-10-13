//! Reading tiles from a PMTiles (version 3) file.
//!
//! A PMTiles file is one big file holding every tile of a map, plus an index
//! saying where each tile is. Reading a tile means reading a few byte ranges:
//!
//! 1. The **header** (the first 127 bytes): where everything else is, the
//!    zoom range, the area covered and how the data is compressed.
//! 2. The **root directory**: a list of entries `(tile id, offset, length,
//!    run length)`, sorted by tile id. Large files also have **leaf
//!    directories**, which the root points to (an entry with run length 0).
//! 3. The **tile data** at `tile data offset + entry offset`.
//!
//! Tiles are numbered along a Hilbert curve ([`tile_id`]), which puts tiles
//! that are near each other on the map near each other in the file.
//!
//! Spec: <https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md>

use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::{Arc, Mutex};

use serde_json::Value;

use super::{TileError, TileType, decompress_gzip};

/// Size of the fixed header at the start of every PMTiles v3 file.
const HEADER_LENGTH: usize = 127;
/// Highest zoom level the tile numbering supports.
const MAX_ZOOM: u8 = 31;
/// How deep leaf directories may nest. The spec allows up to 3 levels below the root.
const MAX_DEPTH: usize = 4;
/// Leaf directories kept in memory. A regional map has tens of them; a planet a few thousand.
const LEAF_CACHE_SIZE: usize = 64;

/// How a part of the file is compressed (the header's numbers).
#[derive(Debug, Clone, Copy, PartialEq)]
enum Compression {
    Unknown,
    None,
    Gzip,
    Brotli,
    Zstd,
}

impl Compression {
    fn from_byte(byte: u8) -> Self {
        match byte {
            1 => Compression::None,
            2 => Compression::Gzip,
            3 => Compression::Brotli,
            4 => Compression::Zstd,
            _ => Compression::Unknown,
        }
    }
}

/// The parts of the header we use.
#[derive(Debug, Clone)]
struct Header {
    root_offset: u64,
    root_length: u64,
    metadata_offset: u64,
    metadata_length: u64,
    leaf_offset: u64,
    data_offset: u64,
    internal_compression: Compression,
    tile_compression: Compression,
    tile_type: TileType,
    min_zoom: u8,
    max_zoom: u8,
    /// [west, south, east, north] in degrees.
    bounds: [f64; 4],
    /// [longitude, latitude, zoom]
    center: [f64; 3],
}

/// One directory entry. `run_length` > 0 means tiles `tile_id ..
/// tile_id + run_length` all have this same data (common for empty ocean
/// tiles); 0 means the entry points to a leaf directory instead of a tile.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Entry {
    pub tile_id: u64,
    pub offset: u64,
    pub length: u32,
    pub run_length: u32,
}

/// An open PMTiles file.
pub struct PmTiles {
    /// Behind a mutex because reading means "seek, then read", and two tiles
    /// read at once must not move the file position under each other.
    file: Mutex<File>,
    header: Header,
    root: Vec<Entry>,
    /// Leaf directories read so far, by their offset in the file.
    leaves: Mutex<HashMap<u64, Arc<Vec<Entry>>>>,
    metadata: Value,
}

impl PmTiles {
    /// Opens a PMTiles file and reads its header, root directory and metadata.
    pub fn open(path: &Path) -> Result<Self, TileError> {
        let mut file = File::open(path)?;
        let mut header_bytes = [0u8; HEADER_LENGTH];
        file.read_exact(&mut header_bytes)
            .map_err(|_| TileError::invalid("the file is too short to be PMTiles"))?;
        let header = parse_header(&header_bytes)?;

        let tiles = PmTiles {
            file: Mutex::new(file),
            root: Vec::new(),
            leaves: Mutex::new(HashMap::new()),
            metadata: Value::Null,
            header,
        };
        let root = tiles.read_directory(tiles.header.root_offset, tiles.header.root_length)?;
        let metadata = tiles.read_metadata()?;
        Ok(PmTiles {
            root,
            metadata,
            ..tiles
        })
    }

    pub fn tile_type(&self) -> TileType {
        self.header.tile_type
    }
    pub fn min_zoom(&self) -> u8 {
        self.header.min_zoom
    }
    pub fn max_zoom(&self) -> u8 {
        self.header.max_zoom
    }
    pub fn bounds(&self) -> [f64; 4] {
        self.header.bounds
    }
    pub fn center(&self) -> [f64; 3] {
        self.header.center
    }
    /// The JSON metadata (name, attribution, vector layers, ...). `Null` if there is none.
    pub fn metadata(&self) -> &Value {
        &self.metadata
    }

    /// Returns tile `z/x/y`, uncompressed, or `None` if the file doesn't have it.
    pub fn tile(&self, z: u8, x: u32, y: u32) -> Result<Option<Vec<u8>>, TileError> {
        if z < self.header.min_zoom || z > self.header.max_zoom {
            return Ok(None);
        }
        let Some(id) = tile_id(z, x, y) else {
            return Ok(None);
        };

        // Start at the root and follow leaf directories down to the tile.
        let mut directory = Arc::new(self.root.clone());
        for _ in 0..MAX_DEPTH {
            let Some(entry) = find_entry(&directory, id) else {
                return Ok(None);
            };
            if entry.run_length > 0 {
                let data = self.read_range(
                    self.header.data_offset + entry.offset,
                    u64::from(entry.length),
                )?;
                return decompress(data, self.header.tile_compression).map(Some);
            }
            directory = self.leaf(entry)?;
        }
        Err(TileError::invalid("its leaf directories nest too deeply"))
    }

    /// A leaf directory, from the cache or read from the file.
    fn leaf(&self, entry: Entry) -> Result<Arc<Vec<Entry>>, TileError> {
        if let Some(found) = self.leaves.lock().unwrap().get(&entry.offset) {
            return Ok(Arc::clone(found));
        }
        let leaf = Arc::new(self.read_directory(
            self.header.leaf_offset + entry.offset,
            u64::from(entry.length),
        )?);
        let mut cache = self.leaves.lock().unwrap();
        // Keep memory in check: when the cache is full, simply start again.
        if cache.len() >= LEAF_CACHE_SIZE {
            cache.clear();
        }
        cache.insert(entry.offset, Arc::clone(&leaf));
        Ok(leaf)
    }

    fn read_directory(&self, offset: u64, length: u64) -> Result<Vec<Entry>, TileError> {
        let bytes = decompress(
            self.read_range(offset, length)?,
            self.header.internal_compression,
        )?;
        parse_directory(&bytes)
    }

    fn read_metadata(&self) -> Result<Value, TileError> {
        if self.header.metadata_length == 0 {
            return Ok(Value::Null);
        }
        let bytes = decompress(
            self.read_range(self.header.metadata_offset, self.header.metadata_length)?,
            self.header.internal_compression,
        )?;
        // Broken metadata only loses the map's name and attribution; the tiles still work.
        Ok(serde_json::from_slice(&bytes).unwrap_or(Value::Null))
    }

    /// Reads `length` bytes starting at `offset`: one "byte range" of the file.
    fn read_range(&self, offset: u64, length: u64) -> Result<Vec<u8>, TileError> {
        // Directories and tiles are small; refuse silly lengths from a damaged file.
        if length > 64 * 1024 * 1024 {
            return Err(TileError::invalid("it asks for a block bigger than 64 MB"));
        }
        let mut buffer = vec![0u8; length as usize];
        let mut file = self.file.lock().unwrap();
        file.seek(SeekFrom::Start(offset))?;
        file.read_exact(&mut buffer)?;
        Ok(buffer)
    }
}

/// Decodes the 127-byte header. All numbers are little-endian.
fn parse_header(bytes: &[u8; HEADER_LENGTH]) -> Result<Header, TileError> {
    if &bytes[0..7] != b"PMTiles" {
        return Err(TileError::invalid("it doesn't start with \"PMTiles\""));
    }
    if bytes[7] != 3 {
        return Err(TileError::Unsupported(format!(
            "PMTiles version {} (SmartMap reads version 3)",
            bytes[7]
        )));
    }
    let u64_at = |at: usize| u64::from_le_bytes(bytes[at..at + 8].try_into().unwrap());
    // Positions are stored as whole numbers: degrees × 10,000,000.
    let degrees_at =
        |at: usize| f64::from(i32::from_le_bytes(bytes[at..at + 4].try_into().unwrap())) / 1e7;

    Ok(Header {
        root_offset: u64_at(8),
        root_length: u64_at(16),
        metadata_offset: u64_at(24),
        metadata_length: u64_at(32),
        leaf_offset: u64_at(40),
        // 48: leaf directories' length, not needed
        data_offset: u64_at(56),
        // 64..96: data length and tile counts, not needed
        // 96: "clustered" flag, not needed
        internal_compression: Compression::from_byte(bytes[97]),
        tile_compression: Compression::from_byte(bytes[98]),
        tile_type: match bytes[99] {
            1 => TileType::Vector,
            2 => TileType::Png,
            3 => TileType::Jpeg,
            4 => TileType::Webp,
            5 => TileType::Avif,
            other => {
                return Err(TileError::Unsupported(format!("PMTiles tile type {other}")));
            }
        },
        min_zoom: bytes[100],
        max_zoom: bytes[101],
        bounds: [
            degrees_at(102),
            degrees_at(106),
            degrees_at(110),
            degrees_at(114),
        ],
        center: [degrees_at(119), degrees_at(123), f64::from(bytes[118])],
    })
}

/// Undoes the compression of a directory, the metadata or a tile.
fn decompress(data: Vec<u8>, compression: Compression) -> Result<Vec<u8>, TileError> {
    match compression {
        Compression::None => Ok(data),
        Compression::Gzip => decompress_gzip(&data),
        // "Unknown" in older files usually means gzip; look at the first bytes.
        Compression::Unknown if data.starts_with(&[0x1f, 0x8b]) => decompress_gzip(&data),
        Compression::Unknown => Ok(data),
        Compression::Brotli => Err(TileError::Unsupported(
            "PMTiles compressed with Brotli (make the file with gzip compression)".into(),
        )),
        Compression::Zstd => Err(TileError::Unsupported(
            "PMTiles compressed with Zstandard (make the file with gzip compression)".into(),
        )),
    }
}

/// Decodes a directory: the number of entries, then each column in turn
/// (tile ids, run lengths, lengths, offsets), every number as a varint.
pub fn parse_directory(bytes: &[u8]) -> Result<Vec<Entry>, TileError> {
    let mut reader = Varints { bytes, at: 0 };
    let count = reader.next()? as usize;
    // Every entry takes at least 4 bytes, so a bigger count means a damaged file.
    if count > bytes.len() {
        return Err(TileError::invalid("a directory is damaged"));
    }
    let mut entries = vec![
        Entry {
            tile_id: 0,
            offset: 0,
            length: 0,
            run_length: 0
        };
        count
    ];

    // Tile ids are stored as the difference from the previous one.
    let mut last_id = 0u64;
    for entry in entries.iter_mut() {
        last_id += reader.next()?;
        entry.tile_id = last_id;
    }
    for entry in entries.iter_mut() {
        entry.run_length = reader.next()? as u32;
    }
    for entry in entries.iter_mut() {
        entry.length = reader.next()? as u32;
    }
    // An offset of 0 means "straight after the previous entry's data";
    // anything else is the offset plus 1.
    for i in 0..count {
        let value = reader.next()?;
        entries[i].offset = if value == 0 && i > 0 {
            entries[i - 1].offset + u64::from(entries[i - 1].length)
        } else {
            value.saturating_sub(1)
        };
    }
    Ok(entries)
}

/// Reads unsigned LEB128 "varints": 7 bits per byte, low bits first, the top
/// bit set on every byte except the last.
struct Varints<'a> {
    bytes: &'a [u8],
    at: usize,
}

impl Varints<'_> {
    fn next(&mut self) -> Result<u64, TileError> {
        let mut value = 0u64;
        for shift in (0..64).step_by(7) {
            let Some(&byte) = self.bytes.get(self.at) else {
                return Err(TileError::invalid("a directory ends too soon"));
            };
            self.at += 1;
            value |= u64::from(byte & 0x7f) << shift;
            if byte & 0x80 == 0 {
                return Ok(value);
            }
        }
        Err(TileError::invalid(
            "a directory has a number that's too long",
        ))
    }
}

/// The entry that holds `id`: the last one whose tile id is ≤ `id`. Whether
/// it really covers `id` depends on its run length, which the caller checks.
fn find_entry(entries: &[Entry], id: u64) -> Option<Entry> {
    // `partition_point` is a binary search: the number of entries with tile_id <= id.
    let after = entries.partition_point(|e| e.tile_id <= id);
    let entry = *entries.get(after.checked_sub(1)?)?;
    if entry.run_length == 0 || id < entry.tile_id + u64::from(entry.run_length) {
        Some(entry)
    } else {
        None
    }
}

/// The PMTiles number of tile `z/x/y`, or `None` if `x` or `y` is outside zoom `z`.
///
/// Tiles are counted zoom by zoom (zoom 0 has 1 tile, zoom 1 has 4, ...), and
/// within a zoom level in Hilbert-curve order.
pub fn tile_id(z: u8, x: u32, y: u32) -> Option<u64> {
    if z > MAX_ZOOM {
        return None;
    }
    let size = 1u64 << z;
    let (mut x, mut y) = (u64::from(x), u64::from(y));
    if x >= size || y >= size {
        return None;
    }
    // Tiles in all lower zoom levels: 1 + 4 + 16 + ... = (4^z - 1) / 3.
    let before = ((1u64 << (2 * u64::from(z))) - 1) / 3;

    // The classic Hilbert-curve "xy → d" algorithm.
    let mut d = 0u64;
    let mut s = size / 2;
    while s > 0 {
        let rx = u64::from(x & s > 0);
        let ry = u64::from(y & s > 0);
        d += s * s * ((3 * rx) ^ ry);
        // Rotate the quadrant so the curve's pieces join up.
        if ry == 0 {
            if rx == 1 {
                x = s - 1 - (x & (s - 1));
                y = s - 1 - (y & (s - 1));
            }
            std::mem::swap(&mut x, &mut y);
        }
        s /= 2;
    }
    Some(before + d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tile_ids_follow_the_spec() {
        // Values from the PMTiles reference implementations' tests.
        assert_eq!(tile_id(0, 0, 0), Some(0));
        assert_eq!(tile_id(1, 0, 0), Some(1));
        assert_eq!(tile_id(1, 0, 1), Some(2));
        assert_eq!(tile_id(1, 1, 1), Some(3));
        assert_eq!(tile_id(1, 1, 0), Some(4));
        assert_eq!(tile_id(2, 0, 0), Some(5));
        assert_eq!(tile_id(12, 3423, 1763), Some(19_078_479));
        assert_eq!(tile_id(1, 2, 0), None);
        assert_eq!(tile_id(32, 0, 0), None);
    }

    #[test]
    fn every_tile_of_a_zoom_level_gets_its_own_id() {
        let z = 4;
        let n = 1u32 << z;
        let first = tile_id(z, 0, 0).unwrap();
        let mut ids: Vec<u64> = (0..n)
            .flat_map(|x| (0..n).map(move |y| tile_id(z, x, y).unwrap()))
            .collect();
        ids.sort();
        let expected: Vec<u64> = (first..first + u64::from(n * n)).collect();
        assert_eq!(ids, expected);
    }

    #[test]
    fn reads_varints() {
        let bytes = [0x00, 0x7f, 0x80, 0x01, 0xac, 0x02];
        let mut reader = Varints {
            bytes: &bytes,
            at: 0,
        };
        assert_eq!(reader.next().unwrap(), 0);
        assert_eq!(reader.next().unwrap(), 127);
        assert_eq!(reader.next().unwrap(), 128);
        assert_eq!(reader.next().unwrap(), 300);
        assert!(reader.next().is_err());
    }

    #[test]
    fn decodes_a_directory() {
        // 3 entries: ids 5, 6, 10 (stored as 5, +1, +4); run lengths 1, 3, 0;
        // lengths 10, 20, 30; offsets 0 (stored +1), "after the previous", 100 (stored +1).
        let bytes = [3, 5, 1, 4, 1, 3, 0, 10, 20, 30, 1, 0, 101];
        let entries = parse_directory(&bytes).unwrap();
        let tuples: Vec<_> = entries
            .iter()
            .map(|e| (e.tile_id, e.run_length, e.length, e.offset))
            .collect();
        assert_eq!(tuples, [(5, 1, 10, 0), (6, 3, 20, 10), (10, 0, 30, 100)]);
    }

    #[test]
    fn finds_entries_by_run_length() {
        let entries = parse_directory(&[3, 5, 1, 4, 1, 3, 0, 10, 20, 30, 1, 0, 101]).unwrap();
        assert_eq!(find_entry(&entries, 4), None);
        assert_eq!(find_entry(&entries, 5).unwrap().tile_id, 5);
        // 6, 7 and 8 share one tile (run length 3); 9 is not in the file.
        assert_eq!(find_entry(&entries, 8).unwrap().tile_id, 6);
        assert_eq!(find_entry(&entries, 9), None);
        // Run length 0: a leaf directory covering everything from 10 on.
        assert_eq!(find_entry(&entries, 500).unwrap().tile_id, 10);
    }

    #[test]
    fn rejects_other_files() {
        let mut bytes = [0u8; HEADER_LENGTH];
        assert!(matches!(parse_header(&bytes), Err(TileError::Invalid(_))));
        bytes[..7].copy_from_slice(b"PMTiles");
        bytes[7] = 2;
        assert!(matches!(
            parse_header(&bytes),
            Err(TileError::Unsupported(_))
        ));
    }
}

//! Helpers shared by several integration test files (`mod common;`).
//!
//! Cargo treats every file directly in `tests/` as its own test program, but
//! not files in sub-folders, so shared code lives here.

// Each test program uses only some of these helpers.
#![allow(dead_code)]

use std::io::Write;
use std::path::Path;

use flate2::Compression;
use flate2::write::GzEncoder;
use smartmap_lib::tiles::pmtiles::tile_id;

pub fn gzip(data: &[u8]) -> Vec<u8> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(data).unwrap();
    encoder.finish().unwrap()
}

pub fn varint(out: &mut Vec<u8>, mut value: u64) {
    while value >= 0x80 {
        out.push((value as u8 & 0x7f) | 0x80);
        value >>= 7;
    }
    out.push(value as u8);
}

/// (tile id, offset, length, run length)
pub type Entry = (u64, u64, u32, u32);
/// A tile's address: (zoom, column, row).
pub type Zxy = (u8, u32, u32);

/// Encodes a PMTiles directory (the reverse of `pmtiles::parse_directory`), gzipped.
pub fn directory(entries: &[Entry]) -> Vec<u8> {
    let mut out = Vec::new();
    varint(&mut out, entries.len() as u64);
    let mut last = 0;
    for &(id, ..) in entries {
        varint(&mut out, id - last);
        last = id;
    }
    for &(.., run) in entries {
        varint(&mut out, u64::from(run));
    }
    for &(_, _, length, _) in entries {
        varint(&mut out, u64::from(length));
    }
    for &(_, offset, ..) in entries {
        varint(&mut out, offset + 1);
    }
    gzip(&out)
}

/// Writes a PMTiles v3 file of gzipped vector tiles. With `leaf_size`, the
/// root directory points to leaf directories of that many entries each.
pub fn write_pmtiles(path: &Path, tiles: &[(Zxy, &[u8])], leaf_size: Option<usize>) {
    let mut sorted: Vec<(u64, Vec<u8>)> = tiles
        .iter()
        .map(|&((z, x, y), data)| (tile_id(z, x, y).unwrap(), gzip(data)))
        .collect();
    sorted.sort();

    let mut data = Vec::new();
    let mut entries: Vec<Entry> = Vec::new();
    for (id, bytes) in &sorted {
        entries.push((*id, data.len() as u64, bytes.len() as u32, 1));
        data.extend_from_slice(bytes);
    }

    let (root, leaves) = match leaf_size {
        None => (directory(&entries), Vec::new()),
        Some(size) => {
            let mut leaves = Vec::new();
            let mut root_entries = Vec::new();
            for chunk in entries.chunks(size) {
                let leaf = directory(chunk);
                root_entries.push((chunk[0].0, leaves.len() as u64, leaf.len() as u32, 0));
                leaves.extend(leaf);
            }
            (directory(&root_entries), leaves)
        }
    };
    let metadata = gzip(
        br#"{"name":"Test map","attribution":"Test data","version":"4.1.0","vector_layers":[{"id":"earth"},{"id":"roads"}]}"#,
    );

    // Layout: header, root directory, metadata, leaf directories, tile data.
    let root_offset = 127u64;
    let metadata_offset = root_offset + root.len() as u64;
    let leaf_offset = metadata_offset + metadata.len() as u64;
    let data_offset = leaf_offset + leaves.len() as u64;

    let mut header = Vec::new();
    header.extend_from_slice(b"PMTiles");
    header.push(3);
    for value in [
        root_offset,
        root.len() as u64,
        metadata_offset,
        metadata.len() as u64,
        leaf_offset,
        leaves.len() as u64,
        data_offset,
        data.len() as u64,
        sorted.len() as u64,
        sorted.len() as u64,
        sorted.len() as u64,
    ] {
        header.extend_from_slice(&value.to_le_bytes());
    }
    // clustered, internal compression (gzip), tile compression (gzip), tile type (vector)
    header.extend_from_slice(&[1, 2, 2, 1]);
    let max_zoom = tiles.iter().map(|t| t.0.0).max().unwrap();
    header.extend_from_slice(&[0, max_zoom]);
    for degrees in [11.1, 43.7, 11.4, 43.9] {
        header.extend_from_slice(&((degrees * 1e7) as i32).to_le_bytes());
    }
    header.push(10); // centre zoom
    for degrees in [11.25, 43.77] {
        header.extend_from_slice(&((degrees * 1e7) as i32).to_le_bytes());
    }
    assert_eq!(header.len(), 127);

    let mut file = header;
    file.extend(root);
    file.extend(metadata);
    file.extend(leaves);
    file.extend(data);
    std::fs::write(path, file).unwrap();
}

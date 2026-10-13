//! A tiny HTTP server for trying offline basemaps in a plain browser
//! (`npm run dev`), where the desktop app's tiles:// protocol doesn't exist.
//! Development only; the app itself never uses it.
//!
//! ```sh
//! cargo run --example tile_server            # listens on http://localhost:1422
//! ```
//!
//! - `GET /open?path=/full/path/map.pmtiles` opens a file and returns its
//!   `TileInfo` as JSON (what the `open_tiles` command returns in the app).
//! - `GET /<id>/<z>/<x>/<y>` returns a tile, exactly as tiles:// does.
//!
//! In the browser, `src/lib/api.ts` talks to this server instead of Rust.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::Path;
use std::sync::Arc;

use smartmap_lib::tiles::{TileResponse, TileServer};

const ADDRESS: &str = "127.0.0.1:1422";

fn main() {
    let listener = TcpListener::bind(ADDRESS).expect("could not listen on port 1422");
    println!("Serving offline maps on http://localhost:1422 (Ctrl+C stops)");
    let server = Arc::new(TileServer::default());
    for stream in listener.incoming().flatten() {
        let server = Arc::clone(&server);
        std::thread::spawn(move || handle(stream, &server));
    }
}

/// Reads one request and answers it. Only the request line matters ("GET /path HTTP/1.1").
fn handle(mut stream: TcpStream, server: &TileServer) {
    let mut request_line = String::new();
    if BufReader::new(&stream)
        .read_line(&mut request_line)
        .is_err()
    {
        return;
    }
    let target = request_line.split_whitespace().nth(1).unwrap_or("/");
    let response = match target.strip_prefix("/open?path=") {
        Some(encoded) => match server.open(Path::new(&percent_decode(encoded))) {
            Ok(info) => TileResponse {
                status: 200,
                content_type: "application/json",
                body: serde_json::to_vec(&info).unwrap(),
            },
            Err(e) => TileResponse {
                status: 400,
                content_type: "text/plain; charset=utf-8",
                body: format!("Could not open the file: {e}").into_bytes(),
            },
        },
        None => server.respond(target),
    };
    let head = format!(
        "HTTP/1.1 {} X\r\nContent-Type: {}\r\nContent-Length: {}\r\n\
         Access-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
        response.status,
        response.content_type,
        response.body.len()
    );
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(&response.body);
}

/// Undoes `encodeURIComponent`: "%2FUsers%2Fme" → "/Users/me".
fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let hex = bytes
            .get(i + 1..i + 3)
            .and_then(|h| std::str::from_utf8(h).ok());
        match (bytes[i], hex.and_then(|h| u8::from_str_radix(h, 16).ok())) {
            (b'%', Some(byte)) => {
                out.push(byte);
                i += 3;
            }
            (byte, _) => {
                out.push(byte);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

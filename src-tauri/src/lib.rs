//! SmartMap core: the Rust side of the Tauri app.
//!
//! The UI (Svelte, in `../src`) calls the functions in [`commands`] through
//! `invoke()`. [`io`] reads data files, [`crs`] converts coordinates and
//! [`project`] saves and opens `.smartmap` project files; [`export`] writes
//! layers out as GeoJSON or GeoPackage; [`analysis`] measures lengths and areas;
//! [`tiles`] serves offline basemaps from PMTiles and MBTiles files;
//! `panics` keeps a bug (usually a library on a damaged file) from closing the app.
//! See docs/MODERNIZATION_PLAN.md.

pub mod analysis;
mod commands;
pub mod crs;
pub mod export;
// `pub` so integration tests in `tests/` can call the readers directly.
pub mod io;
mod panics;
pub mod project;
pub mod tiles;

use tauri::Manager;
use tauri::http::{Response, header};

use tiles::{TileResponse, TileServer};

/// Turns a tile (or an error) into the HTTP response the web view gets.
fn http_response(tile: TileResponse) -> Response<Vec<u8>> {
    Response::builder()
        .status(tile.status)
        .header(header::CONTENT_TYPE, tile.content_type)
        // The page (tauri://localhost) and the tiles (tiles://localhost) count
        // as different sites, so the browser needs permission to read the tiles.
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(tile.body)
        .expect("a response built from fixed parts is always valid")
}

/// Builds and runs the Tauri application. Called from `main.rs`.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Native open/save/message dialogs (Open, Save As, "save changes?").
        .plugin(tauri_plugin_dialog::init())
        // The open offline map files, shared by `open_tiles` and the tiles:// protocol.
        .manage(TileServer::default())
        // Serves offline map tiles at tiles://localhost/<id>/<z>/<x>/<y>
        // (http://tiles.localhost/... on Windows). Each request is answered on a
        // background thread, so reading tiles never holds up the window.
        .register_asynchronous_uri_scheme_protocol("tiles", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            let path = request.uri().path().to_string();
            tauri::async_runtime::spawn_blocking(move || {
                let tile = app.state::<TileServer>().respond(&path);
                responder.respond(http_response(tile));
            });
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::open_file,
            commands::load_project,
            commands::save_project,
            commands::export_layer,
            commands::measure_geometry,
            commands::open_tiles
        ])
        .run(tauri::generate_context!())
        .expect("error while running SmartMap");
}

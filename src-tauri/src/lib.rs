//! SmartMap core: the Rust side of the Tauri app.
//!
//! The UI (Svelte, in `../src`) calls the functions in [`commands`] through
//! `invoke()`. [`io`] reads data files, [`crs`] converts coordinates and
//! [`project`] saves and opens `.smartmap` project files.
//! Later build steps add `tiles` and `analysis` modules here;
//! see docs/MODERNIZATION_PLAN.md.

mod commands;
pub mod crs;
// `pub` so integration tests in `tests/` can call the readers directly.
pub mod io;
pub mod project;

/// Builds and runs the Tauri application. Called from `main.rs`.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Native open/save/message dialogs (Open, Save As, "save changes?").
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::open_file,
            commands::load_project,
            commands::save_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running SmartMap");
}

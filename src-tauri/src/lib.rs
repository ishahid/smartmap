//! SmartMap core: the Rust side of the Tauri app.
//!
//! The UI (Svelte, in `../src`) calls the functions in [`commands`] through
//! `invoke()`. Later build steps add `crs`, `project`, `tiles` and `analysis`
//! modules here; see docs/MODERNIZATION_PLAN.md.

mod commands;
// `pub` so integration tests in `tests/` can call the readers directly.
pub mod io;

/// Builds and runs the Tauri application. Called from `main.rs`.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Native open/save dialogs, used by File → Open.
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::open_layer
        ])
        .run(tauri::generate_context!())
        .expect("error while running SmartMap");
}

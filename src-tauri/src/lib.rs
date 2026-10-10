//! SmartMap core: the Rust side of the Tauri app.
//!
//! The UI (Svelte, in `../src`) calls the functions in [`commands`] through
//! `invoke()`. Later build steps add `io` (file readers), `crs`, `project`,
//! `tiles` and `analysis` modules here; see docs/MODERNIZATION_PLAN.md.

mod commands;

/// Builds and runs the Tauri application. Called from `main.rs`.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::app_info])
        .run(tauri::generate_context!())
        .expect("error while running SmartMap");
}

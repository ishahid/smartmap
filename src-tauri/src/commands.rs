//! Functions the UI can call with `invoke("<name>")`.
//!
//! Keep these thin: parse arguments, call into a module, return a serialisable
//! result. The matching TypeScript wrappers live in `src/lib/api.ts`.

use std::path::PathBuf;

use serde::Serialize;

use crate::io::{self, Layer};

/// Build information shown in the status bar.
#[derive(Debug, Serialize, PartialEq)]
pub struct AppInfo {
    pub name: &'static str,
    pub version: &'static str,
    pub os: &'static str,
    pub arch: &'static str,
}

#[tauri::command]
pub fn app_info() -> AppInfo {
    AppInfo {
        name: "SmartMap",
        version: env!("CARGO_PKG_VERSION"),
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
    }
}

/// Opens a data file and returns its layers (usually one; a GeoPackage can have several).
///
/// `async` makes Tauri run this on a background thread, so the window stays
/// responsive while a big file loads. Errors are returned as plain text,
/// which the UI shows to the user.
#[tauri::command]
pub async fn open_file(path: PathBuf) -> Result<Vec<Layer>, String> {
    io::open_file(&path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_reports_crate_version_and_platform() {
        let info = app_info();
        assert_eq!(info.name, "SmartMap");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
        assert!(!info.os.is_empty());
        assert!(!info.arch.is_empty());
    }

    #[test]
    fn app_info_serialises_with_expected_keys() {
        let json = serde_json::to_value(app_info()).unwrap();
        for key in ["name", "version", "os", "arch"] {
            assert!(json.get(key).is_some(), "missing key {key}");
        }
    }
}

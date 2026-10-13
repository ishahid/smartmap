//! Project files: saving a whole map to one `.smartmap` file and opening it again.
//!
//! A project is a JSON file like this:
//!
//! ```json
//! {
//!   "format": "smartmap-project",
//!   "version": 1,
//!   "view": { "center": [73.05, 33.6], "zoom": 4, "bearing": 0, "pitch": 0 },
//!   "basemap": "liberty",
//!   "globe": false,
//!   "layers": [
//!     { "path": "data/world.shp", "absolutePath": "/Users/me/maps/data/world.shp",
//!       "table": null, "name": "world", "visible": true, "opacity": 1, "style": { ... } }
//!   ],
//!   "annotations": []
//! }
//! ```
//!
//! It holds *references* to data files, not the data itself. Layers are listed
//! bottom first, the order they're drawn in.
//!
//! **Paths.** The UI always works with absolute paths. On save, each layer's
//! path is written *relative to the folder the project is in* ("data/world.shp"),
//! with `/` separators so the same file works on Windows, macOS and Linux. That
//! way a folder holding a project and its data can be moved or copied as a whole.
//! The absolute path is saved too, as a fallback for when only the project file
//! moves. On load, paths are turned back into absolute ones.
//!
//! **Styles** are written exactly as the UI sends them. Rust doesn't look inside;
//! the style format belongs to the UI (`LayerStyle` in src/lib/style/types.ts).

use std::fs;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Marks a JSON file as a SmartMap project (other JSON files are rejected).
pub const FORMAT: &str = "smartmap-project";
/// The project format version this build writes. Bump it when the format
/// changes in a way older builds can't read, and teach [`load`] to upgrade old files.
pub const VERSION: u64 = 1;
/// File extension for project files. Keep in step with `PROJECT_EXTENSION` in src/lib/api.ts.
pub const EXTENSION: &str = "smartmap";

/// A project as the UI sends and receives it, with absolute layer paths.
///
/// `#[serde(default)]` on the struct fills in anything missing from the file
/// (an empty layer list, `globe: false`, ...), so a hand-written or older
/// project still opens. Unknown fields are ignored.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Project {
    pub view: View,
    /// Basemap id from src/lib/map/basemaps.ts, e.g. "liberty".
    pub basemap: String,
    pub globe: bool,
    /// Data layers, bottom first.
    pub layers: Vec<ProjectLayer>,
    /// Annotation layers as GeoJSON. Drawing arrives in build step 7; until then
    /// this is always empty, but older/newer files keep whatever they hold.
    pub annotations: Vec<Value>,
}

/// Where the map was looking.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct View {
    /// [longitude, latitude]
    pub center: [f64; 2],
    pub zoom: f64,
    /// Rotation in degrees, 0 = north up.
    pub bearing: f64,
    /// Tilt in degrees, 0 = looking straight down.
    pub pitch: f64,
}

/// One data layer in a project.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectLayer {
    /// The data file. Absolute when talking to the UI; relative to the
    /// project's folder inside the file (when the two are on the same drive).
    pub path: String,
    /// Only used inside the file: the absolute path at save time, tried when
    /// `path` doesn't exist (the project was moved without its data).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub absolute_path: Option<String>,
    /// Which table of a GeoPackage this is; `None` for single-layer formats.
    #[serde(default)]
    pub table: Option<String>,
    pub name: String,
    #[serde(default = "default_visible")]
    pub visible: bool,
    #[serde(default = "default_opacity")]
    pub opacity: f64,
    /// The layer's style, kept as raw JSON (see the module docs).
    #[serde(default)]
    pub style: Value,
}

// serde's `default = "..."` needs functions, not values.
fn default_visible() -> bool {
    true
}
fn default_opacity() -> f64 {
    1.0
}

/// Everything that can go wrong opening or saving a project.
#[derive(Debug, thiserror::Error)]
pub enum ProjectError {
    #[error("could not read {path}: {source}")]
    Read {
        path: String,
        #[source]
        source: std::io::Error,
    },

    #[error("could not save {path}: {source}")]
    Write {
        path: String,
        #[source]
        source: std::io::Error,
    },

    #[error("{path} isn't a SmartMap project: {message}")]
    Invalid { path: String, message: String },

    #[error(
        "{path} was saved by a newer SmartMap (project version {version}); update SmartMap to open it"
    )]
    TooNew { path: String, version: u64 },
}

/// Reads a project file and returns it with absolute layer paths.
///
/// Missing data files are *not* an error here: the UI opens the layers one by
/// one and reports any it can't find.
pub fn load(path: &Path) -> Result<Project, ProjectError> {
    let path = absolute(path);
    let shown = path.display().to_string();
    let invalid = |message: String| ProjectError::Invalid {
        path: shown.clone(),
        message,
    };

    let text = fs::read_to_string(&path).map_err(|source| ProjectError::Read {
        path: shown.clone(),
        source,
    })?;

    // Parse to a generic JSON value first, so we can check the marker and
    // version and give a clear message before looking at the details.
    let json: Value =
        serde_json::from_str(&text).map_err(|e| invalid(format!("it isn't valid JSON ({e})")))?;
    if json.get("format").and_then(Value::as_str) != Some(FORMAT) {
        return Err(invalid(format!(
            "it has no \"format\": \"{FORMAT}\" marker"
        )));
    }
    let version = json.get("version").and_then(Value::as_u64).unwrap_or(0);
    if version > VERSION {
        return Err(ProjectError::TooNew {
            path: shown,
            version,
        });
    }
    let mut project: Project = serde_json::from_value(json).map_err(|e| invalid(e.to_string()))?;

    let folder = project_folder(&path);
    for layer in &mut project.layers {
        let resolved = resolve_path(&layer.path, &folder);
        // `take()` empties the field: the UI only ever sees `path`.
        let fallback = layer.absolute_path.take().map(PathBuf::from);
        let chosen = match fallback {
            Some(old) if !resolved.exists() && old.exists() => old,
            _ => resolved,
        };
        layer.path = chosen.display().to_string();
    }
    Ok(project)
}

/// Writes a project file, storing layer paths relative to the project's folder.
pub fn save(path: &Path, project: &Project) -> Result<(), ProjectError> {
    let path = absolute(path);
    let folder = project_folder(&path);

    let mut on_disk = project.clone();
    for layer in &mut on_disk.layers {
        let full = absolute(Path::new(&layer.path));
        layer.absolute_path = None;
        if let Some(relative) = relative_path(&full, &folder) {
            layer.path = relative;
            layer.absolute_path = Some(full.display().to_string());
        }
    }

    // Put the marker and version first, so they're the first thing a person
    // opening the file in a text editor sees. (`preserve_order` keeps this order.)
    let mut file = serde_json::Map::new();
    file.insert("format".into(), FORMAT.into());
    file.insert("version".into(), VERSION.into());
    if let Value::Object(fields) =
        serde_json::to_value(&on_disk).expect("a Project always converts to JSON")
    {
        file.extend(fields);
    }
    let mut text = serde_json::to_string_pretty(&Value::Object(file))
        .expect("a JSON value always converts to text");
    text.push('\n');

    write_safely(&path, text.as_bytes()).map_err(|source| ProjectError::Write {
        path: path.display().to_string(),
        source,
    })
}

/// Writes to a temporary file next to `path` and then renames it into place,
/// so a crash or full disk halfway through never leaves a half-written project.
fn write_safely(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    let mut temp_name = path.file_name().unwrap_or_default().to_os_string();
    temp_name.push(".saving");
    let temp = path.with_file_name(temp_name);
    fs::write(&temp, contents)
        .and_then(|()| fs::rename(&temp, path))
        .inspect_err(|_| {
            let _ = fs::remove_file(&temp);
        })
}

/// The folder a project file is in, which relative layer paths start from.
fn project_folder(project_path: &Path) -> PathBuf {
    project_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default()
}

/// Makes a path absolute (against the current folder) and tidies it, without
/// touching the disk.
fn absolute(path: &Path) -> PathBuf {
    normalize(&std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf()))
}

/// Writes `target` relative to the folder `base`, with `/` separators:
/// `/maps/data/world.shp` from `/maps` is `data/world.shp`, and from
/// `/maps/projects` it is `../data/world.shp`.
///
/// Returns `None` when there's no relative path, e.g. different Windows drives
/// (`D:\data` from `C:\maps`), or when either path isn't absolute.
pub fn relative_path(target: &Path, base: &Path) -> Option<String> {
    let target = normalize(target);
    let base = normalize(base);
    if !target.is_absolute() || !base.is_absolute() {
        return None;
    }
    let target: Vec<Component> = target.components().collect();
    let base: Vec<Component> = base.components().collect();
    // The first component is the drive (Windows) or the root (`/`); they must match.
    if target.first() != base.first() {
        return None;
    }

    // Skip the folders both paths share, then climb out of the rest of `base`
    // with ".." and walk down the rest of `target`.
    let shared = target.iter().zip(&base).take_while(|(a, b)| a == b).count();
    let mut parts: Vec<String> = vec!["..".to_string(); base.len() - shared];
    parts.extend(
        target[shared..]
            .iter()
            .map(|part| part.as_os_str().to_string_lossy().into_owned()),
    );
    Some(parts.join("/"))
}

/// Turns a path from a project file back into an absolute path. Relative paths
/// are taken from `base`; absolute ones are kept.
pub fn resolve_path(stored: &str, base: &Path) -> PathBuf {
    let stored_path = Path::new(stored);
    if stored_path.is_absolute() {
        return normalize(stored_path);
    }
    // Saved paths use `/`. Adding them a piece at a time gives this OS's
    // separator in the result (`\` on Windows), which looks right in the UI.
    let mut full = base.to_path_buf();
    for part in stored.split('/') {
        full.push(part);
    }
    normalize(&full)
}

/// Removes `.` and resolves `..` in a path by looking at its text only:
/// `/maps/projects/../data/./world.shp` becomes `/maps/data/world.shp`.
fn normalize(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => match result.components().next_back() {
                // "folder/.." cancels out.
                Some(Component::Normal(_)) => {
                    result.pop();
                }
                // There's nothing above the root, so "/.." is just "/".
                Some(Component::RootDir | Component::Prefix(_)) => {}
                // A relative path that starts by going up keeps its "..".
                _ => result.push(".."),
            },
            other => result.push(other.as_os_str()),
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_tidies_dots() {
        assert_eq!(
            normalize(Path::new("/maps/projects/../data/./world.shp")),
            PathBuf::from("/maps/data/world.shp")
        );
        assert_eq!(normalize(Path::new("/../x")), PathBuf::from("/x"));
        assert_eq!(normalize(Path::new("../../x")), PathBuf::from("../../x"));
        assert_eq!(normalize(Path::new("a/../../x")), PathBuf::from("../x"));
    }

    // Unix-style paths are only absolute on Unix; Windows gets its own tests below.
    #[cfg(unix)]
    #[test]
    fn relative_paths_on_unix() {
        let rel = |target: &str, base: &str| relative_path(Path::new(target), Path::new(base));
        assert_eq!(
            rel("/maps/data/world.shp", "/maps"),
            Some("data/world.shp".into())
        );
        assert_eq!(rel("/maps/world.shp", "/maps"), Some("world.shp".into()));
        assert_eq!(
            rel("/maps/data/world.shp", "/maps/projects/2026"),
            Some("../../data/world.shp".into())
        );
        assert_eq!(
            rel("/other/world.shp", "/maps"),
            Some("../other/world.shp".into())
        );
        assert_eq!(rel("data/world.shp", "/maps"), None);
    }

    #[cfg(unix)]
    #[test]
    fn resolve_undoes_relative_path() {
        let base = Path::new("/maps/projects");
        for target in [
            "/maps/data/world.shp",
            "/maps/projects/a b/c.gpkg",
            "/x.csv",
        ] {
            let stored = relative_path(Path::new(target), base).unwrap();
            assert_eq!(
                resolve_path(&stored, base),
                PathBuf::from(target),
                "via {stored}"
            );
        }
        assert_eq!(
            resolve_path("/abs/x.shp", base),
            PathBuf::from("/abs/x.shp")
        );
    }

    #[cfg(windows)]
    #[test]
    fn relative_paths_on_windows() {
        let rel = |target: &str, base: &str| relative_path(Path::new(target), Path::new(base));
        assert_eq!(
            rel(r"C:\maps\data\world.shp", r"C:\maps"),
            Some("data/world.shp".into())
        );
        assert_eq!(
            rel(r"C:\data\world.shp", r"C:\maps\p"),
            Some("../../data/world.shp".into())
        );
        // Different drives can't be reached with "..", so the absolute path is kept.
        assert_eq!(rel(r"D:\data\world.shp", r"C:\maps"), None);
        assert_eq!(
            resolve_path("../data/world.shp", Path::new(r"C:\maps\p")),
            PathBuf::from(r"C:\maps\data\world.shp")
        );
    }

    #[test]
    fn missing_fields_get_defaults() {
        let layer: ProjectLayer =
            serde_json::from_str(r#"{ "path": "a.shp", "name": "a" }"#).unwrap();
        assert!(layer.visible);
        assert_eq!(layer.opacity, 1.0);
        assert_eq!(layer.table, None);
        assert_eq!(layer.style, Value::Null);

        let project: Project = serde_json::from_str("{}").unwrap();
        assert_eq!(project, Project::default());
    }

    #[test]
    fn absolute_path_is_left_out_when_absent() {
        let layer = ProjectLayer {
            path: "/a.shp".into(),
            absolute_path: None,
            table: Some("roads".into()),
            name: "a".into(),
            visible: false,
            opacity: 0.5,
            style: Value::Null,
        };
        let json = serde_json::to_value(&layer).unwrap();
        assert!(json.get("absolutePath").is_none());
        assert_eq!(json["table"], "roads");
    }
}

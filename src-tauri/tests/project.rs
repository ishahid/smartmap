//! Saving and reopening `.smartmap` project files, including what happens to
//! layer paths when projects and data are moved.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Value, json};
use smartmap_lib::project::{self, Project, ProjectLayer, View};

/// A project with one layer per path, and a style with nested values to check
/// that styles survive untouched.
fn sample_project(paths: &[&Path]) -> Project {
    Project {
        view: View {
            center: [73.05, 33.6],
            zoom: 6.5,
            bearing: 15.0,
            pitch: 30.0,
        },
        basemap: "positron".into(),
        globe: true,
        layers: paths
            .iter()
            .enumerate()
            .map(|(i, path)| ProjectLayer {
                path: path.display().to_string(),
                absolute_path: None,
                table: (i == 1).then(|| "roads".to_string()),
                name: format!("layer {i}"),
                visible: i == 0,
                opacity: 0.75,
                style: json!({
                    "kind": "categorized",
                    "color": "#3366cc",
                    "field": "TYPE",
                    "categories": [{ "value": "A", "color": "#ff0000" }, { "value": "", "color": "#00ff00" }],
                    "label": { "field": null, "size": 12, "color": "#222222" },
                }),
                filter: json!({
                    "match": "any",
                    "conditions": [{ "field": "POP", "operator": ">", "value": "1000" }],
                }),
            })
            .collect(),
        annotations: vec![],
    }
}

/// Makes an empty file (and its folders), so "does it exist" checks pass.
fn touch(path: &Path) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, "").unwrap();
}

fn read_json(path: &Path) -> Value {
    serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
}

#[test]
fn save_then_load_restores_everything() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("maps");
    let world = root.join("data").join("world.shp");
    let roads = root.join("data").join("roads.gpkg");
    touch(&world);
    touch(&roads);
    let project_path = root.join("trip.smartmap");

    let original = sample_project(&[&world, &roads]);
    project::save(&project_path, &original).unwrap();
    let loaded = project::load(&project_path).unwrap();

    assert_eq!(loaded, original);
}

#[test]
fn saved_file_has_marker_first_and_relative_paths() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("maps");
    let world = root.join("data").join("world.shp");
    touch(&world);
    let project_path = root.join("projects").join("trip.smartmap");
    fs::create_dir_all(project_path.parent().unwrap()).unwrap();

    project::save(&project_path, &sample_project(&[&world])).unwrap();

    let saved = read_json(&project_path);
    let keys: Vec<&String> = saved.as_object().unwrap().keys().collect();
    assert_eq!(keys[..2], ["format", "version"]);
    assert_eq!(saved["format"], project::FORMAT);
    assert_eq!(saved["version"], project::VERSION);
    let layer = &saved["layers"][0];
    assert_eq!(layer["path"], "../data/world.shp");
    assert_eq!(layer["absolutePath"], world.display().to_string());
    // No temporary file is left behind.
    assert!(!root.join("projects").join("trip.smartmap.saving").exists());
}

#[test]
fn moving_project_and_data_together_keeps_layers() {
    let dir = tempfile::tempdir().unwrap();
    let old_root = dir.path().join("maps");
    let world = old_root.join("data").join("world.shp");
    touch(&world);
    project::save(&old_root.join("trip.smartmap"), &sample_project(&[&world])).unwrap();

    // Move the whole folder, as when copying it to another computer.
    let new_root = dir.path().join("moved");
    fs::rename(&old_root, &new_root).unwrap();

    let loaded = project::load(&new_root.join("trip.smartmap")).unwrap();
    assert_eq!(
        PathBuf::from(&loaded.layers[0].path),
        new_root.join("data").join("world.shp")
    );
}

#[test]
fn moving_only_the_project_falls_back_to_the_absolute_path() {
    let dir = tempfile::tempdir().unwrap();
    let world = dir.path().join("data").join("world.shp");
    touch(&world);
    let first = dir.path().join("trip.smartmap");
    project::save(&first, &sample_project(&[&world])).unwrap();

    // Move just the project file into another folder; "data/world.shp" is now wrong.
    let elsewhere = dir.path().join("elsewhere");
    fs::create_dir_all(&elsewhere).unwrap();
    let moved = elsewhere.join("trip.smartmap");
    fs::rename(&first, &moved).unwrap();

    let loaded = project::load(&moved).unwrap();
    assert_eq!(PathBuf::from(&loaded.layers[0].path), world);
}

#[test]
fn missing_data_still_loads_with_the_expected_path() {
    // The UI reports missing files; loading the project itself must not fail.
    let dir = tempfile::tempdir().unwrap();
    let gone = dir.path().join("data").join("gone.shp");
    let project_path = dir.path().join("trip.smartmap");
    project::save(&project_path, &sample_project(&[&gone])).unwrap();

    let loaded = project::load(&project_path).unwrap();
    assert_eq!(PathBuf::from(&loaded.layers[0].path), gone);
}

#[test]
fn saving_over_an_existing_project_replaces_it() {
    let dir = tempfile::tempdir().unwrap();
    let project_path = dir.path().join("trip.smartmap");
    project::save(&project_path, &sample_project(&[])).unwrap();

    let mut changed = sample_project(&[]);
    changed.basemap = "bright".into();
    project::save(&project_path, &changed).unwrap();

    assert_eq!(project::load(&project_path).unwrap().basemap, "bright");
}

#[test]
fn rejects_files_that_are_not_projects() {
    let dir = tempfile::tempdir().unwrap();
    let check = |name: &str, contents: &str, expected: &str| {
        let path = dir.path().join(name);
        fs::write(&path, contents).unwrap();
        let message = project::load(&path).unwrap_err().to_string();
        assert!(message.contains(expected), "{name}: {message}");
    };

    check("garbage.smartmap", "not json at all", "isn't valid JSON");
    check(
        "geo.smartmap",
        r#"{ "type": "FeatureCollection" }"#,
        "marker",
    );
    check(
        "future.smartmap",
        r#"{ "format": "smartmap-project", "version": 99 }"#,
        "newer SmartMap",
    );
    check(
        "broken.smartmap",
        r#"{ "format": "smartmap-project", "version": 1, "layers": [{ "name": "no path" }] }"#,
        "missing field `path`",
    );

    let missing = project::load(&dir.path().join("nope.smartmap")).unwrap_err();
    assert!(missing.to_string().contains("could not read"), "{missing}");
}

#[test]
fn minimal_project_opens_with_defaults() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("min.smartmap");
    fs::write(&path, r#"{ "format": "smartmap-project", "version": 1 }"#).unwrap();

    let loaded = project::load(&path).unwrap();
    assert!(loaded.layers.is_empty());
    assert!(!loaded.globe);
}

#[test]
fn ui_json_round_trips_and_reopens_real_data() {
    // Exactly the shape `saveProject` in src/lib/api.ts sends, pointing at a
    // real sample file, copied next to the project like a user's data folder.
    let dir = tempfile::tempdir().unwrap();
    let samples = Path::new(env!("CARGO_MANIFEST_DIR")).join("../legacy/source/data");
    let data = dir.path().join("data");
    fs::create_dir_all(&data).unwrap();
    // The 2004 samples are bare .shp files (no .dbf), which SmartMap reads fine.
    fs::copy(samples.join("world.shp"), data.join("world.shp")).unwrap();
    let world = data.join("world.shp");
    // Numbers are written as floats (4.0) because that's how Rust sends them
    // back; JavaScript doesn't tell 4 and 4.0 apart.
    let from_ui = json!({
        "view": { "center": [73.05, 33.6], "zoom": 4.0, "bearing": 0.0, "pitch": 0.0 },
        "basemap": "liberty",
        "globe": false,
        "layers": [{
            "path": world.display().to_string(),
            "table": null,
            "name": "World",
            "visible": true,
            "opacity": 0.8,
            "style": { "kind": "single", "color": "#3366cc", "label": { "field": "NAME" } },
            "filter": null,
        }],
        "annotations": [],
    });
    let project: Project = serde_json::from_value(from_ui.clone()).unwrap();
    let project_path = dir.path().join("world.smartmap");
    project::save(&project_path, &project).unwrap();
    assert_eq!(
        read_json(&project_path)["layers"][0]["path"],
        "data/world.shp"
    );

    let loaded = project::load(&project_path).unwrap();
    // What goes back to the UI is what came from it.
    assert_eq!(serde_json::to_value(&loaded).unwrap(), from_ui);
    let layers = smartmap_lib::io::open_file(Path::new(&loaded.layers[0].path)).unwrap();
    assert_eq!(layers[0].feature_count, 251);
}

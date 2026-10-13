//! Measuring real data: the 2004 world map's countries should add up to
//! roughly the Earth's land area.

use std::path::Path;

use smartmap_lib::analysis::measure;
use smartmap_lib::io::open_file;

#[test]
fn world_countries_add_up_to_the_land_area() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../legacy/source/data/world.shp");
    let layer = &open_file(&path).unwrap()[0];
    let total_km2: f64 = layer
        .geojson
        .features
        .iter()
        .filter_map(|f| f.geometry.as_ref())
        .map(|g| measure(&g.value).unwrap().area)
        .sum::<f64>()
        / 1e6;
    // The Earth's land area is about 149 million km². The 2004 map is simplified
    // and its coastlines are rough, so allow some slack, but a ring measured
    // "inside out" would add hundreds of millions.
    assert!(
        (135e6..165e6).contains(&total_km2),
        "total land area {total_km2:.0} km²"
    );
}

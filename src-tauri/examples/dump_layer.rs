//! Prints a data file's layers as the JSON the UI receives (a list, because a
//! GeoPackage can hold several). Handy for debugging readers:
//!
//! ```text
//! cargo run --example dump_layer -- ../legacy/source/data/world.shp > world.json
//! ```

fn main() {
    let Some(path) = std::env::args().nth(1) else {
        eprintln!("usage: dump_layer <data file>");
        std::process::exit(2);
    };
    match smartmap_lib::io::open_file(std::path::Path::new(&path)) {
        Ok(layers) => println!(
            "{}",
            serde_json::to_string(&layers).expect("layers serialise")
        ),
        Err(e) => {
            eprintln!("error: {e}");
            std::process::exit(1);
        }
    }
}

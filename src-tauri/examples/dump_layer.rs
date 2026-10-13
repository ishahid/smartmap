//! Prints a data file as the JSON the UI receives. Handy for debugging readers:
//!
//! ```text
//! cargo run --example dump_layer -- ../legacy/source/data/world.shp > world.json
//! ```

fn main() {
    let Some(path) = std::env::args().nth(1) else {
        eprintln!("usage: dump_layer <file.shp>");
        std::process::exit(2);
    };
    match smartmap_lib::io::open_layer(std::path::Path::new(&path)) {
        Ok(layer) => println!(
            "{}",
            serde_json::to_string(&layer).expect("layer serialises")
        ),
        Err(e) => {
            eprintln!("error: {e}");
            std::process::exit(1);
        }
    }
}

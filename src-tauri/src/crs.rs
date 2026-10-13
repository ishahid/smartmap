//! Coordinate reference systems (CRS) and reprojection.
//!
//! Map data can be stored in many coordinate systems: plain longitude/latitude
//! (EPSG:4326), Web Mercator metres (EPSG:3857), UTM zones, national grids...
//! MapLibre wants longitude/latitude on the WGS84 datum, so every reader tells
//! us what its file uses (a [`SourceCrs`]) and [`Reprojector`] converts the
//! coordinates before the layer goes to the UI.
//!
//! The maths comes from `proj4rs`, a pure-Rust port of PROJ.4. It doesn't read
//! WKT (the text format in `.prj` files), so we try, in order:
//!
//! 1. an EPSG code written inside the WKT (`AUTHORITY["EPSG","32643"]`), looked
//!    up in the EPSG table that ships with `proj4rs`;
//! 2. `proj4wkt`, which translates WKT into a PROJ.4 string;
//! 3. a few well-known ESRI names (`.prj` files from ArcGIS often have no code).

use std::fmt;

use geojson::{Geometry, GeometryValue, Position};
use proj4rs::proj::Proj;

/// What a file says about its coordinate system.
#[derive(Debug, Clone, PartialEq)]
pub enum SourceCrs {
    /// The file doesn't say. We assume longitude/latitude (and warn if the
    /// numbers don't look like it).
    Unknown,
    /// An EPSG code, e.g. 4326 or 32643. See <https://epsg.io>.
    Epsg(u32),
    /// A WKT (well-known text) definition, e.g. the contents of a `.prj` file.
    Wkt(String),
}

/// A source CRS that couldn't be turned into a working projection.
#[derive(Debug, Clone, PartialEq)]
pub struct CrsError(String);

impl fmt::Display for CrsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// The PROJ.4 definition of WGS84 longitude/latitude, the map's own CRS.
const WGS84: &str = "+proj=longlat +datum=WGS84 +no_defs";

/// Converts coordinates from one file's CRS to WGS84 longitude/latitude.
pub struct Reprojector {
    /// Short description for the UI, e.g. "EPSG:32643" or "WGS 84 / UTM zone 43N".
    pub label: String,
    /// `None` when the data is already WGS84 longitude/latitude.
    from: Option<Proj>,
    to: Proj,
}

impl Reprojector {
    /// Works out how to convert from `source` to WGS84.
    pub fn new(source: &SourceCrs) -> Result<Self, CrsError> {
        let to = Proj::from_proj_string(WGS84).expect("WGS84 definition is valid");
        let (label, from) = match source {
            SourceCrs::Unknown => ("unknown (assumed WGS 84)".to_string(), None),
            SourceCrs::Epsg(code) => (format!("EPSG:{code}"), proj_for_epsg(*code)?),
            SourceCrs::Wkt(wkt) => proj_for_wkt(wkt)?,
        };
        Ok(Reprojector { label, from, to })
    }

    /// True if coordinates actually change (false for data already in WGS84).
    pub fn is_needed(&self) -> bool {
        self.from.is_some()
    }

    /// Reprojects every position of `geometry` in place.
    /// Returns how many points couldn't be converted (they're left as NaN).
    pub fn geometry(&self, geometry: &mut Geometry) -> usize {
        let Some(from) = &self.from else { return 0 };
        let mut failures = 0;
        for_each_position(&mut geometry.value, &mut |position| {
            if !self.point(from, position) {
                failures += 1;
            }
        });
        failures
    }

    /// Reprojects one position. Returns false if it failed.
    fn point(&self, from: &Proj, position: &mut Position) -> bool {
        if position.len() < 2 {
            return false;
        }
        let (x, y) = (position[0], position[1]);
        // proj4rs works in radians for longitude/latitude, so convert on the way
        // in (if the source is geographic) and on the way out (WGS84 always is).
        let mut point = if from.is_latlong() {
            (x.to_radians(), y.to_radians(), 0.0)
        } else {
            (x, y, 0.0)
        };
        let ok = proj4rs::transform::transform(from, &self.to, &mut point).is_ok();
        let (lon, lat) = (point.0.to_degrees(), point.1.to_degrees());
        position[0] = lon;
        position[1] = lat;
        ok && lon.is_finite() && lat.is_finite()
    }
}

/// Calls `f` on every coordinate in a geometry, however deeply nested.
pub fn for_each_position(value: &mut GeometryValue, f: &mut impl FnMut(&mut Position)) {
    match value {
        GeometryValue::Point { coordinates } => f(coordinates),
        GeometryValue::MultiPoint { coordinates } | GeometryValue::LineString { coordinates } => {
            coordinates.iter_mut().for_each(f)
        }
        GeometryValue::MultiLineString { coordinates } | GeometryValue::Polygon { coordinates } => {
            coordinates.iter_mut().flatten().for_each(f)
        }
        GeometryValue::MultiPolygon { coordinates } => {
            coordinates.iter_mut().flatten().flatten().for_each(f)
        }
        GeometryValue::GeometryCollection { geometries } => {
            for geometry in geometries {
                for_each_position(&mut geometry.value, f);
            }
        }
    }
}

/// EPSG codes that mean "WGS84 longitude/latitude", so need no conversion.
/// 4326 is the usual one; CRS84 (written as 84 by some tools) is the same with
/// longitude first, which is what GeoJSON always uses anyway.
fn is_wgs84(code: u32) -> bool {
    matches!(code, 4326 | 84)
}

fn proj_for_epsg(code: u32) -> Result<Option<Proj>, CrsError> {
    if is_wgs84(code) {
        return Ok(None);
    }
    // Old ESRI and Google codes for Web Mercator, still common in the wild.
    let code = match code {
        900913 | 102100 | 102113 => 3857,
        other => other,
    };
    let unknown = || {
        CrsError(format!(
            "EPSG:{code} isn't in SmartMap's coordinate system table"
        ))
    };
    let short_code = u16::try_from(code).map_err(|_| unknown())?;
    Proj::from_epsg_code(short_code)
        .map(Some)
        .map_err(|_| unknown())
}

/// Turns WKT into a projection. Returns the label to show and the projection.
fn proj_for_wkt(wkt: &str) -> Result<(String, Option<Proj>), CrsError> {
    let name = wkt_name(wkt).unwrap_or_else(|| "custom".to_string());

    // 1. An EPSG code at the top level of the WKT is the most reliable.
    if let Some(code) = wkt_epsg_code(wkt)
        && let Ok(proj) = proj_for_epsg(code)
    {
        return Ok((format!("EPSG:{code} ({name})"), proj));
    }

    // 2. A WGS84 geographic CRS needs nothing doing, whatever it's called.
    if is_wgs84_geographic(wkt) {
        return Ok((name, None));
    }

    // 3. Well-known ESRI names that don't carry a code.
    if let Some(code) = esri_name_to_epsg(&name)
        && let Ok(proj) = proj_for_epsg(code)
    {
        return Ok((format!("EPSG:{code} ({name})"), proj));
    }

    // 4. Translate the WKT parameters into a PROJ.4 string.
    let proj = proj4wkt::wkt_to_projstring(wkt)
        .ok()
        .and_then(|projstring| Proj::from_proj_string(&projstring).ok())
        .ok_or_else(|| {
            CrsError(format!(
                "SmartMap can't convert from the coordinate system \"{name}\""
            ))
        })?;
    Ok((name, Some(proj)))
}

/// The CRS name: the first quoted string, e.g. `PROJCS["WGS 84 / UTM zone 43N",...`.
fn wkt_name(wkt: &str) -> Option<String> {
    let start = wkt.find('"')? + 1;
    let length = wkt[start..].find('"')?;
    Some(wkt[start..start + length].to_string())
}

/// True for a WKT that is just longitude/latitude on the WGS84 datum.
fn is_wgs84_geographic(wkt: &str) -> bool {
    let upper = wkt.trim_start().to_ascii_uppercase();
    let geographic = upper.starts_with("GEOGCS[")
        || upper.starts_with("GEOGCRS[")
        || upper.starts_with("GEODCRS[");
    geographic
        && (upper.contains("WGS_1984") || upper.contains("WGS 84") || upper.contains("WGS84"))
}

/// Finds the EPSG code that belongs to the whole CRS (not to a part of it).
///
/// WKT nests: a projected CRS contains a geographic CRS, which contains a
/// datum, each with its own `AUTHORITY["EPSG", ...]` (WKT1) or `ID["EPSG", ...]`
/// (WKT2). The one we want sits directly inside the outermost brackets, so
/// track the bracket depth while scanning.
pub fn wkt_epsg_code(wkt: &str) -> Option<u32> {
    let mut depth = 0;
    let mut in_quotes = false;
    let mut found = None;
    for (index, ch) in wkt.char_indices() {
        match ch {
            '"' => in_quotes = !in_quotes,
            '[' | '(' if !in_quotes => {
                depth += 1;
                // `depth == 2` means this bracket opens a keyword that is a direct
                // child of the outer CRS, e.g. the `[` in `AUTHORITY[`.
                if depth == 2 {
                    let keyword = wkt[..index]
                        .rsplit(|c: char| !c.is_ascii_alphabetic())
                        .next()
                        .unwrap_or("")
                        .to_ascii_uppercase();
                    if keyword == "AUTHORITY" || keyword == "ID" {
                        found = parse_authority(&wkt[index + 1..]).or(found);
                    }
                }
            }
            ']' | ')' if !in_quotes => depth -= 1,
            _ => {}
        }
    }
    found
}

/// Parses `"EPSG","32643"]` or `"EPSG",32643]` (the text after `AUTHORITY[`).
fn parse_authority(args: &str) -> Option<u32> {
    let end = args.find([']', ')'])?;
    let mut parts = args[..end]
        .split(',')
        .map(|part| part.trim().trim_matches('"'));
    let authority = parts.next()?;
    let code = parts.next()?;
    if authority.eq_ignore_ascii_case("EPSG") {
        code.parse().ok()
    } else {
        None
    }
}

/// Maps a few common ESRI CRS names (which `.prj` files from ArcGIS use
/// without any code) to EPSG codes.
fn esri_name_to_epsg(name: &str) -> Option<u32> {
    let name = name.to_ascii_uppercase();
    if name.contains("WEB_MERCATOR")
        || name.contains("PSEUDO-MERCATOR")
        || name.contains("PSEUDO_MERCATOR")
    {
        return Some(3857);
    }
    // "WGS_1984_UTM_Zone_43N" → 32643, "WGS_1984_UTM_Zone_33S" → 32733.
    let zone = name.strip_prefix("WGS_1984_UTM_ZONE_")?;
    let (number, hemisphere) = zone.split_at(zone.len().checked_sub(1)?);
    let number: u32 = number.parse().ok().filter(|n| (1..=60).contains(n))?;
    match hemisphere {
        "N" => Some(32600 + number),
        "S" => Some(32700 + number),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Reprojects one point and returns (longitude, latitude).
    fn to_wgs84(source: &SourceCrs, x: f64, y: f64) -> (f64, f64) {
        let reprojector = Reprojector::new(source).unwrap();
        let mut geometry = Geometry::new_point([x, y]);
        assert_eq!(reprojector.geometry(&mut geometry), 0);
        let GeometryValue::Point { coordinates } = geometry.value else {
            unreachable!()
        };
        (coordinates[0], coordinates[1])
    }

    fn assert_close(actual: (f64, f64), expected: (f64, f64), tolerance: f64) {
        assert!(
            (actual.0 - expected.0).abs() < tolerance && (actual.1 - expected.1).abs() < tolerance,
            "got {actual:?}, expected {expected:?}"
        );
    }

    /// Web Mercator has a closed-form inverse, so we can check it exactly:
    /// lon = x / R, lat = 2·atan(e^(y/R)) − π/2, with R = 6378137 m.
    #[test]
    fn web_mercator_matches_the_formula() {
        let r = 6_378_137.0_f64;
        let (x, y) = (8_131_000.0, 3_975_000.0);
        let expected = (
            (x / r).to_degrees(),
            (2.0 * (y / r).exp().atan() - std::f64::consts::FRAC_PI_2).to_degrees(),
        );
        assert_close(to_wgs84(&SourceCrs::Epsg(3857), x, y), expected, 1e-9);
        // The old ESRI code means the same thing.
        assert_close(to_wgs84(&SourceCrs::Epsg(102100), x, y), expected, 1e-9);
    }

    /// On a UTM zone's central meridian at the equator, easting is exactly
    /// 500 000 m and northing 0, by definition. Zone 43 is centred on 75°E.
    #[test]
    fn utm_false_origin_is_central_meridian() {
        assert_close(
            to_wgs84(&SourceCrs::Epsg(32643), 500_000.0, 0.0),
            (75.0, 0.0),
            1e-9,
        );
    }

    /// Worked example from IOGP Guidance Note 7-2 (EPSG), Transverse Mercator:
    /// E 577 274.99, N 69 740.50 on the British National Grid is 50°30'N, 0°30'E
    /// on the Airy 1830 ellipsoid. That example is projection maths only, so we
    /// compare on Airy too: converting on to WGS84 moves the point about 77 m,
    /// because the two ellipsoids differ in size and shape.
    #[test]
    fn transverse_mercator_matches_epsg_worked_example() {
        let wkt = r#"PROJCS["OSGB_1936_British_National_Grid",GEOGCS["GCS_OSGB_1936",DATUM["D_OSGB_1936",SPHEROID["Airy_1830",6377563.396,299.3249646]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",400000.0],PARAMETER["False_Northing",-100000.0],PARAMETER["Central_Meridian",-2.0],PARAMETER["Scale_Factor",0.9996012717],PARAMETER["Latitude_Of_Origin",49.0],UNIT["Meter",1.0]]"#;
        let mut reprojector = Reprojector::new(&SourceCrs::Wkt(wkt.into())).unwrap();
        reprojector.to = Proj::from_proj_string("+proj=longlat +ellps=airy +no_defs").unwrap();

        let mut geometry = Geometry::new_point([577_274.99, 69_740.50]);
        assert_eq!(reprojector.geometry(&mut geometry), 0);
        let GeometryValue::Point { coordinates } = geometry.value else {
            unreachable!()
        };
        // 1e-6° is about 10 cm on the ground.
        assert_close((coordinates[0], coordinates[1]), (0.5, 50.5), 1e-6);
    }

    #[test]
    fn esri_utm_prj_without_a_code_is_recognised() {
        let wkt = r#"PROJCS["WGS_1984_UTM_Zone_43N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",75.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]"#;
        let reprojector = Reprojector::new(&SourceCrs::Wkt(wkt.into())).unwrap();
        assert_eq!(reprojector.label, "EPSG:32643 (WGS_1984_UTM_Zone_43N)");
        assert_close(
            to_wgs84(&SourceCrs::Wkt(wkt.into()), 500_000.0, 0.0),
            (75.0, 0.0),
            1e-9,
        );
    }

    #[test]
    fn wgs84_needs_no_reprojection() {
        assert!(
            !Reprojector::new(&SourceCrs::Epsg(4326))
                .unwrap()
                .is_needed()
        );
        assert!(!Reprojector::new(&SourceCrs::Unknown).unwrap().is_needed());
        let esri_wgs84 = r#"GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]"#;
        assert!(
            !Reprojector::new(&SourceCrs::Wkt(esri_wgs84.into()))
                .unwrap()
                .is_needed()
        );
    }

    #[test]
    fn finds_the_outermost_epsg_code() {
        let wkt = r#"PROJCS["WGS 84 / UTM zone 43N",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],AUTHORITY["EPSG","4326"]],PROJECTION["Transverse_Mercator"],AUTHORITY["EPSG","32643"]]"#;
        assert_eq!(wkt_epsg_code(wkt), Some(32643));
        let wkt2 = r#"PROJCRS["WGS 84 / UTM zone 43N",BASEGEOGCRS["WGS 84",ID["EPSG",4326]],ID["EPSG",32643]]"#;
        assert_eq!(wkt_epsg_code(wkt2), Some(32643));
        assert_eq!(wkt_epsg_code(r#"GEOGCS["GCS_WGS_1984"]"#), None);
    }

    #[test]
    fn esri_names() {
        assert_eq!(esri_name_to_epsg("WGS_1984_UTM_Zone_43N"), Some(32643));
        assert_eq!(esri_name_to_epsg("WGS_1984_UTM_Zone_7S"), Some(32707));
        assert_eq!(
            esri_name_to_epsg("WGS_1984_Web_Mercator_Auxiliary_Sphere"),
            Some(3857)
        );
        assert_eq!(esri_name_to_epsg("WGS_1984_UTM_Zone_61N"), None);
        assert_eq!(esri_name_to_epsg("Kalianpur_1962_UTM_Zone_42N"), None);
    }

    #[test]
    fn unknown_codes_and_gibberish_are_errors() {
        assert!(Reprojector::new(&SourceCrs::Epsg(999_999)).is_err());
        let err = Reprojector::new(&SourceCrs::Wkt(
            r#"PROJCS["Nonsense",PROJECTION["Imaginary"]]"#.into(),
        ))
        .err()
        .unwrap();
        assert_eq!(
            err.to_string(),
            "SmartMap can't convert from the coordinate system \"Nonsense\""
        );
    }
}

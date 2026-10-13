//! Measuring shapes on the Earth: lengths, areas and perimeters.
//!
//! Longitude/latitude aren't flat x/y coordinates, so these use *geodesic*
//! calculations on the WGS84 ellipsoid (Karney's algorithms, via the `geo`
//! crate). They give the true distance over the Earth's surface, the same
//! answer GIS tools like QGIS give with their "ellipsoidal" setting. Results
//! are in metres and square metres; the UI converts them to the user's units.

use geo::orient::Direction;
use geo::{Geodesic, GeodesicArea, Length, Orient};
use geo_types::Geometry;
use geojson::GeometryValue;
use serde::Serialize;

/// What a shape measures. Points measure zero; lines have a length; polygons
/// have an area and a perimeter (holes' edges included, holes' area excluded).
#[derive(Debug, Default, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Measurement {
    /// Total length of lines, in metres.
    pub length: f64,
    /// Total area of polygons, in square metres.
    pub area: f64,
    /// Total length of polygon edges, in metres.
    pub perimeter: f64,
}

impl Measurement {
    fn add(self, other: Measurement) -> Measurement {
        Measurement {
            length: self.length + other.length,
            area: self.area + other.area,
            perimeter: self.perimeter + other.perimeter,
        }
    }
}

/// Measures a GeoJSON geometry given in longitude/latitude (WGS84).
pub fn measure(geometry: &GeometryValue) -> Result<Measurement, String> {
    let geometry: Geometry<f64> = geometry
        .try_into()
        .map_err(|e| format!("can't measure this shape: {e}"))?;
    Ok(measure_geo(&geometry))
}

fn measure_geo(geometry: &Geometry<f64>) -> Measurement {
    match geometry {
        Geometry::Point(_) | Geometry::MultiPoint(_) => Measurement::default(),
        Geometry::Line(line) => Measurement {
            length: Geodesic.length(line),
            ..Default::default()
        },
        Geometry::LineString(line) => Measurement {
            length: Geodesic.length(line),
            ..Default::default()
        },
        Geometry::MultiLineString(lines) => Measurement {
            length: Geodesic.length(lines),
            ..Default::default()
        },
        Geometry::Polygon(polygon) => {
            // The area calculation tells the outside of a ring from its inside
            // by the direction it runs: outer rings anticlockwise, holes
            // clockwise. Files don't always follow that (Shapefiles use the
            // opposite), so put every polygon in that order first. Otherwise a
            // "backwards" ring measures as the whole Earth minus the shape.
            let polygon = polygon.orient(Direction::Default);
            let (perimeter, area) = polygon.geodesic_perimeter_area_unsigned();
            Measurement {
                area,
                perimeter,
                ..Default::default()
            }
        }
        Geometry::MultiPolygon(polygons) => polygons
            .iter()
            .map(|p| measure_geo(&Geometry::Polygon(p.clone())))
            .fold(Measurement::default(), Measurement::add),
        Geometry::GeometryCollection(collection) => collection
            .iter()
            .map(measure_geo)
            .fold(Measurement::default(), Measurement::add),
        // Rect and Triangle never come from GeoJSON, but measure them as polygons anyway.
        Geometry::Rect(rect) => measure_geo(&Geometry::Polygon(rect.to_polygon())),
        Geometry::Triangle(triangle) => measure_geo(&Geometry::Polygon(triangle.to_polygon())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// WGS84 ellipsoid: semi-major axis and flattening.
    const A: f64 = 6_378_137.0;
    const F: f64 = 1.0 / 298.257_223_563;

    fn line(coords: &[[f64; 2]]) -> GeometryValue {
        GeometryValue::new_line_string(coords.to_vec())
    }

    fn assert_close(actual: f64, expected: f64, tolerance: f64) {
        let error = ((actual - expected) / expected).abs();
        assert!(
            error < tolerance,
            "{actual} vs {expected}: off by {:.5}%",
            error * 100.0
        );
    }

    #[test]
    fn one_degree_along_the_equator() {
        // The equator is a circle of radius A, so 1° of it is A × π / 180 exactly.
        let m = measure(&line(&[[0.0, 0.0], [1.0, 0.0]])).unwrap();
        assert_close(m.length, A * std::f64::consts::PI / 180.0, 1e-9);
        assert_eq!(m.area, 0.0);
    }

    #[test]
    fn equator_to_pole() {
        // The quarter meridian of WGS84, a standard reference value.
        let m = measure(&line(&[[0.0, 0.0], [0.0, 90.0]])).unwrap();
        assert_close(m.length, 10_001_965.729, 1e-9);
    }

    #[test]
    fn new_york_to_london() {
        // GeographicLib's own example (JFK to LHR, 40.6°N 73.8°W to 51.6°N 0.5°W): 5551.76 km.
        let m = measure(&line(&[[-73.8, 40.6], [-0.5, 51.6]])).unwrap();
        assert_close(m.length, 5_551_759.4, 1e-6);
    }

    #[test]
    fn lengths_add_up_over_parts() {
        let m = measure(&GeometryValue::new_multi_line_string(vec![
            vec![[0.0, 0.0], [1.0, 0.0]],
            vec![[0.0, 0.0], [0.0, 1.0]],
        ]))
        .unwrap();
        let first = measure(&line(&[[0.0, 0.0], [1.0, 0.0]])).unwrap().length;
        let second = measure(&line(&[[0.0, 0.0], [0.0, 1.0]])).unwrap().length;
        assert_close(m.length, first + second, 1e-12);
    }

    /// Area of the ellipsoid between the equator and latitude `phi` (degrees),
    /// for 1° of longitude: the exact textbook formula.
    fn band_area(phi: f64) -> f64 {
        let e = (F * (2.0 - F)).sqrt();
        let b = A * (1.0 - F);
        let s = phi.to_radians().sin();
        let zone = std::f64::consts::PI
            * b
            * b
            * (s / (1.0 - e * e * s * s) + ((1.0 + e * s) / (1.0 - e * s)).ln() / (2.0 * e));
        zone / 360.0
    }

    #[test]
    fn one_degree_cell_at_the_equator() {
        let cell = GeometryValue::new_polygon(vec![vec![
            [0.0, 0.0],
            [1.0, 0.0],
            [1.0, 1.0],
            [0.0, 1.0],
            [0.0, 0.0],
        ]]);
        let m = measure(&cell).unwrap();
        // The top edge is a geodesic, not the 1° parallel, so it bulges a few metres
        // north; that changes the area by about 0.003%, well inside the 0.1% target.
        assert_close(m.area, band_area(1.0), 1e-3);
        assert_close(m.area, 12_308_778_361.0, 1e-3);
        // Perimeter: two 1° meridian arcs, one 1° of equator and one 1° near the parallel.
        assert!(m.perimeter > 4.0 * 110_000.0 && m.perimeter < 4.0 * 111_400.0);
        assert_eq!(m.length, 0.0);
    }

    #[test]
    fn holes_are_left_out_of_the_area() {
        let ring = |lo: f64, hi: f64| vec![[lo, lo], [hi, lo], [hi, hi], [lo, hi], [lo, lo]];
        let solid = measure(&GeometryValue::new_polygon(vec![ring(0.0, 2.0)])).unwrap();
        let hole = measure(&GeometryValue::new_polygon(vec![ring(0.5, 1.5)])).unwrap();
        let with_hole = measure(&GeometryValue::new_polygon(vec![
            ring(0.0, 2.0),
            ring(0.5, 1.5),
        ]))
        .unwrap();
        assert_close(with_hole.area, solid.area - hole.area, 1e-9);
        assert_close(with_hole.perimeter, solid.perimeter + hole.perimeter, 1e-9);
    }

    #[test]
    fn ring_direction_does_not_matter() {
        let anticlockwise = vec![[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], [0.0, 0.0]];
        let mut clockwise = anticlockwise.clone();
        clockwise.reverse();
        let a = measure(&GeometryValue::new_polygon(vec![anticlockwise])).unwrap();
        let b = measure(&GeometryValue::new_polygon(vec![clockwise])).unwrap();
        assert_close(b.area, a.area, 1e-12);
    }

    #[test]
    fn points_measure_nothing() {
        let m = measure(&GeometryValue::new_point([73.0, 33.0])).unwrap();
        assert_eq!(m, Measurement::default());
    }
}

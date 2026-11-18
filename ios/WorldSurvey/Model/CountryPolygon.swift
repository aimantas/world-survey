import Foundation
import simd

/// One polygon of a country outline: an outer ring and its holes, as (lng, lat) points.
/// Longitudes are continuous: an outline that crosses the antimeridian runs past 180 (or below -180)
/// instead of jumping to the other edge of the map.
nonisolated struct CountryPolygon: Sendable {
    let rings: [[SIMD2<Double>]]
    let minX: Double
    let minY: Double
    let maxX: Double
    let maxY: Double

    init(rings: [[SIMD2<Double>]]) {
        self.rings = rings
        var x0 = Double.infinity, y0 = Double.infinity, x1 = -Double.infinity, y1 = -Double.infinity
        for p in rings.first ?? [] {
            x0 = min(x0, p.x); x1 = max(x1, p.x)
            y0 = min(y0, p.y); y1 = max(y1, p.y)
        }
        minX = x0; minY = y0; maxX = x1; maxY = y1
    }

    func contains(lng: Double, lat: Double) -> Bool {
        guard lat >= minY, lat <= maxY, let outer = rings.first else { return false }
        // The outline may sit a full turn away from the point's own longitude.
        for x in [lng, lng + 360, lng - 360] where x >= minX && x <= maxX {
            guard Geo.ringContains(outer, lng: x, lat: lat) else { continue }
            if rings.dropFirst().contains(where: { Geo.ringContains($0, lng: x, lat: lat) }) { return false }
            return true
        }
        return false
    }

    /// Makes longitudes continuous along a line, so a step never jumps from 180 to -180.
    static func unwrapped(_ points: [SIMD2<Double>]) -> [SIMD2<Double>] {
        var out: [SIMD2<Double>] = []
        out.reserveCapacity(points.count)
        var shift = 0.0
        for (i, p) in points.enumerated() {
            if i > 0 {
                let step = p.x - points[i - 1].x
                if step > 180 { shift -= 360 } else if step < -180 { shift += 360 }
            }
            out.append(SIMD2(p.x + shift, p.y))
        }
        return out
    }
}

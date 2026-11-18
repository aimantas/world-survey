import Foundation
import simd

/// Small spherical helpers. Distances are measured in kilometres; miles are a display choice.
nonisolated enum Geo {
    static let earthRadiusKm = 6371.0

    static func distanceKm(_ a: LatLng, _ b: LatLng) -> Double {
        let rad = Double.pi / 180
        let dLat = (b.lat - a.lat) * rad
        let dLng = (b.lng - a.lng) * rad
        let h = pow(sin(dLat / 2), 2) + cos(a.lat * rad) * cos(b.lat * rad) * pow(sin(dLng / 2), 2)
        return 2 * earthRadiusKm * asin(min(1, sqrt(h)))
    }

    /// Angle between two points in radians.
    static func angle(_ a: LatLng, _ b: LatLng) -> Double {
        acos(max(-1, min(1, simd_dot(a.unit, b.unit))))
    }

    /// A point along the great circle from `a` to `b`, `t` in 0...1.
    static func interpolate(_ a: LatLng, _ b: LatLng, _ t: Double) -> LatLng {
        let ua = a.unit
        let ub = b.unit
        let omega = acos(max(-1, min(1, simd_dot(ua, ub))))
        guard omega > 1e-6 else { return a }
        // Antipodal points have no single great circle; nudge through the pole.
        guard abs(omega - .pi) > 1e-4 else {
            return t < 0.5 ? interpolate(a, LatLng(lat: 89.9, lng: a.lng), t * 2) : interpolate(LatLng(lat: 89.9, lng: a.lng), b, t * 2 - 1)
        }
        let s = sin(omega)
        let v = ua * (sin((1 - t) * omega) / s) + ub * (sin(t * omega) / s)
        return LatLng(unit: v)
    }

    /// Planar point-in-ring in lng/lat space. Natural Earth rings are cut at the antimeridian,
    /// so this matches what the globe draws.
    static func ringContains(_ ring: [SIMD2<Double>], lng: Double, lat: Double) -> Bool {
        var inside = false
        var j = ring.count - 1
        for i in ring.indices {
            let pi = ring[i]
            let pj = ring[j]
            if (pi.y > lat) != (pj.y > lat), lng < (pj.x - pi.x) * (lat - pi.y) / (pj.y - pi.y) + pi.x {
                inside.toggle()
            }
            j = i
        }
        return inside
    }
}

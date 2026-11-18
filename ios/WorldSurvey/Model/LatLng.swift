import Foundation
import simd

/// A point on the globe in degrees. The unit vector matches the globe mesh:
/// longitude 0 faces +Z, east is +X, north is +Y.
nonisolated struct LatLng: Hashable, Sendable, Codable {
    var lat: Double
    var lng: Double

    init(lat: Double, lng: Double) {
        self.lat = lat
        self.lng = lng
    }

    /// Country data stores points as `[lat, lng]`.
    init?(_ pair: [Double]?) {
        guard let pair, pair.count == 2 else { return nil }
        self.init(lat: pair[0], lng: pair[1])
    }

    init(unit v: SIMD3<Double>) {
        let n = simd_normalize(v)
        self.init(lat: asin(max(-1, min(1, n.y))) * 180 / .pi, lng: atan2(n.x, n.z) * 180 / .pi)
    }

    var unit: SIMD3<Double> {
        let phi = lat * .pi / 180
        let lambda = lng * .pi / 180
        return SIMD3(cos(phi) * sin(lambda), sin(phi), cos(phi) * cos(lambda))
    }

    var unitF: SIMD3<Float> { SIMD3<Float>(unit) }

    /// "54.69°N 25.28°E", the way the sheet margin prints coordinates.
    var marginLabel: String {
        let ns = lat >= 0 ? "N" : "S"
        let ew = lng >= 0 ? "E" : "W"
        return String(format: "%.2f°%@ %.2f°%@", abs(lat), ns, abs(lng), ew)
    }
}

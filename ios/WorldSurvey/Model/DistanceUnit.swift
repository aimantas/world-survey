import Foundation
import simd

/// Kilometres or miles, chosen in Settings. Defaults to the device's measurement system.
nonisolated enum DistanceUnit: String, Codable, CaseIterable, Sendable {
    case km, mi

    static var deviceDefault: DistanceUnit {
        Locale.current.measurementSystem == .metric ? .km : .mi
    }

    var label: String { rawValue }

    func value(km: Double) -> Double { self == .mi ? km / 1.609344 : km }

    func format(km: Double) -> String {
        let v = value(km: km)
        if v < 1 { return "< 1 \(label)" }
        if v < 10 { return "\(v.formatted(.number.precision(.fractionLength(1)))) \(label)" }
        return "\(Int(v.rounded()).formatted()) \(label)"
    }
}

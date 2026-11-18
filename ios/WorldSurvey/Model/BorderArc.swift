import Foundation
import simd

/// A stretch of outline shared by at most two countries. `shared` lines are international
/// boundaries; the rest is coast.
nonisolated struct BorderArc: Sendable {
    let points: [SIMD2<Double>]
    let shared: Bool
}

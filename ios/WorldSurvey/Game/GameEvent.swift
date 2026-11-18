import Foundation

/// What just happened, for the medal checks.
nonisolated enum GameEvent: Sendable {
    case answer(kind: RoundKind, mode: GameMode, iso3: String, correct: Bool, ms: Double, km: Double?, streak: Int)
    case finish(rounds: Int, misses: Int, courseTotal: Int)
}

import Foundation

nonisolated enum Rank: Int, CaseIterable, Sendable {
    case apprentice, fieldAssistant, surveyor, seniorSurveyor, chiefCartographer

    var name: String {
        switch self {
        case .apprentice: "Apprentice"
        case .fieldAssistant: "Field assistant"
        case .surveyor: "Surveyor"
        case .seniorSurveyor: "Senior surveyor"
        case .chiefCartographer: "Chief cartographer"
        }
    }

    /// Endless modes rank by the longest run; fixed rounds rank by accuracy.
    static func forRun(_ bestStreak: Int) -> Rank {
        Rank(rawValue: [3, 8, 15, 25].count { bestStreak >= $0 }) ?? .apprentice
    }

    static func forAccuracy(_ accuracy: Double) -> Rank {
        Rank(rawValue: [0.4, 0.6, 0.8, 1.0].count { accuracy >= $0 }) ?? .apprentice
    }
}

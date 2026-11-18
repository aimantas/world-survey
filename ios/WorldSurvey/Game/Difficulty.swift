import Foundation

nonisolated enum Difficulty: String, Codable, CaseIterable, Identifiable, Sendable {
    case easy, normal, hard

    var id: String { rawValue }

    var label: String {
        switch self {
        case .easy: "Easy"
        case .normal: "Normal"
        case .hard: "Hard"
        }
    }

    var note: String {
        switch self {
        case .easy: "Well-known countries"
        case .normal: "Adds the middle tier"
        case .hard: "All 195"
        }
    }

    var maxTier: Int {
        switch self {
        case .easy: 1
        case .normal: 2
        case .hard: 3
        }
    }

    var harder: Difficulty? {
        switch self {
        case .easy: .normal
        case .normal: .hard
        case .hard: nil
        }
    }
}

import Foundation

/// Grade drives colour, sound and the daily share grid.
nonisolated enum Grade: String, Codable, Sendable {
    case perfect, close, far, miss

    var square: String {
        switch self {
        case .perfect: "🟩"
        case .close: "🟨"
        case .far: "🟧"
        case .miss: "⬛"
        }
    }
}

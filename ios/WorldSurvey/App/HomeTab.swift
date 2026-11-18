import Foundation

/// The four places the app opens on, chosen from the tab bar under the panel.
enum HomeTab: String, CaseIterable, Identifiable {
    case play, learn, atlas, progress

    var id: String { rawValue }

    var title: String {
        switch self {
        case .play: "Play"
        case .learn: "Learn"
        case .atlas: "Atlas"
        case .progress: "Progress"
        }
    }

    var symbol: String {
        switch self {
        case .play: "scope"
        case .learn: "book.closed"
        case .atlas: "map"
        case .progress: "chart.bar"
        }
    }

    var selectedSymbol: String {
        switch self {
        case .play: "scope"
        case .learn: "book.closed.fill"
        case .atlas: "map.fill"
        case .progress: "chart.bar.fill"
        }
    }
}

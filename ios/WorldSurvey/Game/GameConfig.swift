import Foundation

/// Everything needed to start a game.
nonisolated struct GameConfig: Sendable {
    var mode: GameMode
    var region = "World"
    var difficulty = Difficulty.easy
    var preset = HigherLowerPreset.mixed
    var lesson: Lesson?
    /// Scripted rounds for lessons, review, practice and the daily expedition.
    var script: [ScriptItem] = []
    /// A lesson asks a missed country once more before it ends.
    var retryMisses = false
    var dailyDate: String?

    /// Records are kept per mode, region and difficulty; scripted games keep none.
    var recordKey: String? {
        switch mode {
        case .daily: "daily"
        case .higherLower: "higherlower:\(preset.rawValue)"
        case .streak: "streak"
        case .lookalikes: "lookalikes"
        case .lesson, .review, .practice: nil
        default: "\(mode.rawValue):\(region):\(difficulty.rawValue)"
        }
    }

    var title: String {
        switch mode {
        case .lesson: lesson?.name ?? mode.name
        case .higherLower: "\(mode.name) · \(preset.name)"
        default: mode.name
        }
    }

    var subtitle: String {
        if mode.usesRegion, mode.usesDifficulty { return "\(region) · \(difficulty.label)" }
        if mode.usesRegion { return region }
        return ""
    }
}

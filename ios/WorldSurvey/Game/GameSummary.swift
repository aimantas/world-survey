import Foundation

/// What the results sheet shows.
nonisolated struct GameSummary: Sendable {
    let config: GameConfig
    let results: [RoundResult]
    let score: Int
    let bestStreak: Int
    let misses: Int
    let rank: Rank
    let isRecord: Bool
    let previousRecord: Int
    let newMedals: [Medal]
    let newlySurveyed: Int
    let lessonFirstTime: Bool
    let shareText: String?

    var correctCount: Int { results.count { $0.correct } }
    var accuracy: Double { results.isEmpty ? 0 : Double(correctCount) / Double(results.count) }
    var averageSeconds: Double { results.isEmpty ? 0 : results.map(\.ms).reduce(0, +) / Double(results.count) / 1000 }
    var missed: [Country] {
        var seen: Set<String> = []
        return results.filter { !$0.correct }.map(\.round.country).filter { seen.insert($0.iso3).inserted }
    }
}

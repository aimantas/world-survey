import Foundation

/// One question.
nonisolated struct Round: Identifiable, Sendable {
    /// Its place in the game, starting at 1.
    let id: Int
    let kind: RoundKind
    /// The answer. In Higher or lower, the country being asked about.
    let country: Country
    /// Four choices, for the kinds that are answered from a list.
    var options: [Country] = []
    /// Higher or lower: the measure, and the country whose value is shown.
    var stat: Stat?
    var other: Country?
    /// A lesson asks a missed country once more.
    var isRetry = false
}

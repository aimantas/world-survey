import Foundation

nonisolated enum GameMode: String, Codable, CaseIterable, Identifiable, Sendable {
    case find, nameIt, flagQuiz, lookalikes, flagHunt, capitalQuiz, capitalPin
    case higherLower, streak, daily, lesson, review, practice

    var id: String { rawValue }

    var name: String {
        switch self {
        case .find: "Find it"
        case .nameIt: "Name it"
        case .flagQuiz: "Flag quiz"
        case .lookalikes: "Lookalike flags"
        case .flagHunt: "Flag hunt"
        case .capitalQuiz: "Capital quiz"
        case .capitalPin: "Capital pin"
        case .higherLower: "Higher or lower"
        case .streak: "Streak"
        case .daily: "Daily expedition"
        case .lesson: "Lesson"
        case .review: "Review"
        case .practice: "Practice"
        }
    }

    var blurb: String {
        switch self {
        case .find: "A country name. Find it on the globe."
        case .nameIt: "The globe marks a country. Say which one."
        case .flagQuiz: "A flag and four names. Pick the right one."
        case .lookalikes: "Every wrong answer is a flag that looks almost the same."
        case .flagHunt: "A flag. Put your finger on its country."
        case .capitalQuiz: "A country and four capitals. Pick the right one."
        case .capitalPin: "A capital city. Drop a pin as close as you can."
        case .higherLower: "Two countries, one number. One wrong guess ends it."
        case .streak: "Mixed rounds, rising multiplier, one life."
        case .daily: "Five rounds, the same for everyone today."
        case .lesson: "Study a few neighbours, then find and name them."
        case .review: "The countries you missed, spaced out so they stick."
        case .practice: "The countries you just missed, once more."
        }
    }

    /// One miss ends the game.
    var endless: Bool { self == .higherLower || self == .streak }

    /// Rounds are handed to the game instead of drawn from a pool.
    var scripted: Bool { self == .daily || self == .lesson || self == .review || self == .practice }

    var usesRegion: Bool { !scripted && self != .lookalikes }
    var usesDifficulty: Bool { !scripted && self != .lookalikes }

    var defaultRounds: Int { 10 }

    /// The round kind for pool-drawn modes.
    var kind: RoundKind? {
        switch self {
        case .find: .find
        case .nameIt: .nameIt
        case .flagQuiz, .lookalikes: .flagQuiz
        case .flagHunt: .flagHunt
        case .capitalQuiz: .capitalQuiz
        case .capitalPin: .capitalPin
        case .higherLower: .higherLower
        case .streak, .daily, .lesson, .review, .practice: nil
        }
    }
}

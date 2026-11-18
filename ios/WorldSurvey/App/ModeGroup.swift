import Foundation
import Observation

/// The game tiles on the Play tab. Flags, Capitals and Higher or lower hold several games and open a picker.
enum ModeGroup: String, CaseIterable, Identifiable {
    case find, nameIt, capitals, flags, higherLower, streak

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .find: "scope"
        case .nameIt: "questionmark.bubble"
        case .capitals: "building.columns"
        case .flags: "flag"
        case .higherLower: "arrow.up.arrow.down"
        case .streak: "flame"
        }
    }

    /// Two short lines for a half-width tile.
    var tileBlurb: String {
        switch self {
        case .find: "Tap the named country on the globe."
        case .nameIt: "The globe marks a country. Name it."
        case .capitals: "Pick the capital, or pin it on the map."
        case .flags: "Name the flag, beat lookalikes, find its home."
        case .higherLower: "Which has more people, land or money?"
        case .streak: "Mixed rounds. One miss ends the run."
        }
    }

    /// How many games the tile holds, when it opens a picker.
    var choices: Int {
        self == .higherLower ? HigherLowerPreset.allCases.count : modes.count
    }

    var name: String {
        switch self {
        case .find: "Find it"
        case .nameIt: "Name it"
        case .capitals: "Capitals"
        case .flags: "Flags"
        case .higherLower: "Higher or lower"
        case .streak: "Streak"
        }
    }

    var blurb: String {
        switch self {
        case .find: GameMode.find.blurb
        case .nameIt: GameMode.nameIt.blurb
        case .capitals: "Pick the capital from four, or drop a pin on it."
        case .flags: "Flag quiz, lookalikes, or find the flag on the globe."
        case .higherLower: "Population, area, GDP, life expectancy, density or neighbours."
        case .streak: GameMode.streak.blurb
        }
    }

    var modes: [GameMode] {
        switch self {
        case .find: [.find]
        case .nameIt: [.nameIt]
        case .capitals: [.capitalQuiz, .capitalPin]
        case .flags: [.flagQuiz, .lookalikes, .flagHunt]
        case .higherLower: [.higherLower]
        case .streak: [.streak]
        }
    }
}

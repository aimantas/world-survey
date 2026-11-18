import Foundation

/// Higher or lower presets. `neighbours` compares only countries that share a border.
nonisolated enum HigherLowerPreset: String, CaseIterable, Codable, Identifiable, Sendable {
    case mixed, population, area, gdp, lifeExpectancy, density, neighbours

    var id: String { rawValue }

    var name: String {
        switch self {
        case .mixed: "Mixed"
        case .population: "Population"
        case .area: "Area"
        case .gdp: "Economy"
        case .lifeExpectancy: "Life expectancy"
        case .density: "Density"
        case .neighbours: "Neighbours"
        }
    }

    var blurb: String {
        switch self {
        case .mixed: "A different measure every round."
        case .population: "Who has more people?"
        case .area: "Which is bigger on the ground?"
        case .gdp: "Which has the larger GDP, in US dollars?"
        case .lifeExpectancy: "Where do people live longer?"
        case .density: "Where are people packed in tighter?"
        case .neighbours: "Only countries that share a border, mixed measures."
        }
    }

    var stat: Stat? {
        switch self {
        case .mixed, .neighbours: nil
        case .population: .population
        case .area: .area
        case .gdp: .gdp
        case .lifeExpectancy: .lifeExpectancy
        case .density: .density
        }
    }
}

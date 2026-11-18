import Foundation

/// The measures Higher or lower compares. Density is derived; the rest come from the table.
nonisolated enum Stat: String, CaseIterable, Codable, Sendable {
    case population, area, gdp, lifeExpectancy, density

    var label: String {
        switch self {
        case .population: "Population"
        case .area: "Area"
        case .gdp: "GDP"
        case .lifeExpectancy: "Life expectancy"
        case .density: "People per km²"
        }
    }

    var question: String {
        switch self {
        case .population: "more or fewer people"
        case .area: "more or less land"
        case .gdp: "a larger or smaller economy"
        case .lifeExpectancy: "a longer or shorter life expectancy"
        case .density: "more or fewer people per km²"
        }
    }

    func value(_ c: Country) -> Double? {
        switch self {
        case .population: c.population
        case .area: c.area
        case .gdp: c.gdp
        case .lifeExpectancy: c.lifeExpectancy
        case .density:
            if let p = c.population, let a = c.area, a > 0 { p / a } else { nil }
        }
    }

    func year(_ c: Country) -> Int? {
        switch self {
        case .population, .density: c.populationYear
        case .area: nil
        case .gdp: c.gdpYear
        case .lifeExpectancy: c.lifeExpectancyYear
        }
    }

    func format(_ v: Double) -> String {
        switch self {
        case .population: Stat.compact(v)
        case .area: "\(Stat.compact(v)) km²"
        case .gdp: "$\(Stat.compact(v))"
        case .lifeExpectancy: "\(v.formatted(.number.precision(.fractionLength(1)))) years"
        case .density:
            v < 10 ? "\(v.formatted(.number.precision(.fractionLength(1)))) per km²" : "\(Int(v.rounded()).formatted()) per km²"
        }
    }

    /// "57.5 million", "1.43 billion", "65,300".
    static func compact(_ v: Double) -> String {
        let a = abs(v)
        func scaled(_ unit: Double, _ name: String) -> String {
            let digits = a >= unit * 10 ? 1 : 2
            return "\((v / unit).formatted(.number.precision(.fractionLength(digits)))) \(name)"
        }
        if a >= 1e12 { return scaled(1e12, "trillion") }
        if a >= 1e9 { return scaled(1e9, "billion") }
        if a >= 1e6 { return scaled(1e6, "million") }
        return Int(v.rounded()).formatted()
    }
}

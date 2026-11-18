import Foundation

/// One row of the country table built for the web game. Missing values are nil, never zero.
nonisolated struct Country: Codable, Identifiable, Sendable {
    let iso3: String
    let iso2: String?
    let name: String
    let official: String?
    /// True for the 195 playable states (193 UN members, Vatican City and Palestine).
    let sovereign: Bool
    let region: String
    let subregion: String?
    let capital: String?
    let capitalLatLng: [Double]?
    let labelLatLng: [Double]
    /// `[minLng, minLat, maxLng, maxLat]`; minLng > maxLng when the country crosses the antimeridian.
    let bbox: [Double]?
    let area: Double?
    let population: Double?
    let populationYear: Int?
    let gdp: Double?
    let gdpYear: Int?
    let lifeExpectancy: Double?
    let lifeExpectancyYear: Int?
    let borders: [String]
    let languages: [String]?
    let currencies: [String]?
    let landlocked: Bool?
    let island: Bool
    /// 1 well known, 2 medium, 3 hard.
    let tier: Int?
    /// Too small to tap reliably; the globe gives it a ring.
    let tiny: Bool
    let inMap: Bool
    let flag: String?
    let slug: String?

    var id: String { iso3 }
    var label: LatLng { LatLng(lat: labelLatLng[0], lng: labelLatLng[1]) }
    var capitalPoint: LatLng? { LatLng(capitalLatLng) }
    var flagAsset: String? {
        guard flag != nil, let iso2 else { return nil }
        return "Flags/\(iso2.lowercased())"
    }
    var pageURL: URL? {
        slug.flatMap { URL(string: "https://geography.aimantas.com/countries/\($0)/") }
    }
    /// Shown as a ring instead of an outline.
    var needsRing: Bool { tiny || !inMap }
}

nonisolated extension Country: Hashable {
    static func == (a: Country, b: Country) -> Bool { a.iso3 == b.iso3 }
    func hash(into hasher: inout Hasher) { hasher.combine(iso3) }
}

import Foundation

/// How one round is answered.
nonisolated enum RoundKind: String, Codable, Sendable {
    /// A name; tap the country on the globe.
    case find
    /// A flag; tap its country on the globe.
    case flagHunt
    /// A capital; drop a pin on it.
    case capitalPin
    /// The globe marks a country; pick its name from four.
    case nameIt
    /// A flag; pick its name from four.
    case flagQuiz
    /// A country; pick its capital from four.
    case capitalQuiz
    /// Two countries and one measure.
    case higherLower

    var answersOnGlobe: Bool { self == .find || self == .flagHunt || self == .capitalPin }
}

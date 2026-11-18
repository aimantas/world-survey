import Foundation

/// Points. Everything is out of 1,000 per round plus a time bonus, so modes compare.
/// The numbers match the web game.
nonisolated enum Scoring {
    static let roundMax = 1000
    static let timeBonusMax = 200

    /// Full bonus inside 2 s, nothing after 12 s.
    static func timeBonus(ms: Double) -> Int {
        Int((Double(timeBonusMax) * clamp(1 - (ms - 2000) / 10000)).rounded())
    }

    /// Tapped the wrong country: partial credit by distance to the right one.
    static func nearMissPoints(km: Double) -> Int {
        Int((600 * clamp(1 - log10(1 + km / 40) / log10(1 + 4000 / 40))).rounded())
    }

    /// Capital pin: 1,000 within 25 km, 500 at 250 km, 0 at 2,500 km.
    static func pinPoints(km: Double) -> Int {
        if km <= 25 { return roundMax }
        return Int((Double(roundMax) * clamp(1 - log10(km / 25) / 2)).rounded())
    }

    static func streakMultiplier(_ streak: Int) -> Double {
        min(5, 1 + Double(streak / 3) * 0.5)
    }

    static func grade(points: Int) -> Grade {
        if points >= 900 { return .perfect }
        if points >= 500 { return .close }
        if points > 0 { return .far }
        return .miss
    }

    private static func clamp(_ v: Double) -> Double { min(1, max(0, v)) }
}

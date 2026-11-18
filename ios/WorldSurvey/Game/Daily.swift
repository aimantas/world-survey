import Foundation

/// The daily expedition: five rounds from one seed, the same for everyone on a UTC date.
/// The seed, the shuffle and the plan match the web game, so both ask the same countries.
nonisolated enum Daily {
    static let plan: [RoundKind] = [.find, .flagHunt, .capitalPin, .nameIt, .find]
    static let maxScore = 5 * Scoring.roundMax

    private static let utc: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        return calendar
    }()

    /// Expedition No. 1 was 3 November 2026.
    private static let epoch = utc.date(from: DateComponents(year: 2026, month: 11, day: 3)) ?? .distantPast

    static func today(_ now: Date = .now) -> String {
        let parts = utc.dateComponents([.year, .month, .day], from: now)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    static func number(for date: String) -> Int {
        let parts = date.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, let day = utc.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return 1 }
        return (utc.dateComponents([.day], from: epoch, to: day).day ?? 0) + 1
    }

    /// Three warm-ups from well-known countries, then two harder ones.
    static func script(countries: [Country], date: String) -> [ScriptItem] {
        let rand = Rand(seedString: "geo-daily:\(date)")
        let playable = countries.filter { $0.sovereign && $0.inMap }
        let easy = rand.shuffled(playable.filter { ($0.tier ?? 3) <= 2 })
        let hard = rand.shuffled(playable.filter { ($0.tier ?? 3) >= 2 })
        var used: Set<String> = []
        var out: [ScriptItem] = []
        for (i, kind) in plan.enumerated() {
            let source = i < 3 ? easy : hard
            guard let c = source.first(where: { c in
                !used.contains(c.iso3) && (kind != .flagHunt || c.flagAsset != nil) && (kind != .capitalPin || c.capitalPoint != nil)
            }) else { continue }
            used.insert(c.iso3)
            out.append(ScriptItem(kind: kind, iso3: c.iso3, seed: UInt32(rand.unit() * 1e9)))
        }
        return out
    }

    static func shareText(date: String, score: Int, grades: [Grade]) -> String {
        """
        World Survey · Expedition \(number(for: date))
        \(score.formatted()) / \(maxScore.formatted())
        \(grades.map(\.square).joined())
        https://geography.aimantas.com/daily/
        """
    }
}

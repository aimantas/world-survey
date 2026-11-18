import Foundation

/// Picking countries and wrong answers. Ported from the web game so both teach the same way.
nonisolated enum Questions {
    enum Need: Sendable { case flag, capital, capitalPoint }

    /// The playable countries for a region and difficulty.
    static func pool(_ countries: [Country], region: String, difficulty: Difficulty, need: [Need] = []) -> [Country] {
        var list = countries.filter { c in
            c.sovereign && (region == "World" || c.region == region) && (c.tier ?? 3) <= difficulty.maxTier
        }
        for n in need {
            list = list.filter { c in
                switch n {
                case .flag: c.flagAsset != nil
                case .capital: c.capital != nil
                case .capitalPoint: c.capitalPoint != nil && c.capital != nil
                }
            }
        }
        // Small regions on easy can be thin; widen to the next tier rather than repeat.
        if list.count < 12, let harder = difficulty.harder {
            return pool(countries, region: region, difficulty: harder, need: need)
        }
        return list
    }

    private static let masteryWeight = [3.0, 2.0, 1.2, 0.6]

    /// Low mastery and recent misses come back more often.
    static func nextCountry(_ list: [Country], progress: ProgressState, used: Set<String>, rand: Rand, now: Date = .now) -> Country? {
        let fresh = list.filter { !used.contains($0.iso3) }
        let candidates = fresh.isEmpty ? list : fresh
        let weights = candidates.map { c -> Double in
            var w = masteryWeight[min(3, max(0, progress.mastery[c.iso3] ?? 0))]
            if let seen = progress.seen[c.iso3], seen.wrong > seen.right, now.timeIntervalSince(seen.last) < 3 * 86400 {
                w *= 1.6
            }
            return w
        }
        return rand.pickWeighted(candidates, weights: weights)
    }

    /// Three wrong options, preferring neighbours in the same subregion so the choice teaches.
    static func distractors(for answer: Country, in all: [Country], count: Int = 3, rand: Rand, key: KeyPath<Country, String?> = \.optionalName) -> [Country] {
        let answerKey = answer[keyPath: key]
        let others = all.filter { c in
            c.sovereign && c.iso3 != answer.iso3 && c[keyPath: key] != nil && c[keyPath: key] != answerKey
        }
        let sameSub = rand.shuffled(others.filter { $0.subregion == answer.subregion })
        let sameRegion = rand.shuffled(others.filter { $0.region == answer.region && $0.subregion != answer.subregion })
        let rest = rand.shuffled(others.filter { $0.region != answer.region })
        var out: [Country] = []
        for group in [Array(sameSub.prefix(2)), sameRegion, Array(sameSub.dropFirst(2)), rest] {
            for c in group {
                if out.count >= count { break }
                if !out.contains(where: { $0[keyPath: key] == c[keyPath: key] }) { out.append(c) }
            }
        }
        return out
    }

    /// The answer and three wrong options in random order.
    static func options(for answer: Country, in all: [Country], rand: Rand, key: KeyPath<Country, String?> = \.optionalName) -> [Country] {
        rand.shuffled([answer] + distractors(for: answer, in: all, rand: rand, key: key))
    }

    /// Lookalike flags: wrong answers come from the hand-picked group first.
    static func lookalikeOptions(for answer: Country, data: WorldData, rand: Rand) -> [Country] {
        var wrong = rand.shuffled((data.lookalikes[answer.iso3] ?? []).compactMap { data.country($0) }).prefix(3).map { $0 }
        if wrong.count < 3 {
            let fill = distractors(for: answer, in: data.sovereign, rand: rand).filter { c in !wrong.contains(c) }
            wrong.append(contentsOf: fill.prefix(3 - wrong.count))
        }
        return rand.shuffled([answer] + wrong)
    }
}

nonisolated extension Country {
    /// `name` as an optional, so distractors can key on name or capital with one key path.
    var optionalName: String? { name }
}

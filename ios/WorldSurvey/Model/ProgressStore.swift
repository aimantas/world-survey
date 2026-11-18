import Foundation
import Observation

/// Owns the saved progress. No account and no server: the record lives in UserDefaults.
@Observable
final class ProgressStore {
    struct AnswerOutcome {
        let newlySurveyed: Bool
        let before: Int
        let after: Int
    }

    struct DueCountry: Sendable {
        let iso3: String
        let mastery: Int
        let overdue: TimeInterval
    }

    private(set) var state: ProgressState

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let key: String

    init(defaults: UserDefaults = .standard, key: String = "world-survey:v1") {
        self.defaults = defaults
        self.key = key
        if let data = defaults.data(forKey: key), let saved = try? JSONDecoder().decode(ProgressState.self, from: data) {
            state = saved
        } else {
            state = ProgressState()
        }
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(state) else { return }
        defaults.set(data, forKey: key)
    }

    var settings: ProgressState.Settings {
        get { state.settings }
        set {
            state.settings = newValue
            save()
        }
    }

    var units: DistanceUnit { state.settings.units ?? .deviceDefault }

    /// Record one answer. Mastery rises on a correct answer and drops on a miss.
    @discardableResult
    func answer(iso3: String, correct: Bool, ms: Double?, now: Date = .now) -> AnswerOutcome {
        var seen = state.seen[iso3] ?? ProgressState.Seen()
        if correct { seen.right += 1 } else { seen.wrong += 1 }
        seen.last = now
        state.seen[iso3] = seen

        let before = state.mastery[iso3] ?? 0
        let after = correct ? min(3, max(1, before + 1)) : max(0, before - 1)
        state.mastery[iso3] = after
        state.stats.answers += 1
        if correct {
            state.stats.correct += 1
            if let ms, state.stats.fastestMs.map({ ms < $0 }) ?? true { state.stats.fastestMs = ms }
        }
        save()
        return AnswerOutcome(newlySurveyed: correct && before == 0, before: before, after: after)
    }

    /// `recordKey` nil: a lesson or review, which counts as a game played but keeps no high score.
    @discardableResult
    func finishGame(recordKey: String?, score: Int, bestStreak: Int, now: Date = .now) -> (isRecord: Bool, previous: Int) {
        state.stats.games += 1
        state.days[DayStreak.key(now), default: 0] += 1
        let previous = recordKey.flatMap { state.records[$0] } ?? 0
        let isRecord = recordKey != nil && score > previous
        if isRecord, let recordKey { state.records[recordKey] = score }
        state.bestStreak = max(state.bestStreak, bestStreak)
        save()
        return (isRecord, previous)
    }

    func saveDaily(date: String, entry: ProgressState.DailyEntry) {
        state.daily[date] = entry
        save()
    }

    /// Keeps the better of the two results for a lesson. Returns true on the first completion.
    @discardableResult
    func finishLesson(slug: String, right: Int, total: Int, now: Date = .now) -> Bool {
        let previous = state.course[slug]
        let ratio = total > 0 ? Double(right) / Double(total) : 0
        let previousRatio = previous.map { $0.total > 0 ? Double($0.right) / Double($0.total) : 0 } ?? -1
        let better = ratio >= previousRatio
        state.course[slug] = ProgressState.LessonRecord(
            done: previous?.done ?? now,
            right: better ? right : previous?.right ?? right,
            total: better ? total : previous?.total ?? total,
            runs: (previous?.runs ?? 0) + 1
        )
        save()
        return previous == nil
    }

    var streak: DayStreak { DayStreak(days: state.days) }

    /// Review schedule: a country comes back sooner the less you know it.
    /// Mastery 0 after a miss is due after ten minutes; then one day, three days, two weeks.
    func due(in countries: [Country], now: Date = .now) -> [DueCountry] {
        let day: TimeInterval = 86400
        let waits: [TimeInterval] = [0, day, 3 * day, 14 * day]
        var out: [DueCountry] = []
        for c in countries {
            guard let seen = state.seen[c.iso3] else { continue }
            let mastery = min(3, max(0, state.mastery[c.iso3] ?? 0))
            let overdue = now.timeIntervalSince(seen.last) - waits[mastery]
            if overdue >= (mastery == 0 ? 600 : 0) {
                out.append(DueCountry(iso3: c.iso3, mastery: mastery, overdue: overdue))
            }
        }
        return out.sorted { a, b in a.mastery != b.mastery ? a.mastery < b.mastery : a.overdue > b.overdue }
    }

    func visit(_ iso3: String) {
        guard !state.visited.contains(iso3) else { return }
        state.visited.insert(iso3)
        save()
    }

    /// Returns true when the medal is newly unlocked.
    func unlock(_ id: String, now: Date = .now) -> Bool {
        guard state.medals[id] == nil else { return false }
        state.medals[id] = now
        save()
        return true
    }

    func reset() {
        let settings = state.settings
        state = ProgressState()
        state.settings = settings
        save()
    }
}

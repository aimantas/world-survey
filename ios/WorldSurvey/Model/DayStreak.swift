import Foundation

/// Days played, counted on the player's own calendar so a streak follows their evenings.
nonisolated struct DayStreak: Sendable {
    struct Day: Identifiable, Sendable {
        let date: String
        let letter: String
        let played: Bool
        let isToday: Bool
        var id: String { date }
    }

    let current: Int
    let playedToday: Bool
    let week: [Day]

    static func key(_ date: Date, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// Consecutive days played, ending today or yesterday: today stays open until midnight.
    init(days: [String: Int], now: Date = .now, calendar: Calendar = .current) {
        func day(_ back: Int) -> Date { calendar.date(byAdding: .day, value: -back, to: now) ?? now }
        func played(_ back: Int) -> Bool { (days[DayStreak.key(day(back), calendar: calendar)] ?? 0) > 0 }

        playedToday = played(0)
        var run = 0
        var back = playedToday ? 0 : 1
        while played(back) {
            run += 1
            back += 1
        }
        current = run
        let symbols = calendar.veryShortWeekdaySymbols
        week = (0..<7).map { i in
            let date = day(6 - i)
            let weekday = calendar.component(.weekday, from: date)
            return Day(date: DayStreak.key(date, calendar: calendar), letter: symbols[(weekday - 1) % symbols.count], played: played(6 - i), isToday: i == 6)
        }
    }
}

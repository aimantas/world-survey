import SwiftUI

/// The last seven days: a square for each, printed when you played.
struct WeekStrip: View {
    let streak: DayStreak

    var body: some View {
        HStack(spacing: 6) {
            ForEach(streak.week) { day in
                VStack(spacing: 3) {
                    Rectangle()
                        .fill(day.played ? Theme.surveyed : Theme.paperDeep)
                        .frame(height: 8)
                        .overlay { Rectangle().strokeBorder(day.isToday ? Theme.ink : Theme.ink.opacity(0.3), lineWidth: day.isToday ? 1.4 : 0.8) }
                    Text(day.letter)
                        .font(.measure(.caption2, weight: day.isToday ? .bold : .regular))
                        .foregroundStyle(day.isToday ? Theme.ink : Theme.ink3)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.hair).frame(height: 1) }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(streak.current > 0 ? "Played \(streak.current) days in a row" : "No streak yet")
    }
}

import SwiftUI

/// Round, score, streak and time along the bottom edge of the title block.
struct PlayCounters: View {
    let session: GameSession

    var body: some View {
        HStack(spacing: 0) {
            cell("Round", session.total.map { "\(session.roundNumber)/\($0)" } ?? "\(session.roundNumber)")
            divider
            if session.config.mode == .higherLower {
                cell("In a row", "\(session.streak)")
            } else {
                cell("Score", session.score.formatted())
                divider
                cell(session.config.mode == .streak ? "Streak ×\(session.multiplier.formatted())" : "Streak", "\(session.streak)")
            }
            divider
            VStack(alignment: .leading, spacing: 2) {
                Text("Time").fieldLabelStyle()
                if session.phase == .asking {
                    TimelineView(.periodic(from: session.askedAt, by: 0.1)) { context in
                        Text(max(0, context.date.timeIntervalSince(session.askedAt)).formatted(.number.precision(.fractionLength(1))))
                            .font(.measure(.callout))
                            .foregroundStyle(Theme.ink)
                    }
                } else {
                    Text(((session.lastResult?.ms ?? 0) / 1000).formatted(.number.precision(.fractionLength(1))))
                        .font(.measure(.callout))
                        .foregroundStyle(Theme.ink)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .accessibilityElement(children: .combine)
        }
        .padding(.vertical, 8)
        .fixedSize(horizontal: false, vertical: true)
        .overlay(alignment: .top) { Rectangle().fill(Theme.ink.opacity(0.5)).frame(height: 1) }
    }

    private var divider: some View {
        Rectangle().fill(Theme.hair).frame(width: 1)
    }

    private func cell(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).fieldLabelStyle().lineLimit(1).minimumScaleFactor(0.7)
            Text(value)
                .font(.measure(.callout))
                .foregroundStyle(Theme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .contentTransition(.numericText())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .accessibilityElement(children: .combine)
    }
}

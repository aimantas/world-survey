import SwiftUI

/// Higher or lower: one country's number is printed, the other's is the question.
struct HigherLowerView: View {
    let session: GameSession
    let round: Round
    let next: () -> Void

    private var result: RoundResult? { session.phase == .revealed ? session.lastResult : nil }

    var body: some View {
        if let stat = round.stat, let other = round.other {
            VStack(alignment: .leading, spacing: 12) {
                Text("\(stat.label): does \(round.country.name) have \(stat.question)?")
                    .font(.note(.body))
                    .foregroundStyle(Theme.waterInk)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(alignment: .top, spacing: 0) {
                    side(other, stat: stat, value: stat.value(other), asked: false)
                    Text("vs")
                        .font(.note(.subheadline))
                        .foregroundStyle(Theme.waterInk)
                        .padding(.top, 34)
                    side(round.country, stat: stat, value: result == nil ? nil : stat.value(round.country), asked: true)
                }
                .padding(12)
                .overlay { Rectangle().strokeBorder(Theme.ink, lineWidth: 1.2) }

                if let result {
                    Text(verdict(result, stat: stat, other: other))
                        .font(.subheadline)
                        .foregroundStyle(Theme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("\(session.score)")
                                .font(.measure(.title2, weight: .bold))
                                .foregroundStyle(Theme.ink)
                            Text("in a row")
                                .font(.measure(.caption2, weight: .regular))
                                .foregroundStyle(Theme.ink3)
                        }
                        .accessibilityElement(children: .combine)
                        Spacer()
                        Button(action: next) {
                            Label(session.isLastRound ? "Results" : "Next", systemImage: "arrow.right")
                                .labelStyle(TrailingIconLabelStyle())
                                .lineLimit(1)
                                .fixedSize()
                        }
                        .buttonStyle(InkButtonStyle())
                        .overlay(alignment: .bottom) {
                            if let deadline = session.autoNextAt {
                                CountdownRule(deadline: deadline, total: GameSession.autoNextDelay)
                                    .foregroundStyle(Theme.card.opacity(0.7))
                            }
                        }
                    }
                } else {
                    HStack(spacing: 8) {
                        Button {
                            session.answerHigherLower(higher: false)
                        } label: {
                            Label("Lower", systemImage: "arrow.down")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(RuledButtonStyle())
                        Button {
                            session.answerHigherLower(higher: true)
                        } label: {
                            Label("Higher", systemImage: "arrow.up")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(InkButtonStyle())
                    }
                }
            }
        }
    }

    private func side(_ country: Country, stat: Stat, value: Double?, asked: Bool) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            FlagView(country: country, height: 30)
            Text(country.name)
                .font(.system(.footnote, weight: .bold).width(.expanded))
                .textCase(.uppercase)
                .tracking(1.2)
                .foregroundStyle(Theme.ink)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
            Text(value.map(stat.format) ?? "?")
                .font(.measure(.headline, weight: .bold))
                .foregroundStyle(asked ? Theme.overprint : Theme.ink)
                .contentTransition(.numericText())
            if let year = stat.year(country), value != nil {
                Text("\(year.formatted(.number.grouping(.never))), World Bank")
                    .font(.note(.caption))
                    .foregroundStyle(Theme.ink3)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 6)
        .accessibilityElement(children: .combine)
    }

    private func verdict(_ result: RoundResult, stat: Stat, other: Country) -> AttributedString {
        var lead = AttributedString(result.correct ? "Right. " : "Not this time. ")
        lead.font = .subheadline.weight(.bold)
        lead.foregroundColor = result.correct ? Theme.surveyed : Theme.overprint
        guard let a = stat.value(other), let b = stat.value(round.country), a > 0, b > 0 else { return lead }
        let (big, small) = a >= b ? (other, round.country) : (round.country, other)
        let detail: String
        if stat == .lifeExpectancy {
            let years = abs(a - b).formatted(.number.precision(.fractionLength(1)))
            detail = "People in \(big.name) live \(years) years longer than in \(small.name)."
        } else {
            let ratio = max(a, b) / min(a, b)
            let times = ratio < 10 ? ratio.formatted(.number.precision(.fractionLength(1))) : Int(ratio.rounded()).formatted()
            detail = "\(big.name) is \(times)× \(small.name)."
        }
        return lead + AttributedString(detail)
    }
}

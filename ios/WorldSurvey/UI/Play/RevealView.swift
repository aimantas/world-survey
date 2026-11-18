import SwiftUI

/// The answer card: the country, a stamp, what you did, a few facts, the points and the way on.
struct RevealView: View {
    @Environment(AppModel.self) private var model
    let session: GameSession
    let result: RoundResult
    let next: () -> Void

    @Environment(\.dynamicTypeSize) private var typeSize

    private var country: Country { result.round.country }

    /// Side by side normally; stacked at accessibility sizes, where a row cannot hold both.
    private var row: AnyLayout {
        typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10)) : AnyLayout(HStackLayout(alignment: .top, spacing: 12))
    }

    private var footerRow: AnyLayout {
        typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(alignment: .center, spacing: 12))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            row {
                HStack(alignment: .top, spacing: 12) {
                    FlagView(country: country, height: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        PlaceName(country.name, style: .title3)
                        if let subregion = country.subregion {
                            Text(subregion)
                                .font(.note(.subheadline))
                                .foregroundStyle(Theme.waterInk)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Spacer(minLength: 4)
                }
                Stamp(text: stamp.text, color: stamp.color, angle: result.correct ? -6 : 5)
                    .padding(.top, 4)
                    .dynamicTypeSize(...DynamicTypeSize.accessibility1)
            }

            Text(verdict)
                .font(.subheadline)
                .foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)

            FactsGrid(country: country, units: model.progress.units, compact: true)

            footerRow {
                VStack(alignment: .leading, spacing: 1) {
                    Text("+\(result.points.formatted())")
                        .font(.measure(.title2, weight: .bold))
                        .foregroundStyle(result.correct ? Theme.surveyed : Theme.ink)
                    Text(pointsNote)
                        .font(.measure(.caption2, weight: .regular))
                        .foregroundStyle(Theme.ink3)
                }
                .accessibilityElement(children: .combine)
                if !typeSize.isAccessibilitySize { Spacer(minLength: 4) }
                if let url = country.pageURL {
                    Link("Country page", destination: url)
                        .font(.fieldLabel)
                        .textCase(.uppercase)
                        .tracking(1.1)
                        .foregroundStyle(Theme.ink)
                        .underline()
                        .lineLimit(2)
                        .multilineTextAlignment(.trailing)
                        .frame(minHeight: 44)
                }
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
        }
    }

    private var stamp: (text: String, color: Color) {
        if result.correct { return (result.newlySurveyed ? "Surveyed" : "Correct", Theme.surveyed) }
        if result.grade == .close { return ("Close", Theme.amber) }
        return ("Missed", Theme.overprint)
    }

    private var verdict: AttributedString {
        let units = model.progress.units
        let seconds = (result.ms / 1000).formatted(.number.precision(.fractionLength(1)))
        var text: AttributedString
        switch result.round.kind {
        case .find, .flagHunt:
            if result.correct {
                text = AttributedString(result.newlySurveyed ? "Found in \(seconds) s. It prints in colour from now on." : "Found in \(seconds) s.")
            } else if let picked = result.picked, let km = result.km {
                text = AttributedString("You picked ") + bold(picked.name) + AttributedString(", \(units.format(km: km)) off.")
            } else {
                text = AttributedString("Not found.")
            }
        case .capitalPin:
            let km = result.km ?? 0
            text = AttributedString("Your pin landed ") + bold(units.format(km: km)) + AttributedString(" from \(country.capital ?? "the capital").")
        case .nameIt, .flagQuiz:
            if result.correct {
                text = AttributedString("Right in \(seconds) s.")
            } else if let picked = result.picked {
                text = AttributedString("You picked ") + bold(picked.name) + AttributedString(".")
            } else {
                text = AttributedString("Missed.")
            }
        case .capitalQuiz:
            if result.correct {
                text = bold(country.capital ?? "") + AttributedString(" is the capital.")
            } else if let picked = result.picked, let capital = picked.capital {
                text = AttributedString("You picked ") + bold(capital) + AttributedString(", the capital of \(picked.name). Here it is ") + bold(country.capital ?? "") + AttributedString(".")
            } else {
                text = AttributedString("Missed.")
            }
        case .higherLower:
            text = AttributedString("")
        }
        return text
    }

    private func bold(_ string: String) -> AttributedString {
        var part = AttributedString(string)
        part.font = .subheadline.weight(.bold)
        return part
    }

    private var pointsNote: String {
        if result.correct {
            var parts: [String] = []
            if session.config.mode == .streak, session.streak > 1, Scoring.streakMultiplier(session.streak - 1) > 1 {
                parts.append("×\(Scoring.streakMultiplier(session.streak - 1).formatted()) streak")
            }
            if result.timeBonus > 0 { parts.append("\(result.timeBonus) time bonus") }
            return parts.isEmpty ? "points" : parts.joined(separator: " · ")
        }
        return result.points > 0 ? "near miss" : "no points"
    }
}

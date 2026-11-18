import SwiftUI

/// The question for one round, with its four options where the round has them.
struct QuestionView: View {
    let session: GameSession
    let round: Round
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            prompt
            if !round.options.isEmpty {
                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(round.options) { option in
                        Button {
                            session.choose(option)
                        } label: {
                            Text(round.kind == .capitalQuiz ? option.capital ?? option.name : option.name)
                                .font(.system(.subheadline, weight: .semibold))
                                .multilineTextAlignment(.center)
                                .lineLimit(2)
                                .minimumScaleFactor(0.8)
                        }
                        .buttonStyle(OptionButtonStyle())
                    }
                }
            }
            if let nudge = session.nudge {
                Text(nudge)
                    .font(.note(.subheadline))
                    .foregroundStyle(Theme.overprint)
                    .transition(.opacity)
            }
        }
    }

    private var columns: [GridItem] {
        let count = typeSize.isAccessibilitySize ? 1 : 2
        return Array(repeating: GridItem(.flexible(), spacing: 8), count: count)
    }

    @ViewBuilder
    private var prompt: some View {
        switch round.kind {
        case .find:
            VStack(alignment: .leading, spacing: 4) {
                Text(round.isRetry ? "Once more: find" : "Find").fieldLabelStyle()
                PlaceName(round.country.name)
                Text("Tap the country on the globe. Pinch to zoom in.")
                    .font(.note(.subheadline))
                    .foregroundStyle(Theme.waterInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        case .flagHunt:
            HStack(alignment: .center, spacing: 14) {
                FlagView(country: round.country, height: 66)
                    .accessibilityHidden(false)
                    .accessibilityLabel("A flag")
                VStack(alignment: .leading, spacing: 4) {
                    Text("Flag hunt").fieldLabelStyle()
                    Text("Whose flag is this? Tap its country on the globe.")
                        .font(.note(.body))
                        .foregroundStyle(Theme.waterInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        case .capitalPin:
            VStack(alignment: .leading, spacing: 4) {
                Text("Drop a pin on").fieldLabelStyle()
                PlaceName(round.country.capital ?? round.country.name)
                Text("Tap the globe where the city is. Closer scores more.")
                    .font(.note(.subheadline))
                    .foregroundStyle(Theme.waterInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        case .nameIt:
            VStack(alignment: .leading, spacing: 4) {
                Text(round.isRetry ? "Once more" : "Name it").fieldLabelStyle()
                Text("Which country is marked on the globe?")
                    .font(.note(.body))
                    .foregroundStyle(Theme.waterInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        case .flagQuiz:
            HStack(alignment: .center, spacing: 14) {
                FlagView(country: round.country, height: 66)
                    .accessibilityHidden(false)
                    .accessibilityLabel("A flag")
                VStack(alignment: .leading, spacing: 4) {
                    Text(session.config.mode == .lookalikes ? "Lookalike flags" : "Flag quiz").fieldLabelStyle()
                    Text("Whose flag is this?")
                        .font(.note(.body))
                        .foregroundStyle(Theme.waterInk)
                }
            }
        case .capitalQuiz:
            VStack(alignment: .leading, spacing: 4) {
                Text("The capital of").fieldLabelStyle()
                PlaceName(round.country.name)
            }
        case .higherLower:
            EmptyView()
        }
    }
}

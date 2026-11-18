import SwiftUI

/// The wordmark and the survey count, printed along the top margin of the sheet.
struct Masthead: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let surveyed = model.progress.state.surveyed(in: model.data.sovereign)
        let total = model.data.sovereign.count
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                GlobeMark()
                    .frame(width: 22, height: 22)
                Text("World Survey")
                    .font(.system(.subheadline, weight: .heavy).width(.expanded))
                    .textCase(.uppercase)
                    .tracking(2.2)
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .padding(.horizontal, 10)
            .frame(minHeight: 40)
            .background(Theme.paper.opacity(0.92))
            .layoutPriority(1)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("World Survey")
            .accessibilityAddTraits(.isHeader)

            Spacer(minLength: 0)

            Button {
                model.select(.progress)
            } label: {
                VStack(spacing: 4) {
                    HStack(spacing: 4) {
                        Text("\(surveyed)")
                            .foregroundStyle(Theme.surveyed)
                        Text("/ \(total)")
                            .foregroundStyle(Theme.ink)
                    }
                    .font(.measure(.footnote))
                    .lineLimit(1)
                    .fixedSize()
                    .contentTransition(.numericText())
                    ProgressRule(value: Double(surveyed) / Double(max(1, total)))
                        .frame(width: 58, height: 5)
                }
                .padding(.horizontal, 10)
                .frame(minHeight: 44)
                .background(Theme.card)
                .overlay { Rectangle().strokeBorder(Theme.ink, lineWidth: 1.2) }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(surveyed) of \(total) countries surveyed")
            .accessibilityHint("Opens the Progress tab")

            Button("Settings", systemImage: "gearshape") {
                model.sheet = .settings
            }
            .labelStyle(.iconOnly)
            .font(.body.weight(.semibold))
            .foregroundStyle(Theme.ink)
            .frame(width: 44, height: 44)
            .background(Theme.card)
            .overlay { Rectangle().strokeBorder(Theme.ink, lineWidth: 1.2) }
        }
    }
}

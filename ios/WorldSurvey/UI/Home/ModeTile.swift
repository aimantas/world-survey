import SwiftUI

/// One game on the Play tab: its mark, name, what you do, and your best at the chosen region and level.
struct ModeTile: View {
    let group: ModeGroup
    let best: Int?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 7) {
                HStack(alignment: .top) {
                    Image(systemName: group.symbol)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(Theme.overprint)
                        .frame(width: 40, height: 40)
                        .background(Theme.overprintSoft)
                        .overlay { Rectangle().strokeBorder(Theme.overprint.opacity(0.5), lineWidth: 1) }
                    Spacer(minLength: 4)
                    if group.choices > 1 {
                        Text("\(group.choices) games")
                            .font(.measure(.caption2, weight: .regular))
                            .foregroundStyle(Theme.ink3)
                    }
                }
                Text(group.name)
                    .font(.system(.subheadline, weight: .bold).width(.expanded))
                    .textCase(.uppercase)
                    .tracking(1.2)
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(group.tileBlurb)
                    .font(.note(.footnote))
                    .foregroundStyle(Theme.waterInk)
                    .lineLimit(2, reservesSpace: true)
                    .multilineTextAlignment(.leading)
                Text(bestLine)
                    .font(.measure(.caption))
                    .foregroundStyle(best == nil ? Theme.ink3 : Theme.surveyed)
                    .lineLimit(1)
            }
            .padding(12)
            .frame(maxHeight: .infinity, alignment: .topLeading)
        }
        .buttonStyle(TileButtonStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(group.name). \(group.tileBlurb) \(bestLine).")
        .accessibilityHint(group.choices > 1 ? "Shows \(group.choices) games" : "Starts a game")
        .accessibilityAddTraits(.isButton)
    }

    private var bestLine: String {
        guard let best else { return "Not played yet" }
        return group == .higherLower ? "Best run \(best)" : "Best \(best.formatted())"
    }
}

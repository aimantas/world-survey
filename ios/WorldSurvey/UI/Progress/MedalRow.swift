import SwiftUI

struct MedalRow: View {
    let medal: Medal
    let earned: Date?

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: medal.symbol)
                .font(.title3)
                .foregroundStyle(earned == nil ? Theme.ink3 : Theme.card)
                .frame(width: 40, height: 40)
                .background(earned == nil ? Theme.paperDeep : Theme.surveyed, in: .circle)
                .overlay { Circle().strokeBorder(earned == nil ? Theme.ink.opacity(0.3) : Theme.surveyed, lineWidth: 1.2) }
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(medal.name)
                    .font(.system(.subheadline, weight: .bold).width(.expanded))
                    .foregroundStyle(earned == nil ? Theme.ink2 : Theme.ink)
                Text(medal.text)
                    .font(.note(.footnote))
                    .foregroundStyle(Theme.ink2)
                if let earned {
                    Text(earned, format: .dateTime.day().month().year())
                        .font(.measure(.caption2, weight: .regular))
                        .foregroundStyle(Theme.surveyed)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(medal.name). \(medal.text) \(earned == nil ? "Not earned yet." : "Earned.")")
    }
}

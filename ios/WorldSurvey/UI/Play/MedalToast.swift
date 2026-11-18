import SwiftUI

/// A medal that has just been earned, shown above the title block for a moment.
struct MedalToast: View {
    let medal: Medal

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 1) {
                Text("Medal").fieldLabelStyle()
                Text(medal.name)
                    .font(.system(.subheadline, weight: .bold).width(.expanded))
                    .foregroundStyle(Theme.ink)
            }
        } icon: {
            Image(systemName: medal.symbol)
                .foregroundStyle(Theme.surveyed)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Theme.card)
        .overlay { Rectangle().strokeBorder(Theme.surveyed, lineWidth: 1.5) }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Medal earned: \(medal.name)")
    }
}

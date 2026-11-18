import SwiftUI

/// The main action: a solid ink block with wide capitals.
struct InkButtonStyle: ButtonStyle {
    var color = Theme.ink
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.control)
            .textCase(.uppercase)
            .tracking(1.8)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .dynamicTypeSize(...DynamicTypeSize.accessibility1)
            .foregroundStyle(Theme.card)
            .padding(.horizontal, 20)
            .frame(minHeight: 52)
            .background(color.opacity(isEnabled ? 1 : 0.35))
            .opacity(configuration.isPressed ? 0.82 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
            .contentShape(.rect)
    }
}

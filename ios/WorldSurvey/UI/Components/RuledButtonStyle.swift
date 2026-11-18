import SwiftUI

/// A secondary action: ruled outline, ink lettering.
struct RuledButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.control)
            .textCase(.uppercase)
            .tracking(1.6)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .dynamicTypeSize(...DynamicTypeSize.accessibility1)
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 16)
            .frame(minHeight: 52)
            .background(configuration.isPressed ? Theme.paperDeep : Theme.card)
            .overlay { Rectangle().strokeBorder(Theme.ink, lineWidth: 1.5) }
            .contentShape(.rect)
    }
}

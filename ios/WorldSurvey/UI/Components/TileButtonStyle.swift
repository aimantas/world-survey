import SwiftUI

/// A card that is a button: card stock and an ink rule, pressed into the paper when touched.
struct TileButtonStyle: ButtonStyle {
    var tint = Theme.card

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(configuration.isPressed ? Theme.paperDeep : tint)
            .overlay { Rectangle().strokeBorder(Theme.ink, lineWidth: 1.2) }
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
            .contentShape(.rect)
    }
}

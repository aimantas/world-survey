import SwiftUI

/// A rubber stamp: heavy capitals in a ruled box, set slightly off square. It lands once and stays.
struct Stamp: View {
    let text: String
    var color = Theme.surveyed
    var angle = -6.0

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var landed = false

    var body: some View {
        Text(text)
            .font(.system(.footnote, weight: .heavy).width(.expanded))
            .textCase(.uppercase)
            .tracking(2.4)
            .lineLimit(1)
            .fixedSize()
            .foregroundStyle(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .overlay { Rectangle().strokeBorder(color, lineWidth: 2) }
            .rotationEffect(.degrees(angle))
            .scaleEffect(landed || reduceMotion ? 1 : 1.7)
            .opacity(landed || reduceMotion ? 1 : 0)
            .onAppear {
                withAnimation(.spring(duration: 0.28, bounce: 0.35).delay(0.18)) { landed = true }
            }
            .accessibilityLabel(text)
    }
}

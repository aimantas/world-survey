import SwiftUI

/// A thin ruled progress bar: green print on a hairline box.
struct ProgressRule: View {
    let value: Double
    var color = Theme.surveyed

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Rectangle().fill(Theme.paperDeep)
                Rectangle().fill(color).frame(width: proxy.size.width * min(1, max(0, value)))
            }
            .overlay { Rectangle().strokeBorder(Theme.ink.opacity(0.55), lineWidth: 0.8) }
        }
        .accessibilityHidden(true)
    }
}

import SwiftUI

/// A rule along the bottom of the Next button that drains until the next country comes up.
/// With Reduce Motion it stays still: it marks that the card moves on, without the motion.
struct CountdownRule: View {
    let deadline: Date
    let total: TimeInterval
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { context in
            let left = reduceMotion ? 1 : max(0, min(1, deadline.timeIntervalSince(context.date) / total))
            GeometryReader { proxy in
                Rectangle()
                    .frame(width: proxy.size.width * left)
            }
        }
        .frame(height: 3)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

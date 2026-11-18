import SwiftUI

/// Shows its content at its natural height, and scrolls it once it would outgrow the panel.
struct PanelBody<Content: View>: View {
    @Environment(\.panelBodyMaxHeight) private var maxHeight
    @State private var contentHeight: CGFloat = 0
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView {
            content
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
        }
        .scrollBounceBehavior(.basedOnSize)
        // A scroll view takes all the height it is offered, so the panel is sized from its content.
        .frame(height: min(maxHeight, contentHeight > 0 ? contentHeight : 140))
    }
}

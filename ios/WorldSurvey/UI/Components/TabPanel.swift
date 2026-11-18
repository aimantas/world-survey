import SwiftUI

/// The ruled panel a tab lives in: a header strip over content that scrolls, at a fixed share of
/// the screen so the globe above keeps its room.
struct TabPanel<Content: View>: View {
    let title: String
    var detail = ""
    var share: CGFloat = 0.5
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 0) {
            PanelHeader(title: title, detail: detail)
            ScrollView {
                content
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .containerRelativeFrame(.vertical) { height, _ in height * share }
        .sheetCard()
    }
}

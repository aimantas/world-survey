import SwiftUI

/// The header strip of a panel: where you are on the left, context on the right.
struct PanelHeader: View {
    let title: String
    var detail = ""
    var back: (() -> Void)?

    var body: some View {
        HStack(spacing: 6) {
            if let back {
                Button("Back", systemImage: "chevron.left", action: back)
                    .labelStyle(.iconOnly)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Theme.ink)
                    .frame(width: 44, height: 44)
                    .contentShape(.rect)
            }
            Text(title)
                .font(.system(.footnote, weight: .bold).width(.condensed))
                .textCase(.uppercase)
                .tracking(1.4)
                .foregroundStyle(Theme.ink)
                .lineLimit(1)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            Text(detail)
                .font(.system(.footnote, weight: .semibold).width(.condensed))
                .textCase(.uppercase)
                .tracking(1.4)
                .foregroundStyle(Theme.ink3)
                .lineLimit(1)
        }
        .padding(.leading, back == nil ? 16 : 4)
        .padding(.trailing, 16)
        .frame(minHeight: 44)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.ink.opacity(0.5)).frame(height: 1) }
    }
}

import SwiftUI

/// The four tabs along the bottom margin of the sheet. The selected one is printed in overprint
/// magenta with a rule above it, like the active control on the web game.
struct HomeTabBar: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        HStack(spacing: 0) {
            ForEach(HomeTab.allCases) { tab in
                let selected = model.tab == tab
                Button {
                    model.select(tab)
                } label: {
                    VStack(spacing: 3) {
                        Image(systemName: selected ? tab.selectedSymbol : tab.symbol)
                            .font(.system(size: 19, weight: .semibold))
                            .frame(height: 24)
                        Text(tab.title)
                            .font(.system(.caption2, weight: .bold).width(.condensed))
                            .textCase(.uppercase)
                            .tracking(1.1)
                    }
                    .foregroundStyle(selected ? Theme.overprint : Theme.ink2)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .overlay(alignment: .top) {
                        if selected {
                            Rectangle().fill(Theme.overprint).frame(height: 3)
                        }
                    }
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tab.title)
                .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
            }
        }
        .padding(.horizontal, 8)
        .background(Theme.paper.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { Rectangle().fill(Theme.ink).frame(height: 1.2) }
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
        .sensoryFeedback(.selection, trigger: model.tab)
    }
}

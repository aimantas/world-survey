import SwiftUI

/// The first thing the app shows: how much of the world you have surveyed, today's expedition and
/// your next step, the region and level, and every game as a tile.
struct PlayTab: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dynamicTypeSize) private var typeSize

    private var columns: [GridItem] {
        let column = GridItem(.flexible(), spacing: 10, alignment: .top)
        return typeSize.isAccessibilitySize ? [column] : [column, column]
    }

    var body: some View {
        let streak = model.progress.streak
        TabPanel(title: "Play", detail: streak.current > 0 ? "\(streak.current)-day streak" : "Pick a game") {
            VStack(alignment: .leading, spacing: 16) {
                SurveySummary()
                // Side by side, the same height; stacked at the largest text sizes.
                if typeSize.isAccessibilitySize {
                    VStack(spacing: 10) {
                        DailyCard()
                        ContinueCard()
                    }
                } else {
                    HStack(alignment: .top, spacing: 10) {
                        DailyCard()
                        ContinueCard()
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
                SelectionBar()
                VStack(alignment: .leading, spacing: 8) {
                    Text("Games").fieldLabelStyle()
                    LazyVGrid(columns: columns, spacing: 10) {
                        ForEach(ModeGroup.allCases) { group in
                            ModeTile(group: group, best: model.best(for: group)) {
                                model.open(group)
                            }
                        }
                    }
                }
            }
            .padding(14)
        }
    }
}

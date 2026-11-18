import SwiftUI

/// The region and level every game on the tab uses. Choosing a region turns the globe to it.
struct SelectionBar: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Region").fieldLabelStyle()
            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    ForEach(WorldData.regions, id: \.self) { region in
                        let count = region == "World" ? model.data.sovereign.count : model.data.sovereign.count { $0.region == region }
                        chip(selected: model.region == region, label: region, detail: "\(count)") {
                            model.setRegion(region)
                        }
                    }
                }
            }
            .scrollIndicators(.hidden)
            // Chips scroll to just inside the panel's ruled edge rather than stopping at the text margin.
            .contentMargins(.horizontal, 10, for: .scrollContent)
            .padding(.horizontal, -10)
            HStack(alignment: .firstTextBaseline) {
                Text("Level").fieldLabelStyle()
                Spacer()
                Text(model.difficulty.note)
                    .font(.note(.footnote))
                    .foregroundStyle(Theme.waterInk)
            }
            .padding(.top, 2)
            HStack(spacing: 6) {
                ForEach(Difficulty.allCases) { level in
                    chip(selected: model.difficulty == level, label: level.label, detail: nil) {
                        model.setDifficulty(level)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .sensoryFeedback(.selection, trigger: model.region)
        .sensoryFeedback(.selection, trigger: model.difficulty)
    }

    private func chip(selected: Bool, label: String, detail: String?, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Text(label)
                    .font(.system(.subheadline, weight: .semibold))
                if let detail {
                    Text(detail)
                        .font(.measure(.caption, weight: .regular))
                        .foregroundStyle(selected ? Theme.card.opacity(0.75) : Theme.ink3)
                }
            }
            .lineLimit(1)
            .foregroundStyle(selected ? Theme.card : Theme.ink)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: 42)
            .background(selected ? Theme.ink : Theme.card)
            .overlay { Rectangle().strokeBorder(Theme.ink, lineWidth: selected ? 0 : 1) }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

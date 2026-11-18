import SwiftUI

/// The games inside a tile that holds several: Flags, Capitals, or the measures of Higher or lower.
/// One tap starts the game with the region and level from the Play tab.
struct ModePicker: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let group: ModeGroup

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    Text(context)
                        .font(.note(.subheadline))
                        .foregroundStyle(Theme.waterInk)
                        .padding(.bottom, 4)
                    if group == .higherLower {
                        ForEach(HigherLowerPreset.allCases) { preset in
                            row(preset.name, preset.blurb, best: model.best(for: .higherLower, preset: preset).map { "Best run \($0)" }) {
                                model.startMode(.higherLower, preset: preset)
                            }
                        }
                    } else {
                        ForEach(group.modes) { mode in
                            row(mode.name, mode.blurb, best: model.best(for: mode).map { "Best \($0.formatted())" }) {
                                model.startMode(mode)
                            }
                        }
                    }
                }
                .padding(16)
            }
            .background(Theme.paper)
            .navigationTitle(group.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", systemImage: "xmark") { dismiss() }
                }
            }
        }
        .presentationDetents(group == .higherLower ? [.large] : [.medium, .large])
    }

    private var context: String {
        let level = "\(model.region) · \(model.difficulty.label)"
        return group == .flags ? "\(level). Lookalike flags uses its own set of 25 groups." : "\(level). Change them on the Play tab."
    }

    private func row(_ name: String, _ blurb: String, best: String?, start: @escaping () -> Void) -> some View {
        Button(action: start) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(name)
                        .font(.system(.subheadline, weight: .bold).width(.expanded))
                        .textCase(.uppercase)
                        .tracking(1.2)
                        .foregroundStyle(Theme.ink)
                    Text(blurb)
                        .font(.note(.subheadline))
                        .foregroundStyle(Theme.waterInk)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(best ?? "Not played yet")
                        .font(.measure(.caption))
                        .foregroundStyle(best == nil ? Theme.ink3 : Theme.surveyed)
                }
                Spacer(minLength: 8)
                Image(systemName: "play.fill")
                    .font(.footnote)
                    .foregroundStyle(Theme.card)
                    .frame(width: 34, height: 34)
                    .background(Theme.ink)
                    .accessibilityHidden(true)
            }
            .padding(12)
        }
        .buttonStyle(TileButtonStyle())
        .accessibilityHint("Starts the game")
    }
}

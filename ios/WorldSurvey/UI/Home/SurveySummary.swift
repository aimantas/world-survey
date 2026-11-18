import SwiftUI

/// Your survey at a glance: countries surveyed, each region's share, the day streak, medals and
/// lessons. Opens the Progress tab.
struct SurveySummary: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dynamicTypeSize) private var typeSize

    /// Five regions across normally; two columns at the largest text sizes.
    private var regionColumns: [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: 8, alignment: .topLeading), count: typeSize.isAccessibilitySize ? 2 : 5)
    }

    /// The streak, medals and lessons in a row, or stacked when the text is too large for one line.
    private var figuresLayout: AnyLayout {
        typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6)) : AnyLayout(HStackLayout(spacing: 14))
    }

    var body: some View {
        let state = model.progress.state
        let sovereign = model.data.sovereign
        let done = state.surveyed(in: sovereign)
        let share = Double(done) / Double(max(1, sovereign.count))
        Button {
            model.select(.progress)
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(done.formatted())
                        .font(.measure(.largeTitle, weight: .bold))
                        .foregroundStyle(Theme.surveyed)
                        .contentTransition(.numericText())
                    Text("of \(sovereign.count) countries surveyed")
                        .font(.subheadline)
                        .foregroundStyle(Theme.ink)
                    Spacer(minLength: 4)
                    Text(share.formatted(.percent.precision(.fractionLength(0))))
                        .font(.measure(.subheadline))
                        .foregroundStyle(Theme.ink2)
                }
                ProgressRule(value: share)
                    .frame(height: 6)
                LazyVGrid(columns: regionColumns, alignment: .leading, spacing: 10) {
                    ForEach(WorldData.courseRegions, id: \.self) { region in
                        let members = sovereign.filter { $0.region == region }
                        let count = state.surveyed(in: members)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(region)
                                .font(.system(.caption2, weight: .semibold).width(.condensed))
                                .textCase(.uppercase)
                                .tracking(0.6)
                                .foregroundStyle(Theme.ink3)
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                            ProgressRule(value: Double(count) / Double(max(1, members.count)))
                                .frame(height: 4)
                            Text("\(count)/\(members.count)")
                                .font(.measure(.caption2, weight: .regular))
                                .foregroundStyle(count == members.count ? Theme.surveyed : Theme.ink2)
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                figuresLayout {
                    figure("flame.fill", "\(model.progress.streak.current)", model.progress.streak.current == 1 ? "day" : "days")
                    figure("rosette", "\(state.medals.count)/\(Medal.all.count)", "medals")
                    figure("book.closed.fill", "\(model.lessonsDone)/\(model.data.lessons.count)", "lessons")
                    if !typeSize.isAccessibilitySize {
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.bold))
                            .foregroundStyle(Theme.ink3)
                    }
                }
            }
            .padding(12)
        }
        .buttonStyle(TileButtonStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(done) of \(sovereign.count) countries surveyed. \(model.progress.streak.current) day streak, \(state.medals.count) medals, \(model.lessonsDone) lessons done.")
        .accessibilityHint("Opens the Progress tab")
        .accessibilityAddTraits(.isButton)
    }

    private func figure(_ symbol: String, _ value: String, _ unit: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: symbol)
                .font(.caption)
                .foregroundStyle(Theme.overprint)
            Text(value)
                .font(.measure(.footnote))
                .foregroundStyle(Theme.ink)
            Text(unit)
                .font(.footnote)
                .foregroundStyle(Theme.ink3)
        }
        .lineLimit(1)
    }
}

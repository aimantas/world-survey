import SwiftUI

/// Your survey so far: the world by region, the week, your records, the numbers and the medals.
struct ProgressTab: View {
    @Environment(AppModel.self) private var model

    private struct Record: Identifiable {
        let id: String
        let name: String
        let value: String
        let order: Int
    }

    var body: some View {
        let state = model.progress.state
        let sovereign = model.data.sovereign
        let streak = model.progress.streak
        TabPanel(title: "Your survey", detail: "\(state.medals.count) / \(Medal.all.count) medals") {
            VStack(alignment: .leading, spacing: 20) {
                section("World surveyed") {
                    VStack(spacing: 10) {
                        regionRow("World", done: state.surveyed(in: sovereign), total: sovereign.count)
                        ForEach(WorldData.courseRegions, id: \.self) { region in
                            let members = sovereign.filter { $0.region == region }
                            regionRow(region, done: state.surveyed(in: members), total: members.count)
                        }
                    }
                }
                section("This week") {
                    VStack(alignment: .leading, spacing: 4) {
                        WeekStrip(streak: streak)
                            .padding(.horizontal, -16)
                        Text(streak.current > 0
                             ? "\(streak.current)-day streak. Play today to keep it going."
                             : "Play a game today to start a streak.")
                            .font(.note(.footnote))
                            .foregroundStyle(Theme.waterInk)
                    }
                }
                section("Records") {
                    let records = self.records(state)
                    if records.isEmpty {
                        Text("No records yet. Finish a game to set one.")
                            .font(.note(.subheadline))
                            .foregroundStyle(Theme.waterInk)
                    } else {
                        VStack(spacing: 0) {
                            ForEach(records) { record in
                                HStack {
                                    Text(record.name)
                                        .font(.subheadline)
                                        .foregroundStyle(Theme.ink)
                                        .lineLimit(1)
                                        .minimumScaleFactor(0.8)
                                    Spacer(minLength: 8)
                                    Text(record.value)
                                        .font(.measure(.subheadline))
                                        .foregroundStyle(Theme.surveyed)
                                }
                                .padding(.vertical, 7)
                                .overlay(alignment: .bottom) { Rectangle().fill(Theme.hair).frame(height: 1) }
                                .accessibilityElement(children: .combine)
                            }
                        }
                    }
                }
                section("Field notes") {
                    LazyVGrid(columns: [GridItem(.flexible(), alignment: .topLeading), GridItem(.flexible(), alignment: .topLeading)], alignment: .leading, spacing: 10) {
                        figure("Games", state.stats.games.formatted())
                        figure("Answers", state.stats.answers.formatted())
                        figure("Correct", state.stats.answers > 0 ? (Double(state.stats.correct) / Double(state.stats.answers)).formatted(.percent.precision(.fractionLength(0))) : "—")
                        figure("Fastest", state.stats.fastestMs.map { "\(($0 / 1000).formatted(.number.precision(.fractionLength(1)))) s" } ?? "—")
                        figure("Best run", state.bestStreak.formatted())
                        figure("Visited in atlas", state.visited.count.formatted())
                    }
                }
                section("Medals · \(state.medals.count) / \(Medal.all.count)") {
                    VStack(alignment: .leading, spacing: 12) {
                        // Earned first, then the rest in their usual order.
                        ForEach(Medal.all.sorted { (state.medals[$0.id] != nil ? 0 : 1) < (state.medals[$1.id] != nil ? 0 : 1) }) { medal in
                            MedalRow(medal: medal, earned: state.medals[medal.id])
                        }
                    }
                }
            }
            .padding(14)
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(.footnote, weight: .bold).width(.condensed))
                .textCase(.uppercase)
                .tracking(1.4)
                .foregroundStyle(Theme.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, 6)
                .overlay(alignment: .bottom) { Rectangle().fill(Theme.ink.opacity(0.5)).frame(height: 1) }
                .accessibilityAddTraits(.isHeader)
            content()
        }
    }

    private func regionRow(_ name: String, done: Int, total: Int) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(name)
                    .font(.system(.subheadline, weight: .bold).width(.expanded))
                    .foregroundStyle(Theme.ink)
                Spacer()
                Text("\(done) / \(total)")
                    .font(.measure(.subheadline))
                    .foregroundStyle(done == total ? Theme.surveyed : Theme.ink)
            }
            ProgressRule(value: Double(done) / Double(max(1, total)))
                .frame(height: 6)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(name): \(done) of \(total) surveyed")
    }

    private func figure(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).fieldLabelStyle()
            Text(value)
                .font(.measure(.title3, weight: .bold))
                .foregroundStyle(Theme.ink)
        }
        .accessibilityElement(children: .combine)
    }

    /// Saved records, named the way the Play tab names them: "Find it · Europe · Easy".
    private func records(_ state: ProgressState) -> [Record] {
        let modeOrder = GameMode.allCases
        return state.records.compactMap { key, value -> Record? in
            let parts = key.split(separator: ":").map(String.init)
            switch parts.first {
            case "daily":
                return Record(id: key, name: "Daily expedition", value: value.formatted(), order: 0)
            case "streak":
                return Record(id: key, name: "Streak", value: value.formatted(), order: 20)
            case "lookalikes":
                return Record(id: key, name: "Lookalike flags", value: value.formatted(), order: 10)
            case "higherlower":
                let preset = parts.count > 1 ? HigherLowerPreset(rawValue: parts[1])?.name ?? parts[1] : "Mixed"
                return Record(id: key, name: "Higher or lower · \(preset)", value: "\(value) in a row", order: 30)
            default:
                guard let raw = parts.first, let mode = GameMode(rawValue: raw) else { return nil }
                let level = parts.count > 2 ? Difficulty(rawValue: parts[2])?.label ?? parts[2] : ""
                let region = parts.count > 1 ? parts[1] : ""
                let order = (modeOrder.firstIndex(of: mode) ?? 0) + 1
                return Record(id: key, name: [mode.name, region, level].filter { !$0.isEmpty }.joined(separator: " · "), value: value.formatted(), order: order)
            }
        }
        .sorted { a, b in a.order != b.order ? a.order < b.order : a.name < b.name }
    }
}

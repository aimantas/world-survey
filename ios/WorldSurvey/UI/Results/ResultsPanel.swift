import SwiftUI

/// The survey report: a rank stamp, the score, every round, and what to do next.
struct ResultsPanel: View {
    @Environment(AppModel.self) private var model
    let summary: GameSummary

    private var isCounted: Bool { summary.config.mode == .higherLower }

    var body: some View {
        VStack(spacing: 0) {
            PanelHeader(title: "Survey report", detail: summary.config.title) {
                model.goHome()
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .bottom) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(isCounted ? "In a row" : "Score").fieldLabelStyle()
                            Text(summary.score.formatted())
                                .font(.measure(.largeTitle, weight: .bold))
                                .foregroundStyle(Theme.ink)
                            if summary.isRecord {
                                Text(summary.previousRecord > 0 ? "New record. Was \(summary.previousRecord.formatted())." : "First record on this sheet.")
                                    .font(.note(.subheadline))
                                    .foregroundStyle(Theme.surveyed)
                            } else if summary.previousRecord > 0 {
                                Text("Record \(summary.previousRecord.formatted())")
                                    .font(.note(.subheadline))
                                    .foregroundStyle(Theme.ink3)
                            }
                        }
                        .accessibilityElement(children: .combine)
                        Spacer(minLength: 8)
                    }
                    // The rank goes on its own line: "Chief cartographer" is wider than the score.
                    Stamp(text: summary.rank.name, color: summary.rank.rawValue >= 2 ? Theme.surveyed : Theme.ink2, angle: -3)
                        .padding(.vertical, 4)
                        .padding(.leading, 4)

                    HStack(spacing: 0) {
                        figure("Correct", "\(summary.correctCount)/\(summary.results.count)")
                        figure("Best run", "\(summary.bestStreak)")
                        figure("Avg time", "\(summary.averageSeconds.formatted(.number.precision(.fractionLength(1)))) s")
                        if summary.newlySurveyed > 0 {
                            figure("Surveyed", "+\(summary.newlySurveyed)")
                        }
                    }
                    .padding(.vertical, 8)
                    .fixedSize(horizontal: false, vertical: true)
                    .overlay(alignment: .top) { Rectangle().fill(Theme.hair).frame(height: 1) }
                    .overlay(alignment: .bottom) { Rectangle().fill(Theme.hair).frame(height: 1) }

                    if summary.config.mode == .lesson {
                        Text(summary.lessonFirstTime ? "Lesson complete. The next one is open in the field course." : "Lesson repeated. Your best result is kept.")
                            .font(.note(.subheadline))
                            .foregroundStyle(Theme.waterInk)
                    }

                    ForEach(summary.newMedals) { medal in
                        Label {
                            VStack(alignment: .leading, spacing: 1) {
                                Text("Medal earned").fieldLabelStyle()
                                Text(medal.name)
                                    .font(.system(.subheadline, weight: .bold).width(.expanded))
                                    .foregroundStyle(Theme.ink)
                                Text(medal.text)
                                    .font(.note(.footnote))
                                    .foregroundStyle(Theme.ink2)
                            }
                        } icon: {
                            Image(systemName: medal.symbol)
                                .font(.title3)
                                .foregroundStyle(Theme.surveyed)
                        }
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.surveyedSoft)
                        .overlay { Rectangle().strokeBorder(Theme.surveyed, lineWidth: 1.2) }
                        .accessibilityElement(children: .combine)
                    }

                    VStack(spacing: 0) {
                        ForEach(summary.results) { result in
                            ResultRow(result: result, units: model.progress.units)
                        }
                    }
                }
                .padding(16)
            }
            .scrollBounceBehavior(.basedOnSize)

            actions
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .overlay(alignment: .top) { Rectangle().fill(Theme.ink.opacity(0.5)).frame(height: 1) }
        }
        .containerRelativeFrame(.vertical) { height, _ in height * 0.58 }
        .sheetCard()
    }

    private var actions: some View {
        HStack(spacing: 8) {
            if let share = summary.shareText {
                ShareLink(item: share) {
                    Label("Share", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(RuledButtonStyle())
            } else if !summary.missed.isEmpty, summary.config.mode != .higherLower {
                Button {
                    model.startPractice(from: summary)
                } label: {
                    Text("Practise \(summary.missed.count)")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(RuledButtonStyle())
            }
            Button {
                again()
            } label: {
                Label(againTitle, systemImage: "arrow.right")
                    .labelStyle(TrailingIconLabelStyle())
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(InkButtonStyle())
        }
    }

    private var againTitle: String {
        switch summary.config.mode {
        case .daily, .review, .practice: "Done"
        case .lesson: model.nextLesson == nil ? "Done" : "Next lesson"
        default: "Again"
        }
    }

    private func again() {
        switch summary.config.mode {
        case .daily, .review, .practice:
            model.goHome()
        case .lesson:
            if let lesson = model.nextLesson { model.openLesson(lesson) } else { model.goHome() }
        default:
            model.start(summary.config)
        }
    }

    private func figure(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).fieldLabelStyle().lineLimit(1)
            Text(value)
                .font(.measure(.callout))
                .foregroundStyle(Theme.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

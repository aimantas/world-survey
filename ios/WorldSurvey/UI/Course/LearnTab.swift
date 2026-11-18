import SwiftUI

/// The field course as a tab: where you are in it, the next lesson, what is due for review, and
/// every lesson by region. The globe shows the next lesson's countries.
struct LearnTab: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let total = model.data.lessons.count
        let done = model.lessonsDone
        let next = model.nextLesson
        TabPanel(title: "Field course", detail: "\(done) / \(total) lessons") {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("All 195 countries in short lessons of neighbours. Study a card for each, then find and name them.")
                        .font(.note(.subheadline))
                        .foregroundStyle(Theme.waterInk)
                        .fixedSize(horizontal: false, vertical: true)
                    ProgressRule(value: Double(done) / Double(max(1, total)))
                        .frame(height: 6)
                }
                if let next {
                    nextLessonCard(next)
                }
                if model.dueCount > 0 {
                    reviewRow(model.dueCount)
                }
                ForEach(WorldData.courseRegions, id: \.self) { region in
                    let lessons = model.data.lessons(in: region)
                    let regionDone = lessons.count { model.progress.state.course[$0.slug] != nil }
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(region)
                                .font(.system(.footnote, weight: .bold).width(.condensed))
                                .textCase(.uppercase)
                                .tracking(1.4)
                                .foregroundStyle(Theme.ink)
                                .accessibilityAddTraits(.isHeader)
                            Spacer()
                            Text("\(regionDone) / \(lessons.count)")
                                .font(.measure(.caption))
                                .foregroundStyle(regionDone == lessons.count ? Theme.surveyed : Theme.ink3)
                        }
                        .padding(.bottom, 6)
                        .overlay(alignment: .bottom) { Rectangle().fill(Theme.ink.opacity(0.5)).frame(height: 1) }
                        ForEach(lessons) { lesson in
                            LessonRow(lesson: lesson, record: model.progress.state.course[lesson.slug], isNext: lesson == next) {
                                model.openLesson(lesson)
                            }
                            .padding(.vertical, 8)
                            .overlay(alignment: .bottom) { Rectangle().fill(Theme.hair).frame(height: 1) }
                        }
                    }
                }
            }
            .padding(14)
        }
    }

    private func nextLessonCard(_ lesson: Lesson) -> some View {
        let countries = lesson.iso3.compactMap { model.data.country($0) }
        return VStack(alignment: .leading, spacing: 8) {
            Text(model.lessonsDone == 0 ? "Start here · Lesson \(lesson.number)" : "Next · Lesson \(lesson.number)")
                .fieldLabelStyle()
            Text(lesson.name)
                .font(.place(.title3))
                .textCase(.uppercase)
                .tracking(1.6)
                .foregroundStyle(Theme.ink)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
            FlowLayout(spacing: 6) {
                ForEach(countries) { country in
                    HStack(spacing: 5) {
                        FlagView(country: country, height: 15)
                        Text(country.name)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Theme.ink)
                    }
                    .padding(.horizontal, 7)
                    .frame(minHeight: 28)
                    .overlay { Rectangle().strokeBorder(Theme.hair, lineWidth: 1) }
                    .accessibilityElement(children: .combine)
                }
            }
            Button {
                model.openLesson(lesson)
            } label: {
                Label("Start lesson", systemImage: "arrow.right")
                    .labelStyle(TrailingIconLabelStyle())
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(InkButtonStyle(color: Theme.overprint))
            .padding(.top, 2)
        }
        .padding(12)
        .background(Theme.overprintSoft)
        .overlay { Rectangle().strokeBorder(Theme.overprint, lineWidth: 1.2) }
    }

    private func reviewRow(_ due: Int) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Review").fieldLabelStyle()
                Text(due == 1 ? "1 country due again" : "\(due) countries due again")
                    .font(.system(.subheadline, weight: .bold).width(.expanded))
                    .foregroundStyle(Theme.ink)
                Text("After ten minutes, a day, three days, two weeks.")
                    .font(.note(.footnote))
                    .foregroundStyle(Theme.waterInk)
            }
            Spacer(minLength: 8)
            Button("Review") {
                model.startReview()
            }
            .buttonStyle(InkButtonStyle())
            .fixedSize()
        }
        .padding(12)
        .background(Theme.card)
        .overlay { Rectangle().strokeBorder(Theme.ink, lineWidth: 1.2) }
    }
}

import SwiftUI

/// The study half of a lesson: an overview of the neighbours, a card for each, then the quiz.
struct LessonPanel: View {
    @Environment(AppModel.self) private var model
    let lesson: Lesson
    /// 0 is the overview; 1...n are the country cards.
    @State private var step = 0

    private var countries: [Country] { lesson.iso3.compactMap { model.data.country($0) } }

    var body: some View {
        let list = countries
        VStack(spacing: 0) {
            PanelHeader(title: "Lesson \(lesson.number) · \(lesson.name)", detail: step == 0 ? lesson.region : "\(step) / \(list.count)") {
                if step > 0 { step -= 1 } else { model.goHome() }
            }
            PanelBody {
                Group {
                    if step == 0 {
                        overview(list)
                    } else if list.indices.contains(step - 1) {
                        card(list[step - 1])
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .id(step)
            .transition(.opacity)

            HStack(spacing: 8) {
                if step > 0 {
                    Button("Skip to quiz") {
                        model.startLessonQuiz(lesson)
                    }
                    .buttonStyle(RuledButtonStyle())
                }
                Button {
                    if step < list.count { step += 1 } else { model.startLessonQuiz(lesson) }
                } label: {
                    Label(step == 0 ? "Study" : step < list.count ? "Next" : "Start quiz", systemImage: "arrow.right")
                        .labelStyle(TrailingIconLabelStyle())
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(InkButtonStyle())
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .overlay(alignment: .top) { Rectangle().fill(Theme.ink.opacity(0.5)).frame(height: 1) }
        }
        .animation(.easeInOut(duration: 0.22), value: step)
        .sheetCard()
        .onChange(of: step, initial: true) {
            stage(list)
        }
    }

    private func overview(_ list: [Country]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("\(list.count) neighbours").fieldLabelStyle()
            Text("Study each country, then find it on the globe and name it, its flag or its capital. A miss is asked once more.")
                .font(.note(.body))
                .foregroundStyle(Theme.waterInk)
                .fixedSize(horizontal: false, vertical: true)
            FlowLayout(spacing: 8) {
                ForEach(list) { country in
                    HStack(spacing: 6) {
                        FlagView(country: country, height: 18)
                        Text(country.name)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Theme.ink)
                    }
                    .padding(.horizontal, 8)
                    .frame(minHeight: 32)
                    .overlay { Rectangle().strokeBorder(Theme.hair, lineWidth: 1) }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    private func card(_ country: Country) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                FlagView(country: country, height: 48)
                VStack(alignment: .leading, spacing: 2) {
                    PlaceName(country.name, style: .title3)
                    if let subregion = country.subregion {
                        Text(subregion)
                            .font(.note(.subheadline))
                            .foregroundStyle(Theme.waterInk)
                    }
                }
            }
            FactsGrid(country: country, units: model.progress.units, compact: true)
        }
    }

    private func stage(_ list: [Country]) {
        let globe = model.globe
        globe.clear()
        globe.interactive = false
        if step == 0 {
            for country in list { globe.highlight(country, style: .focus, label: true) }
            globe.fly(toFit: list, minRadius: 0.08)
        } else if list.indices.contains(step - 1) {
            let current = list[step - 1]
            for country in list where country != current { globe.highlight(country, style: .neighbour) }
            globe.highlight(current, style: .answer, label: true)
            if let capital = current.capitalPoint { globe.dropPin(at: capital, style: .capital) }
            globe.fly(to: current)
            model.progress.visit(current.iso3)
        }
    }
}

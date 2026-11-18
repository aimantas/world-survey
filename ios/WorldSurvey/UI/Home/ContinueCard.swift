import SwiftUI

/// The next useful step: countries due for review first, then the next lesson of the course.
struct ContinueCard: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let due = model.dueCount
        VStack(alignment: .leading, spacing: 6) {
            if due > 0 {
                Label("Review", systemImage: "arrow.counterclockwise")
                    .fieldLabelStyle()
                Text(due == 1 ? "1 country due" : "\(due) countries due")
                    .font(.system(.headline, weight: .bold).width(.expanded))
                    .foregroundStyle(Theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Misses come back until they stick.")
                    .font(.note(.footnote))
                    .foregroundStyle(Theme.waterInk)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 4)
                Button {
                    model.startReview()
                } label: {
                    Text("Review").frame(maxWidth: .infinity)
                }
                .buttonStyle(InkButtonStyle())
            } else if let lesson = model.nextLesson {
                Label("Lesson \(lesson.number) of \(model.data.lessons.count)", systemImage: "book.closed")
                    .fieldLabelStyle()
                Text(lesson.name)
                    .font(.system(.headline, weight: .bold).width(.expanded))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                HStack(spacing: 3) {
                    ForEach(lesson.iso3.compactMap { model.data.country($0) }) { country in
                        FlagView(country: country, height: 13)
                    }
                }
                Spacer(minLength: 4)
                Button {
                    model.openLesson(lesson)
                } label: {
                    Text("Start").frame(maxWidth: .infinity)
                }
                .buttonStyle(InkButtonStyle())
            } else {
                Label("Field course", systemImage: "graduationcap")
                    .fieldLabelStyle()
                Text("All 39 lessons done")
                    .font(.system(.headline, weight: .bold).width(.expanded))
                    .foregroundStyle(Theme.ink)
                Spacer(minLength: 4)
                Button {
                    model.select(.learn)
                } label: {
                    Text("Course").frame(maxWidth: .infinity)
                }
                .buttonStyle(RuledButtonStyle())
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.card)
        .overlay { Rectangle().strokeBorder(Theme.ink, lineWidth: 1.2) }
    }
}

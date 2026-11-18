import SwiftUI

struct LessonRow: View {
    @Environment(AppModel.self) private var model
    let lesson: Lesson
    let record: ProgressState.LessonRecord?
    let isNext: Bool
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 12) {
                Text("\(lesson.number)")
                    .font(.measure(.subheadline))
                    .foregroundStyle(record == nil ? Theme.ink : Theme.card)
                    .frame(width: 34, height: 34)
                    .background(record == nil ? Theme.card : Theme.surveyed)
                    .overlay { Rectangle().strokeBorder(record == nil ? Theme.ink : Theme.surveyed, lineWidth: 1.2) }
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(lesson.name)
                            .font(.system(.subheadline, weight: .bold).width(.expanded))
                            .foregroundStyle(Theme.ink)
                        if isNext {
                            Text("Next")
                                .font(.fieldLabel)
                                .textCase(.uppercase)
                                .tracking(1)
                                .foregroundStyle(Theme.overprint)
                        }
                    }
                    HStack(spacing: 4) {
                        ForEach(lesson.iso3.compactMap { model.data.country($0) }) { country in
                            FlagView(country: country, height: 14)
                        }
                    }
                }
                Spacer(minLength: 6)
                if let record {
                    Text("\(record.right)/\(record.total)")
                        .font(.measure(.caption))
                        .foregroundStyle(Theme.surveyed)
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Lesson \(lesson.number), \(lesson.name), \(lesson.iso3.count) countries\(record.map { ", done, \($0.right) of \($0.total)" } ?? "")\(isNext ? ", next" : "")")
        .accessibilityAddTraits(.isButton)
    }
}

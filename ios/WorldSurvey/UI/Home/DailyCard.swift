import SwiftUI

/// Today's expedition: play it, or see how it went and share the grid.
struct DailyCard: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let date = Daily.today()
        let number = Daily.number(for: date)
        VStack(alignment: .leading, spacing: 6) {
            Label("Daily · No. \(number)", systemImage: "calendar")
                .labelStyle(.titleAndIcon)
                .fieldLabelStyle()
            if let entry = model.todaysDaily {
                Text(entry.score.formatted())
                    .font(.measure(.title2, weight: .bold))
                    .foregroundStyle(Theme.ink)
                HStack(spacing: 3) {
                    ForEach(Array(entry.grades.enumerated()), id: \.offset) { _, grade in
                        Rectangle()
                            .fill(Theme.grade(grade))
                            .frame(width: 13, height: 13)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(entry.score) of \(Daily.maxScore) points")
                Spacer(minLength: 4)
                ShareLink(item: Daily.shareText(date: date, score: entry.score, grades: entry.grades)) {
                    Label("Share", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(RuledButtonStyle())
            } else {
                Text("Five rounds")
                    .font(.system(.headline, weight: .bold).width(.expanded))
                    .foregroundStyle(Theme.ink)
                Text("The same for everyone today.")
                    .font(.note(.footnote))
                    .foregroundStyle(Theme.waterInk)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 4)
                Button {
                    model.startDaily()
                } label: {
                    Text("Play").frame(maxWidth: .infinity)
                }
                .buttonStyle(InkButtonStyle(color: Theme.overprint))
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.overprintSoft)
        .overlay { Rectangle().strokeBorder(Theme.overprint, lineWidth: 1.2) }
    }
}

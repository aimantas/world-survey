import SwiftUI

/// One round on the report: its grade, the country and the points.
struct ResultRow: View {
    let result: RoundResult
    let units: DistanceUnit

    var body: some View {
        HStack(spacing: 10) {
            Rectangle()
                .fill(Theme.grade(result.grade))
                .frame(width: 12, height: 12)
                .accessibilityHidden(true)
            FlagView(country: result.round.country, height: 18)
            Text(result.round.country.name)
                .font(.subheadline)
                .foregroundStyle(Theme.ink)
                .lineLimit(1)
            Spacer(minLength: 6)
            Text(detail)
                .font(.measure(.caption, weight: .regular))
                .foregroundStyle(Theme.ink3)
            if result.round.kind != .higherLower {
                Text(result.points.formatted())
                    .font(.measure(.subheadline))
                    .foregroundStyle(result.correct ? Theme.surveyed : Theme.ink)
                    .frame(minWidth: 48, alignment: .trailing)
            }
        }
        .padding(.vertical, 7)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.hair).frame(height: 1) }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(result.round.country.name), \(result.correct ? "correct" : "missed"), \(result.points) points")
    }

    private var detail: String {
        if let km = result.km, km > 0 { return units.format(km: km) }
        if result.round.kind == .higherLower { return result.correct ? "right" : "wrong" }
        return "\((result.ms / 1000).formatted(.number.precision(.fractionLength(1)))) s"
    }
}

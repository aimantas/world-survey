import SwiftUI

/// A country's survey card: flag, names, facts, and its neighbours as places to go next.
struct CountryCard: View {
    @Environment(AppModel.self) private var model
    let country: Country
    let select: (Country) -> Void

    var body: some View {
        let neighbours = model.data.neighbours(of: country)
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                FlagView(country: country, height: 48)
                VStack(alignment: .leading, spacing: 2) {
                    PlaceName(country.name, style: .title3)
                    Text([country.official, country.subregion].compactMap { $0 }.joined(separator: " · "))
                        .font(.note(.footnote))
                        .foregroundStyle(Theme.waterInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 4)
                if model.progress.state.isSurveyed(country.iso3) {
                    Stamp(text: "Surveyed", angle: -6)
                }
            }
            FactsGrid(country: country, units: model.progress.units)
            VStack(alignment: .leading, spacing: 6) {
                Text(borderLabel(neighbours)).fieldLabelStyle()
                if neighbours.isEmpty {
                    Text(country.island ? "None. It’s an island." : "No land borders.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.ink)
                } else {
                    FlowLayout(spacing: 6) {
                        ForEach(neighbours) { neighbour in
                            Button(neighbour.name) {
                                select(neighbour)
                            }
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Theme.ink)
                            .padding(.horizontal, 10)
                            .frame(minHeight: 36)
                            .overlay { Rectangle().strokeBorder(Theme.ink.opacity(0.6), lineWidth: 1) }
                            .contentShape(.rect)
                        }
                    }
                }
            }
            if let url = country.pageURL {
                Link(destination: url) {
                    Label("Country page", systemImage: "arrow.up.right")
                        .labelStyle(TrailingIconLabelStyle())
                        .font(.fieldLabel)
                        .textCase(.uppercase)
                        .tracking(1.1)
                        .foregroundStyle(Theme.ink)
                        .frame(minHeight: 44)
                }
            }
        }
    }

    /// Counts sovereign neighbours only; territories are listed but not counted.
    private func borderLabel(_ neighbours: [Country]) -> String {
        let states = neighbours.count { $0.sovereign }
        guard !neighbours.isEmpty else { return "Borders" }
        return states == 1 ? "Borders one country" : "Borders \(states) countries"
    }
}

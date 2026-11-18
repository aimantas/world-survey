import SwiftUI

/// The survey card's fact list. Every number names its year; unknown values print as a dash.
struct FactsGrid: View {
    let country: Country
    var units = DistanceUnit.km
    /// The short list for the reveal card; the atlas shows everything.
    var compact = false

    private struct Fact: Identifiable {
        let label: String
        let value: String
        var note: String?
        var numeric = true
        var id: String { label }
    }

    private var facts: [Fact] {
        var list: [Fact] = [
            Fact(label: "Capital", value: country.capital ?? "—", numeric: false),
            Fact(label: "Population", value: country.population.map(Stat.compact) ?? "—", note: worldBank(country.populationYear)),
            Fact(label: "Area", value: area),
            Fact(label: "Life expectancy", value: country.lifeExpectancy.map { "\($0.formatted(.number.precision(.fractionLength(1)))) years" } ?? "—", note: worldBank(country.lifeExpectancyYear)),
        ]
        guard !compact else { return list }
        if let gdp = country.gdp {
            list.append(Fact(label: "GDP", value: "$\(Stat.compact(gdp))", note: worldBank(country.gdpYear)))
        }
        if let languages = country.languages, !languages.isEmpty {
            list.append(Fact(label: "Languages", value: languages.prefix(3).joined(separator: ", "), numeric: false))
        }
        if let currencies = country.currencies, !currencies.isEmpty {
            list.append(Fact(label: "Currency", value: currencies.prefix(2).joined(separator: ", "), numeric: false))
        }
        return list
    }

    private var area: String {
        guard let km2 = country.area else { return "—" }
        if units == .mi { return "\(Int((km2 / 2.589988).rounded()).formatted()) sq mi" }
        return "\(Int(km2.rounded()).formatted()) km²"
    }

    private func worldBank(_ year: Int?) -> String? {
        year.map { "\($0.formatted(.number.grouping(.never))), World Bank" }
    }

    @Environment(\.dynamicTypeSize) private var typeSize

    private var columns: [GridItem] {
        // One column at accessibility sizes: two would wrap every value.
        let column = GridItem(.flexible(), spacing: 14, alignment: .topLeading)
        return typeSize.isAccessibilitySize ? [column] : [column, column]
    }

    var body: some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: 10) {
            ForEach(facts) { fact in
                VStack(alignment: .leading, spacing: 2) {
                    Text(fact.label)
                        .fieldLabelStyle()
                    Text(fact.value)
                        .font(fact.numeric ? .measure(.subheadline) : .subheadline)
                        .foregroundStyle(Theme.ink)
                    if let note = fact.note {
                        Text(note)
                            .font(.note(.caption))
                            .foregroundStyle(Theme.ink3)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 8)
                .overlay(alignment: .top) { Rectangle().fill(Theme.hair).frame(height: 1) }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

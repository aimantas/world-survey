import SwiftUI

/// Free exploration: tap any country or search for it, and read its survey card.
struct AtlasPanel: View {
    @Environment(AppModel.self) private var model
    @State private var query = ""
    @FocusState private var searching: Bool

    private var matches: [Country] {
        let text = query.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return [] }
        return model.data.countries
            .filter { $0.name.localizedStandardContains(text) || ($0.capital?.localizedStandardContains(text) ?? false) }
            .sorted { a, b in
                let aStarts = a.name.lowercased().hasPrefix(text.lowercased())
                let bStarts = b.name.lowercased().hasPrefix(text.lowercased())
                return aStarts != bStarts ? aStarts : a.name < b.name
            }
            .prefix(6)
            .map { $0 }
    }

    var body: some View {
        let visited = model.progress.state.visited.count
        let selected = model.atlasSelection
        VStack(spacing: 0) {
            PanelHeader(title: "Atlas", detail: "\(visited) visited")
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(Theme.ink3)
                    .accessibilityHidden(true)
                TextField("Country or capital", text: $query)
                    .font(.body)
                    .foregroundStyle(Theme.ink)
                    .focused($searching)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.words)
                    .submitLabel(.search)
                    .onSubmit {
                        if let first = matches.first { select(first) }
                    }
                if !query.isEmpty {
                    Button("Clear search", systemImage: "xmark.circle.fill") {
                        query = ""
                    }
                    .labelStyle(.iconOnly)
                    .foregroundStyle(Theme.ink3)
                    .frame(width: 44, height: 44)
                }
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 48)
            .overlay(alignment: .bottom) { Rectangle().fill(Theme.hair).frame(height: 1) }

            if !matches.isEmpty, searching {
                VStack(spacing: 0) {
                    ForEach(matches) { country in
                        Button {
                            select(country)
                        } label: {
                            HStack(spacing: 10) {
                                FlagView(country: country, height: 18)
                                Text(country.name)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(Theme.ink)
                                Spacer()
                                Text(country.capital ?? "")
                                    .font(.note(.footnote))
                                    .foregroundStyle(Theme.ink3)
                            }
                            .padding(.horizontal, 16)
                            .frame(minHeight: 44)
                            .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                        .overlay(alignment: .bottom) { Rectangle().fill(Theme.hair).frame(height: 1) }
                    }
                }
            } else if let selected {
                ScrollView {
                    CountryCard(country: selected, select: select)
                        .padding(16)
                }
                .scrollBounceBehavior(.basedOnSize)
                .containerRelativeFrame(.vertical) { height, _ in height * 0.36 }
            } else {
                Text("Turn the globe and tap a country. Small states have a ring to tap.")
                    .font(.note(.subheadline))
                    .foregroundStyle(Theme.waterInk)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
            }
        }
        .sheetCard()
        .animation(.snappy(duration: 0.25), value: model.atlasSelection?.iso3)
    }

    private func select(_ country: Country) {
        searching = false
        query = ""
        model.showInAtlas(country)
    }
}

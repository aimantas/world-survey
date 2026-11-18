import SwiftUI

/// The Survey Relief Atlas palette and type roles, from the web game's design contract.
/// The sheet is light by design: map paper, ink, one magenta overprint and survey green.
enum Theme {
    static let paper = Color(red: 0.957, green: 0.961, blue: 0.941)
    static let paperDeep = Color(red: 0.914, green: 0.925, blue: 0.890)
    static let card = Color(red: 0.984, green: 0.988, blue: 0.973)
    static let ink = Color(red: 0.106, green: 0.137, blue: 0.169)
    static let ink2 = Color(red: 0.282, green: 0.322, blue: 0.361)
    static let ink3 = Color(red: 0.373, green: 0.408, blue: 0.439)
    static let hair = Color(red: 0.106, green: 0.137, blue: 0.169).opacity(0.16)
    static let overprint = Color(red: 0.765, green: 0.090, blue: 0.482)
    static let overprintSoft = Color(red: 0.765, green: 0.090, blue: 0.482).opacity(0.09)
    static let surveyed = Color(red: 0.243, green: 0.478, blue: 0.271)
    static let surveyedSoft = Color(red: 0.243, green: 0.478, blue: 0.271).opacity(0.12)
    static let water = Color(red: 0.663, green: 0.824, blue: 0.894)
    static let waterInk = Color(red: 0.165, green: 0.408, blue: 0.576)
    static let amber = Color(red: 0.722, green: 0.525, blue: 0.043)

    static func grade(_ grade: Grade) -> Color {
        switch grade {
        case .perfect: surveyed
        case .close: amber
        case .far: overprint.opacity(0.55)
        case .miss: overprint
        }
    }
}

extension EnvironmentValues {
    /// How tall the bottom panel may grow before its content scrolls, so the globe keeps its space.
    @Entry var panelBodyMaxHeight: CGFloat = 420
}

extension Font {
    /// Country names: wide capitals, like map lettering.
    static func place(_ style: Font.TextStyle = .title2) -> Font {
        .system(style, weight: .bold).width(.expanded)
    }

    /// Small condensed capitals for field labels and the title block.
    static let fieldLabel = Font.system(.caption, weight: .semibold).width(.condensed)

    /// Buttons and the wordmark.
    static let control = Font.system(.subheadline, weight: .bold).width(.expanded)

    /// Marginal notes and questions, in serif italic.
    static func note(_ style: Font.TextStyle = .body) -> Font {
        .system(style, design: .serif).italic()
    }

    /// Numbers: scores, distances, coordinates.
    static func measure(_ style: Font.TextStyle = .body, weight: Font.Weight = .semibold) -> Font {
        .system(style, design: .monospaced).weight(weight)
    }
}

extension View {
    /// Condensed, letter-spaced capitals in secondary ink.
    func fieldLabelStyle() -> some View {
        font(.fieldLabel)
            .textCase(.uppercase)
            .tracking(1.1)
            .foregroundStyle(Theme.ink3)
    }

    /// A ruled card on the sheet: card stock, ink hairline, magenta inner rule.
    func sheetCard() -> some View {
        background(Theme.card)
            .overlay { Rectangle().strokeBorder(Theme.overprint, lineWidth: 1).padding(3) }
            .overlay { Rectangle().strokeBorder(Theme.ink, lineWidth: 1.5) }
    }
}

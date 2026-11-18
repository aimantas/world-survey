import SwiftUI

/// One of four answers. After the answer it shows whether it was right, wrong or beside the point.
struct OptionButtonStyle: ButtonStyle {
    enum Verdict { case open, correct, wrong, other }
    var verdict = Verdict.open

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, minHeight: 54)
            .foregroundStyle(verdict == .other ? Theme.ink3 : Theme.ink)
            .background(background(pressed: configuration.isPressed))
            .overlay { Rectangle().strokeBorder(border, lineWidth: verdict == .open || verdict == .other ? 1.2 : 2.2) }
            .opacity(verdict == .other ? 0.55 : 1)
            .contentShape(.rect)
            .animation(.easeOut(duration: 0.15), value: verdict)
    }

    private var border: Color {
        switch verdict {
        case .open: Theme.ink
        case .correct: Theme.surveyed
        case .wrong: Theme.overprint
        case .other: Theme.hair
        }
    }

    private func background(pressed: Bool) -> Color {
        switch verdict {
        case .open: pressed ? Theme.paperDeep : Theme.card
        case .correct: Theme.surveyedSoft
        case .wrong: Theme.overprintSoft
        case .other: Theme.card
        }
    }
}

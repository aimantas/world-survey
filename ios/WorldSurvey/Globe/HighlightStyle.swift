import UIKit
import simd

/// How a country is marked on the globe.
enum HighlightStyle {
    /// The answer, drawn in ink: bold outline plus diagonal hatching.
    case answer
    /// A correct answer: the same in survey green.
    case correct
    /// The player's wrong pick: magenta overprint.
    case wrong
    /// A selected country: ink outline over a light fill.
    case focus
    /// A bordering country: a thin outline only.
    case neighbour

    var color: UIColor {
        switch self {
        case .answer, .focus, .neighbour: Palette.ink
        case .correct: Palette.surveyed
        case .wrong: Palette.overprint
        }
    }

    var outlinePoints: Double {
        switch self {
        case .neighbour: 1.1
        case .focus: 1.8
        default: 2.4
        }
    }

    var hatched: Bool { self == .answer || self == .correct || self == .wrong }
    var filled: Bool { self != .neighbour }
}

import SwiftUI

/// A place name in map lettering: wide, letter-spaced capitals that shrink before they wrap badly.
struct PlaceName: View {
    let name: String
    var style = Font.TextStyle.title2

    init(_ name: String, style: Font.TextStyle = .title2) {
        self.name = name
        self.style = style
    }

    var body: some View {
        Text(name)
            .font(.place(style))
            .textCase(.uppercase)
            .tracking(2)
            .foregroundStyle(Theme.ink)
            .lineLimit(2)
            .minimumScaleFactor(0.6)
            .accessibilityAddTraits(.isHeader)
    }
}

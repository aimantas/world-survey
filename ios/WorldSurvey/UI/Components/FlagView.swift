import SwiftUI

/// A flag at 4:3 with an ink keyline, as the sheet prints them.
struct FlagView: View {
    let country: Country
    var height: CGFloat = 48

    var body: some View {
        Group {
            if let asset = country.flagAsset {
                Image(asset)
                    .resizable()
                    .aspectRatio(4 / 3, contentMode: .fit)
            } else {
                Rectangle()
                    .fill(Theme.paperDeep)
                    .aspectRatio(4 / 3, contentMode: .fit)
            }
        }
        .frame(height: height)
        .overlay { Rectangle().strokeBorder(Theme.ink, lineWidth: 1) }
        .accessibilityHidden(true)
    }
}

import SwiftUI

/// The site's mark: a globe in ink line work with the magenta benchmark triangle.
struct GlobeMark: View {
    var body: some View {
        Canvas { context, size in
            let rect = CGRect(origin: .zero, size: size).insetBy(dx: 1.5, dy: 1.5)
            context.fill(Path(ellipseIn: rect), with: .color(Theme.water))
            context.stroke(Path(ellipseIn: rect), with: .color(Theme.ink), lineWidth: 1.6)
            var lines = Path()
            lines.move(to: CGPoint(x: rect.minX, y: rect.midY))
            lines.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
            lines.addEllipse(in: rect.insetBy(dx: rect.width * 0.26, dy: 0))
            context.stroke(lines, with: .color(Theme.ink), lineWidth: 1)
            var triangle = Path()
            triangle.move(to: CGPoint(x: rect.midX, y: rect.midY - rect.height * 0.2))
            triangle.addLine(to: CGPoint(x: rect.midX + rect.width * 0.19, y: rect.midY + rect.height * 0.13))
            triangle.addLine(to: CGPoint(x: rect.midX - rect.width * 0.19, y: rect.midY + rect.height * 0.13))
            triangle.closeSubpath()
            context.fill(triangle, with: .color(Theme.overprint))
        }
        .accessibilityHidden(true)
    }
}

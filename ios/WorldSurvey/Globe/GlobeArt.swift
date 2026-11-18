import UIKit
import simd

/// Images drawn for the globe: fills, the survey wash, pins and labels.
enum GlobeArt {
    /// The box a country's fill is drawn in. `maxLng` runs past 180 when the country crosses the antimeridian.
    struct Box {
        var minLng: Double
        var minLat: Double
        var maxLng: Double
        var maxLat: Double

        init?(polygons: [CountryPolygon], crossesAntimeridian: Bool) {
            guard !polygons.isEmpty else { return nil }
            var x0 = Double.infinity, y0 = Double.infinity, x1 = -Double.infinity, y1 = -Double.infinity
            for polygon in polygons {
                for p in polygon.rings.first ?? [] {
                    let x = crossesAntimeridian && p.x < 0 ? p.x + 360 : p.x
                    x0 = min(x0, x); x1 = max(x1, x)
                    y0 = min(y0, p.y); y1 = max(y1, p.y)
                }
            }
            let padX = max(0.05, (x1 - x0) * 0.02)
            let padY = max(0.05, (y1 - y0) * 0.02)
            minLng = x0 - padX
            maxLng = x1 + padX
            minLat = max(-90, y0 - padY)
            maxLat = min(90, y1 + padY)
        }
    }

    /// A country's fill: a light tint and, for answers, diagonal hatching, clipped to its outline.
    static func fill(polygons: [CountryPolygon], box: Box, crossesAntimeridian: Bool, style: HighlightStyle) -> UIImage {
        let spanX = box.maxLng - box.minLng
        let spanY = box.maxLat - box.minLat
        let midLat = (box.minLat + box.maxLat) / 2
        // Keep pixels roughly square on the ground at the country's latitude.
        let aspect = max(0.2, min(5, spanX * max(0.25, cos(midLat * .pi / 180)) / spanY))
        let long: CGFloat = 640
        let size = aspect >= 1 ? CGSize(width: long, height: max(48, long / aspect)) : CGSize(width: max(48, long * aspect), height: long)

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            let cg = context.cgContext
            let path = CGMutablePath()
            for polygon in polygons {
                for ring in polygon.rings where ring.count >= 3 {
                    var first = true
                    for p in ring {
                        let lng = crossesAntimeridian && p.x < 0 ? p.x + 360 : p.x
                        let point = CGPoint(x: (lng - box.minLng) / spanX * size.width, y: (box.maxLat - p.y) / spanY * size.height)
                        if first { path.move(to: point) } else { path.addLine(to: point) }
                        first = false
                    }
                    path.closeSubpath()
                }
            }
            cg.addPath(path)
            cg.clip(using: .evenOdd)
            cg.setFillColor(style.color.withAlphaComponent(style.hatched ? 0.16 : 0.12).cgColor)
            cg.fill(CGRect(origin: .zero, size: size))
            guard style.hatched else { return }
            cg.setStrokeColor(style.color.withAlphaComponent(0.7).cgColor)
            cg.setLineWidth(1.6)
            let step: CGFloat = 11
            var x = -size.height
            while x < size.width {
                cg.move(to: CGPoint(x: x, y: size.height))
                cg.addLine(to: CGPoint(x: x + size.height, y: 0))
                x += step
            }
            cg.strokePath()
        }
    }

    /// The pale base plate: land you have not surveyed prints washed out. Equirectangular, whole world.
    static func wash(shapes: [String: [CountryPolygon]], surveyed: Set<String>) -> UIImage {
        let size = CGSize(width: 2048, height: 1024)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            let cg = context.cgContext
            cg.setFillColor(Palette.paper.withAlphaComponent(0.66).cgColor)
            for (iso3, polygons) in shapes where !surveyed.contains(iso3) {
                for polygon in polygons {
                    guard let ring = polygon.rings.first, ring.count >= 3 else { continue }
                    // A ring that crosses the antimeridian jumps from 180 to -180 in the data.
                    // Unwrap it into one outline and draw it at both edges of the map.
                    var unwrapped: [SIMD2<Double>] = []
                    var shift = 0.0
                    for (i, p) in ring.enumerated() {
                        if i > 0, abs(p.x - ring[i - 1].x) > 180 { shift += p.x < ring[i - 1].x ? 360 : -360 }
                        unwrapped.append(SIMD2(p.x + shift, p.y))
                    }
                    for offset in shift == 0 && unwrapped.allSatisfy({ abs($0.x) <= 180 }) ? [0.0] : [0.0, -360.0, 360.0] {
                        cg.beginPath()
                        for (i, p) in unwrapped.enumerated() {
                            let point = CGPoint(x: (p.x + offset + 180) / 360 * size.width, y: (90 - p.y) / 180 * size.height)
                            if i == 0 { cg.move(to: point) } else { cg.addLine(to: point) }
                        }
                        cg.closePath()
                        cg.fillPath()
                    }
                }
            }
        }
    }

    static func pin(_ style: PinStyle) -> UIImage {
        switch style {
        case .guess:
            return draw(CGSize(width: 30, height: 30)) { cg, rect in
                let c = CGPoint(x: rect.midX, y: rect.midY)
                cg.setStrokeColor(Palette.card.cgColor)
                cg.setLineWidth(5)
                cg.strokeEllipse(in: rect.insetBy(dx: 6, dy: 6))
                cg.setStrokeColor(Palette.overprint.cgColor)
                cg.setLineWidth(2.2)
                cg.strokeEllipse(in: rect.insetBy(dx: 6, dy: 6))
                cg.setLineWidth(1.6)
                cg.move(to: CGPoint(x: c.x, y: 1)); cg.addLine(to: CGPoint(x: c.x, y: rect.maxY - 1))
                cg.move(to: CGPoint(x: 1, y: c.y)); cg.addLine(to: CGPoint(x: rect.maxX - 1, y: c.y))
                cg.strokePath()
            }
        case .capital:
            return draw(CGSize(width: 24, height: 24)) { cg, rect in
                let path = CGMutablePath()
                path.move(to: CGPoint(x: rect.midX, y: 3))
                path.addLine(to: CGPoint(x: rect.maxX - 3, y: rect.maxY - 4))
                path.addLine(to: CGPoint(x: 3, y: rect.maxY - 4))
                path.closeSubpath()
                cg.addPath(path)
                cg.setFillColor(Palette.ink.cgColor)
                cg.setStrokeColor(Palette.card.cgColor)
                cg.setLineWidth(2.5)
                cg.setLineJoin(.round)
                cg.drawPath(using: .fillStroke)
                cg.setFillColor(Palette.card.cgColor)
                cg.fillEllipse(in: CGRect(x: rect.midX - 2, y: rect.midY + 0.5, width: 4, height: 4))
            }
        }
    }

    /// The tap ring for states too small to outline.
    static func ring(_ style: HighlightStyle) -> UIImage {
        draw(CGSize(width: 40, height: 40)) { cg, rect in
            let circle = rect.insetBy(dx: 5, dy: 5)
            cg.setFillColor(style.color.withAlphaComponent(0.14).cgColor)
            cg.fillEllipse(in: circle)
            cg.setStrokeColor(Palette.card.cgColor)
            cg.setLineWidth(5.5)
            cg.strokeEllipse(in: circle)
            cg.setStrokeColor(style.color.cgColor)
            cg.setLineWidth(2.6)
            cg.strokeEllipse(in: circle)
            cg.setFillColor(style.color.cgColor)
            cg.fillEllipse(in: CGRect(x: rect.midX - 2.5, y: rect.midY - 2.5, width: 5, height: 5))
        }
    }

    /// Map lettering: wide letter-spaced capitals with a paper halo.
    static func placeLabel(_ text: String, color: UIColor = Palette.ink) -> UIImage {
        let font = UIFont.systemFont(ofSize: 11.5, weight: .bold, width: .expanded)
        let attributes: [NSAttributedString.Key: Any] = [.font: font, .kern: 2.2]
        let string = text.uppercased() as NSString
        let textSize = string.size(withAttributes: attributes)
        let size = CGSize(width: ceil(textSize.width) + 10, height: ceil(textSize.height) + 8)
        return draw(size) { cg, rect in
            let origin = CGPoint(x: 5, y: 4)
            cg.setLineJoin(.round)
            // A positive stroke width (percent of the font size) draws the outline only: the paper halo.
            string.draw(at: origin, withAttributes: attributes.merging([.strokeColor: Palette.card, .strokeWidth: 38]) { $1 })
            string.draw(at: origin, withAttributes: attributes.merging([.foregroundColor: color]) { $1 })
        }
    }

    /// A distance printed on the arc: mono digits in a ruled box.
    static func measureLabel(_ text: String) -> UIImage {
        let font = UIFont.monospacedSystemFont(ofSize: 12.5, weight: .semibold)
        let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: Palette.overprint, .kern: 0.4]
        let string = text as NSString
        let textSize = string.size(withAttributes: attributes)
        let size = CGSize(width: ceil(textSize.width) + 18, height: ceil(textSize.height) + 10)
        return draw(size) { cg, rect in
            let box = rect.insetBy(dx: 1, dy: 1)
            cg.setFillColor(Palette.card.cgColor)
            cg.fill(box)
            cg.setStrokeColor(Palette.overprint.cgColor)
            cg.setLineWidth(1.5)
            cg.stroke(box)
            string.draw(at: CGPoint(x: 9, y: 5), withAttributes: attributes)
        }
    }

    private static func draw(_ size: CGSize, _ body: (CGContext, CGRect) -> Void) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 3
        format.opaque = false
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            body(context.cgContext, CGRect(origin: .zero, size: size))
        }
    }
}

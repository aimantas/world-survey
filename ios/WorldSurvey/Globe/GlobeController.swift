import SceneKit
import UIKit
import simd

/// The relief globe: scene, camera, gestures, picking and everything drawn on the surface.
/// The globe stays still and the camera orbits it, north always up.
final class GlobeController: NSObject {
    let scene = SCNScene()
    private let data: WorldData

    // Camera
    private let pivot = SCNNode()
    private let cameraNode = SCNNode()
    private let camera = SCNCamera()
    private let fieldOfView = 30.0
    private(set) var center = LatLng(lat: 24, lng: 12)
    private(set) var distance = 6.0
    /// Where the focus point sits on screen: 0 is the middle, 1 the top edge. It follows the
    /// middle of the band left free between the masthead and the panel.
    private var focusOffset = 0.3
    /// The free band, in points from the top of the view; nil until the layout reports it.
    private var band: (top: Double, bottom: Double)?
    /// The free band's height as a share of the view.
    private var bandShare: Double {
        guard let band else { return 0.5 }
        return min(1, max(80, band.bottom - band.top) / Double(max(1, viewSize.height)))
    }
    private var focusTarget: Double {
        guard let band else { return 0.3 }
        return max(-0.6, min(0.8, 1 - (band.top + band.bottom) / Double(max(1, viewSize.height))))
    }
    private var viewSize = CGSize(width: 390, height: 844)
    private var needsCameraUpdate = true
    private var framed = false
    /// The last thing the game framed, until the player moves the globe by hand.
    private var framing: (center: LatLng, radius: Double)?

    // Motion
    private var displayLink: CADisplayLink?
    private var lastTick: CFTimeInterval = 0
    private var flight: Flight?
    private var velocity = SIMD2<Double>(0, 0)
    private var touching = false
    private var lastInteraction: CFTimeInterval = 0
    var idleSpin = false
    var reduceMotion = false

    // Layers
    private let overlayRoot = SCNNode()
    private let highlightRoot = SCNNode()
    private let markRoot = SCNNode()
    private var washMaterial = SCNMaterial()
    private var ribbons: [RibbonMaterial] = []
    private var highlightRibbons: [RibbonMaterial] = []
    private var markers: [Marker] = []
    private var surveyed: Set<String>?

    weak var view: SCNView?
    var interactive = true
    var onPick: ((GlobePick) -> Void)?
    /// Called whenever the player touches the globe: a drag, a pinch, a tap or a double tap.
    var onUserInteraction: (() -> Void)?

    private struct Flight {
        let from: LatLng
        let to: LatLng
        let fromDistance: Double
        let toDistance: Double
        let hop: Double
        let start: CFTimeInterval
        let duration: Double
    }

    private final class Marker {
        let node: SCNNode
        let anchor: SIMD3<Float>
        let size: CGSize
        /// Offset on screen in points, so a label can sit beside its pin.
        let offset: CGPoint
        /// Set while a pin is landing: it starts large and settles.
        var landedAt: CFTimeInterval?
        init(node: SCNNode, anchor: SIMD3<Float>, size: CGSize, offset: CGPoint) {
            self.node = node
            self.anchor = anchor
            self.size = size
            self.offset = offset
        }
    }

    private static let landing = 0.3

    private enum Layer {
        static let wash: Float = 1.0006
        static let fill: Float = 1.0012
        static let graticule: Float = 1.0016
        static let lines: Float = 1.002
        static let outline: Float = 1.0026
        static let arc: Float = 1.0032
        static let marker: Float = 1.004
    }

    init(data: WorldData) {
        self.data = data
        super.init()
        buildScene()
        applyCamera()
    }

    // MARK: - Scene

    private func buildScene() {
        scene.background.contents = Palette.paper

        camera.fieldOfView = fieldOfView
        camera.zNear = 0.05
        camera.zFar = 30
        cameraNode.camera = camera
        pivot.addChildNode(cameraNode)
        scene.rootNode.addChildNode(pivot)

        // The relief globe. A soft falloff toward the limb gives it weight without a light rig.
        let base = SCNMaterial()
        base.lightingModel = .constant
        if let url = Bundle.main.url(forResource: "globe", withExtension: "jpg"), let image = UIImage(contentsOfFile: url.path) {
            base.diffuse.contents = image
        } else {
            base.diffuse.contents = UIColor(red: 0.663, green: 0.824, blue: 0.894, alpha: 1)
        }
        base.diffuse.wrapS = .repeat
        base.diffuse.mipFilter = .linear
        base.diffuse.maxAnisotropy = 8
        base.shaderModifiers = [
            .surface: """
            float facing = max(0.0, dot(normalize(_surface.normal), normalize(_surface.view)));
            _surface.diffuse.rgb *= mix(0.74, 1.0, pow(facing, 0.55));
            """
        ]
        let globe = SCNNode(geometry: GlobeGeometry.sphere(radius: 1))
        globe.geometry?.materials = [base]
        globe.renderingOrder = 0
        scene.rootNode.addChildNode(globe)

        // An ink line around the limb: a slightly larger sphere drawn inside out.
        let rim = SCNMaterial()
        rim.lightingModel = .constant
        rim.diffuse.contents = Palette.ink
        rim.cullMode = .front
        let rimNode = SCNNode(geometry: GlobeGeometry.sphere(radius: 1.007, segments: 96))
        rimNode.geometry?.materials = [rim]
        rimNode.renderingOrder = -1
        scene.rootNode.addChildNode(rimNode)

        // The survey wash over land not yet surveyed.
        washMaterial.lightingModel = .constant
        washMaterial.diffuse.contents = UIColor.clear
        washMaterial.diffuse.wrapS = .repeat
        washMaterial.writesToDepthBuffer = false
        washMaterial.readsFromDepthBuffer = false
        washMaterial.blendMode = .alpha
        let wash = SCNNode(geometry: GlobeGeometry.sphere(radius: Layer.wash))
        wash.geometry?.materials = [washMaterial]
        wash.renderingOrder = 1
        scene.rootNode.addChildNode(wash)

        scene.rootNode.addChildNode(overlayRoot)
        scene.rootNode.addChildNode(highlightRoot)
        scene.rootNode.addChildNode(markRoot)

        // Graticule every 15 degrees.
        var grid: [[SIMD3<Float>]] = []
        for lng in stride(from: -180.0, to: 180.0, by: 15.0) {
            grid.append(stride(from: -84.0, through: 84.0, by: 2.0).map { LatLng(lat: $0, lng: lng).unitF })
        }
        for lat in stride(from: -75.0, through: 75.0, by: 15.0) {
            grid.append(stride(from: -180.0, through: 180.0, by: 2.0).map { LatLng(lat: lat, lng: $0).unitF })
        }
        addRibbons(grid, color: Palette.graticule.withAlphaComponent(0.34), points: 0.6, radius: Layer.graticule, order: 3)

        // Coast in blue ink, international boundaries in brown-violet.
        var coast: [[SIMD3<Float>]] = []
        var borders: [[SIMD3<Float>]] = []
        for arc in data.arcs {
            let lines = GlobeGeometry.spherePolylines(arc.points)
            if arc.shared { borders.append(contentsOf: lines) } else { coast.append(contentsOf: lines) }
        }
        addRibbons(coast, color: Palette.waterInk.withAlphaComponent(0.85), points: 0.8, radius: Layer.lines, order: 4)
        addRibbons(borders, color: Palette.boundary.withAlphaComponent(0.9), points: 1.0, radius: Layer.lines, order: 5)
    }

    private func addRibbons(_ lines: [[SIMD3<Float>]], color: UIColor, points: Double, radius: Float, order: Int) {
        guard let geometry = GlobeGeometry.ribbons(lines, radius: radius) else { return }
        let ribbon = RibbonMaterial(color: color, points: points)
        geometry.materials = [ribbon.material]
        let node = SCNNode(geometry: geometry)
        node.renderingOrder = order
        overlayRoot.addChildNode(node)
        ribbons.append(ribbon)
    }

    // MARK: - View

    func attach(_ view: SCNView) {
        self.view = view
        view.scene = scene
        view.pointOfView = cameraNode
        view.backgroundColor = Palette.paper
        view.antialiasingMode = .multisampling4X
        view.isJitteringEnabled = false
        view.rendersContinuously = false
        resize(to: view.bounds.size)
        if displayLink == nil {
            let link = CADisplayLink(target: self, selector: #selector(tick(_:)))
            link.add(to: .main, forMode: .common)
            displayLink = link
        }
    }

    func resize(to size: CGSize) {
        guard size.width > 50, size.height > 50 else { return }
        let changed = size != viewSize
        viewSize = size
        if !framed {
            // The first real size: whatever was framed before the view existed is framed again now,
            // and a flight planned against a guessed size is dropped.
            framed = true
            focusOffset = focusTarget
            flight = nil
            if let framing {
                center = framing.center
                distance = distance(fitting: framing.radius)
            } else {
                distance = maxDistance
            }
        } else if changed {
            distance = min(distance, maxDistance)
        }
        needsCameraUpdate = true
    }

    /// Tells the globe which part of the view is free of chrome, in points from the top.
    /// The focus point glides to the middle of that band and framing uses its height.
    func setFreeBand(top: CGFloat, bottom: CGFloat) {
        guard bottom > top else { return }
        let wasAtRest = abs(distance - maxDistance) < 0.01
        band = (Double(top), Double(bottom))
        guard framed else { return }
        // Whatever was framed stays framed as panels grow and shrink.
        if let framing {
            fly(to: framing.center, distance: distance(fitting: framing.radius), duration: 0.45)
        } else if wasAtRest, flight == nil {
            fly(to: center, distance: maxDistance, duration: 0.45)
        }
        needsCameraUpdate = true
    }

    // MARK: - Camera

    private var halfFov: Double { fieldOfView * .pi / 360 }
    private var aspect: Double { Double(viewSize.width / max(1, viewSize.height)) }
    /// Half the angle the narrow side of the view covers.
    private var narrowHalfAngle: Double { min(halfFov, atan(tan(halfFov) * aspect)) }

    /// Half the angle the free band covers, top to bottom.
    private var bandHalfAngle: Double { atan(tan(halfFov) * bandShare) }
    /// The half angle a framed subject may fill: the narrower of the view's width and the free band.
    private var fitHalfAngle: Double { min(narrowHalfAngle * 0.8, bandHalfAngle * 0.88) }

    /// Far enough that the whole globe fits the free part of the view.
    var maxDistance: Double { 1 / sin(fitHalfAngle) }
    let minDistance = 1.14

    /// World units per screen point at the surface under the focus point.
    private var unitsPerPoint: Double {
        2 * (distance - 1) * tan(halfFov) / Double(max(1, viewSize.height))
    }

    private func applyCamera() {
        let phi = Float(center.lat * .pi / 180)
        let lambda = Float(center.lng * .pi / 180)
        pivot.simdOrientation = simd_quatf(angle: lambda, axis: SIMD3(0, 1, 0)) * simd_quatf(angle: -phi, axis: SIMD3(1, 0, 0))
        let surface = distance - 1
        let shift = focusOffset * surface * tan(halfFov)
        cameraNode.simdPosition = SIMD3(0, Float(-shift), Float(distance))
        camera.zNear = max(0.01, surface * 0.4)
        camera.zFar = distance + 2

        let upp = unitsPerPoint
        for ribbon in ribbons + highlightRibbons { ribbon.setHalfWidth(ribbon.points * upp / 2) }
        layoutMarkers()
        needsCameraUpdate = false
    }

    private func layoutMarkers() {
        guard !markers.isEmpty else { return }
        let eye = cameraNode.simdWorldPosition
        let eyeDistance = simd_length(eye)
        let toEye = eye / eyeDistance
        let horizon = 1 / eyeDistance
        let right = cameraNode.simdWorldRight
        let up = cameraNode.simdWorldUp
        for marker in markers {
            let facing = simd_dot(marker.anchor, toEye)
            // Hide marks that have gone over the horizon.
            marker.node.opacity = CGFloat(max(0, min(1, (facing - horizon) / 0.06)))
            let position = marker.anchor * Layer.marker
            let depth = simd_length(eye - position)
            let perPoint = Float(2 * Double(depth) * tan(halfFov) / Double(max(1, viewSize.height)))
            marker.node.simdPosition = position + right * (Float(marker.offset.x) * perPoint) + up * (Float(marker.offset.y) * perPoint)
            var pop: Float = 1
            if let landedAt = marker.landedAt {
                let t = Float(min(1, (CACurrentMediaTime() - landedAt) / Self.landing))
                // Overshoots a little past its size, then settles: the squash of a pin hitting paper.
                let back = 1 + 2.7 * pow(t - 1, 3) + 1.7 * pow(t - 1, 2)
                pop = 2.4 - 1.4 * back
                if t >= 1 { marker.landedAt = nil }
            }
            marker.node.simdScale = SIMD3(Float(marker.size.width) * perPoint * pop, Float(marker.size.height) * perPoint * pop, 1)
            marker.node.simdOrientation = cameraNode.simdWorldOrientation
        }
    }

    /// The camera distance at which a cap of the given angular radius fits the narrow side of the view.
    private func distance(fitting radius: Double) -> Double {
        // Small states are framed with their surroundings: closer than this the relief goes soft.
        let theta = max(0.05, radius)
        guard theta < 1.15 else { return maxDistance }
        let d = cos(theta) + sin(theta) / tan(fitHalfAngle * 0.9)
        return min(maxDistance, max(minDistance, d))
    }

    private func angularRadius(of country: Country) -> Double {
        guard let polygons = data.shapes[country.iso3], !polygons.isEmpty else { return 0.03 }
        let label = country.label
        var radius = 0.0
        // The largest polygon decides the framing; far-flung islands do not.
        let main = polygons.max { a, b in (a.maxX - a.minX) * (a.maxY - a.minY) < (b.maxX - b.minX) * (b.maxY - b.minY) }
        for polygon in polygons {
            let isMain = polygon.minX == main?.minX && polygon.minY == main?.minY
            for corner in [(polygon.minX, polygon.minY), (polygon.maxX, polygon.minY), (polygon.minX, polygon.maxY), (polygon.maxX, polygon.maxY)] {
                let angle = Geo.angle(label, LatLng(lat: corner.1, lng: corner.0))
                if isMain || angle < 0.35 { radius = max(radius, angle) }
            }
        }
        return min(radius * 0.85, 1.0)
    }

    // MARK: - Flights

    func fly(to target: LatLng, distance targetDistance: Double? = nil, duration: Double = 1.1) {
        let to = LatLng(lat: max(-80, min(80, target.lat)), lng: target.lng)
        let toDistance = min(maxDistance, max(minDistance, targetDistance ?? distance))
        velocity = .zero
        guard !reduceMotion, duration > 0 else {
            flight = nil
            center = to
            distance = toDistance
            needsCameraUpdate = true
            return
        }
        let angle = Geo.angle(center, to)
        // Long flights climb first, so the player sees where they are going.
        let cruise = max(distance, toDistance)
        let hop = max(0, min(maxDistance - cruise, angle * 1.6))
        flight = Flight(from: center, to: to, fromDistance: distance, toDistance: toDistance, hop: hop, start: CACurrentMediaTime(), duration: duration + min(0.5, angle * 0.3))
    }

    /// Frames a cap of the given angular radius, and keeps it framed if the panel changes size.
    private func frame(_ target: LatLng, radius: Double, duration: Double) {
        framing = (target, radius)
        fly(to: target, distance: distance(fitting: radius), duration: duration)
    }

    func fly(to country: Country, duration: Double = 1.1) {
        frame(country.label, radius: angularRadius(of: country), duration: duration)
    }

    /// Frames a set of places.
    func fly(toFit places: [LatLng], minRadius: Double = 0.05, duration: Double = 1.1) {
        guard !places.isEmpty else { return }
        let mean = places.reduce(SIMD3<Double>(0, 0, 0)) { $0 + $1.unit }
        guard simd_length(mean) > 0.05 else {
            frame(LatLng(lat: 20, lng: center.lng), radius: .pi, duration: duration)
            return
        }
        let middle = LatLng(unit: mean)
        let radius = places.map { Geo.angle(middle, $0) }.max() ?? 0
        frame(middle, radius: max(minRadius, radius * 1.15), duration: duration)
    }

    /// Frames whole countries, plus any loose points such as a guess.
    func fly(toFit countries: [Country], points: [LatLng] = [], minRadius: Double = 0.05, margin: Double = 1.04, duration: Double = 1.1) {
        let caps = countries.map { (center: $0.label, radius: angularRadius(of: $0)) } + points.map { (center: $0, radius: 0.0) }
        guard !caps.isEmpty else { return }
        let mean = caps.reduce(SIMD3<Double>(0, 0, 0)) { $0 + $1.center.unit }
        guard simd_length(mean) > 0.05 else {
            frame(LatLng(lat: 20, lng: center.lng), radius: .pi, duration: duration)
            return
        }
        let middle = LatLng(unit: mean)
        let radius = caps.map { Geo.angle(middle, $0.center) + $0.radius }.max() ?? 0
        frame(middle, radius: max(minRadius, radius * margin), duration: duration)
    }

    /// Pulls back to show a whole region, or the whole globe for "World".
    func overview(region: String, duration: Double = 0.9) {
        let members = data.sovereign.filter { $0.region == region }
        guard region != "World", !members.isEmpty else {
            frame(LatLng(lat: 18, lng: center.lng), radius: .pi, duration: duration)
            return
        }
        // Frame where most of the region is: one far-flung member (Russia in Europe) would
        // otherwise pull the view back to the whole globe.
        let mean = members.reduce(SIMD3<Double>(0, 0, 0)) { $0 + $1.label.unit }
        let middle = LatLng(unit: mean)
        let angles = members.map { Geo.angle(middle, $0.label) }.sorted()
        let typical = angles[min(angles.count - 1, Int(Double(angles.count) * 0.9))]
        frame(middle, radius: typical * 1.25, duration: duration)
    }

    func zoomOut(duration: Double = 0.9) {
        frame(LatLng(lat: max(-30, min(30, center.lat)), lng: center.lng), radius: .pi, duration: duration)
    }

    @objc private func tick(_ link: CADisplayLink) {
        let now = link.timestamp
        let dt = lastTick == 0 ? 1.0 / 60 : min(0.1, now - lastTick)
        lastTick = now

        if let flight {
            let t = min(1, (CACurrentMediaTime() - flight.start) / flight.duration)
            let e = t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2
            center = Geo.interpolate(flight.from, flight.to, e)
            distance = flight.fromDistance + (flight.toDistance - flight.fromDistance) * e + flight.hop * sin(.pi * e)
            needsCameraUpdate = true
            if t >= 1 { self.flight = nil }
        } else if !touching {
            if simd_length(velocity) > 0.5 {
                move(byDegrees: velocity * dt)
                velocity *= pow(0.012, dt)
            } else if idleSpin, !reduceMotion, now - lastInteraction > 4 {
                center.lng = wrap(center.lng + 3.5 * dt)
                framing?.center = center
                needsCameraUpdate = true
            }
        }
        if abs(focusTarget - focusOffset) > 0.0005 {
            focusOffset += (focusTarget - focusOffset) * min(1, dt * 9)
            needsCameraUpdate = true
        }
        if markers.contains(where: { $0.landedAt != nil }) { needsCameraUpdate = true }
        if needsCameraUpdate { applyCamera() }
    }

    private func wrap(_ lng: Double) -> Double {
        var v = lng.truncatingRemainder(dividingBy: 360)
        if v > 180 { v -= 360 }
        if v < -180 { v += 360 }
        return v
    }

    private func move(byDegrees delta: SIMD2<Double>) {
        center.lat = max(-85, min(85, center.lat + delta.y))
        center.lng = wrap(center.lng + delta.x / max(0.25, cos(center.lat * .pi / 180)))
        needsCameraUpdate = true
    }

    // MARK: - Gestures

    func panBegan() {
        touching = true
        flight = nil
        framing = nil
        velocity = .zero
    }

    func pan(translation: CGPoint) {
        let degrees = unitsPerPoint * 180 / .pi
        move(byDegrees: SIMD2(-Double(translation.x) * degrees, Double(translation.y) * degrees))
        lastInteraction = CACurrentMediaTime()
        onUserInteraction?()
    }

    func panEnded(velocity pointsPerSecond: CGPoint) {
        touching = false
        let degrees = unitsPerPoint * 180 / .pi
        velocity = SIMD2(-Double(pointsPerSecond.x) * degrees, Double(pointsPerSecond.y) * degrees)
        lastInteraction = CACurrentMediaTime()
    }

    func pinch(scale: Double) {
        flight = nil
        framing = nil
        distance = min(maxDistance, max(minDistance, 1 + (distance - 1) / max(0.2, scale)))
        lastInteraction = CACurrentMediaTime()
        needsCameraUpdate = true
        onUserInteraction?()
    }

    func zoomIn(at point: CGPoint) {
        onUserInteraction?()
        guard let hit = surfacePoint(at: point) else { return }
        framing = nil
        fly(to: hit, distance: max(minDistance, 1 + (distance - 1) * 0.45), duration: 0.5)
        lastInteraction = CACurrentMediaTime()
    }

    func tap(at point: CGPoint) {
        lastInteraction = CACurrentMediaTime()
        // Before the pick: a tap that answers must not hold the countdown it starts.
        onUserInteraction?()
        guard interactive, let pick = pick(at: point) else { return }
        onPick?(pick)
    }

    // MARK: - Picking

    /// The place on the globe under a screen point; nil off the globe.
    func surfacePoint(at point: CGPoint) -> LatLng? {
        guard let view else { return nil }
        let near = SIMD3<Float>(view.unprojectPoint(SCNVector3(Float(point.x), Float(point.y), 0)))
        let far = SIMD3<Float>(view.unprojectPoint(SCNVector3(Float(point.x), Float(point.y), 1)))
        let direction = simd_normalize(far - near)
        let b = simd_dot(near, direction)
        let c = simd_dot(near, near) - 1
        let discriminant = b * b - c
        guard discriminant >= 0 else { return nil }
        let t = -b - sqrt(discriminant)
        guard t > 0 else { return nil }
        return LatLng(unit: SIMD3<Double>(near + direction * t))
    }

    /// Where a place is on screen, in points; nil when it is on the far side.
    func screenPoint(of place: LatLng) -> CGPoint? {
        guard let view else { return nil }
        let unit = place.unitF
        guard simd_dot(unit, simd_normalize(cameraNode.simdWorldPosition)) > 0.1 else { return nil }
        let projected = view.projectPoint(SCNVector3(unit))
        return CGPoint(x: CGFloat(projected.x), y: CGFloat(projected.y))
    }

    func pick(at point: CGPoint) -> GlobePick? {
        guard let view, let place = surfacePoint(at: point) else { return nil }
        let toEye = simd_normalize(cameraNode.simdWorldPosition)
        var tiny: [(Country, CGFloat)] = []
        for country in data.sovereign where country.needsRing {
            let unit = country.label.unitF
            guard simd_dot(unit, toEye) > 0.2 else { continue }
            let projected = view.projectPoint(SCNVector3(unit))
            let gap = hypot(CGFloat(projected.x) - point.x, CGFloat(projected.y) - point.y)
            if gap <= 26 { tiny.append((country, gap)) }
        }
        return GlobePick(point: place, country: data.country(at: place), nearbyTiny: tiny.sorted { $0.1 < $1.1 }.map(\.0))
    }

    // MARK: - Survey state

    /// Land you have surveyed prints in full colour; the rest stays pale.
    func setSurveyed(_ isoCodes: Set<String>) {
        guard isoCodes != surveyed else { return }
        surveyed = isoCodes
        washMaterial.diffuse.contents = GlobeArt.wash(shapes: data.shapes, surveyed: isoCodes)
    }

    // MARK: - Highlights and marks

    func highlight(_ country: Country, style: HighlightStyle, label: Bool = false) {
        if let polygons = data.shapes[country.iso3], !polygons.isEmpty, !country.needsRing {
            let crosses = (country.bbox.map { $0[0] > $0[2] }) ?? false
            if style.filled, let box = GlobeArt.Box(polygons: polygons, crossesAntimeridian: crosses) {
                let material = SCNMaterial()
                material.lightingModel = .constant
                material.diffuse.contents = GlobeArt.fill(polygons: polygons, box: box, crossesAntimeridian: crosses, style: style)
                // Single-sided and drawn without a depth test: back faces are culled, so the fill
                // shows on the near side only and never fights the relief underneath.
                material.writesToDepthBuffer = false
                material.readsFromDepthBuffer = false
                material.blendMode = .alpha
                let geometry = GlobeGeometry.patch(minLng: box.minLng, minLat: box.minLat, maxLng: box.maxLng, maxLat: box.maxLat, radius: Layer.fill)
                geometry.materials = [material]
                let node = SCNNode(geometry: geometry)
                node.renderingOrder = 2
                highlightRoot.addChildNode(node)
            }
            var lines: [[SIMD3<Float>]] = []
            for polygon in polygons {
                for ring in polygon.rings { lines.append(contentsOf: GlobeGeometry.spherePolylines(ring)) }
            }
            if let geometry = GlobeGeometry.ribbons(lines, radius: Layer.outline) {
                let ribbon = RibbonMaterial(color: style.color, points: style.outlinePoints)
                geometry.materials = [ribbon.material]
                let node = SCNNode(geometry: geometry)
                node.renderingOrder = 6
                highlightRoot.addChildNode(node)
                highlightRibbons.append(ribbon)
            }
        } else if style != .neighbour {
            addMarker(image: GlobeArt.ring(style), at: country.label, to: highlightRoot)
        }
        if label {
            let image = GlobeArt.placeLabel(country.name, color: style == .wrong ? Palette.overprint : Palette.ink)
            addMarker(image: image, at: country.label, to: highlightRoot, offset: CGPoint(x: 0, y: country.needsRing ? 26 : 0))
        }
        needsCameraUpdate = true
    }

    func clearHighlights() {
        let nodes = Set(highlightRoot.childNodes)
        markers.removeAll { nodes.contains($0.node) }
        highlightRoot.childNodes.forEach { $0.removeFromParentNode() }
        highlightRibbons.removeAll()
    }

    func dropPin(at place: LatLng, style: PinStyle) {
        let marker = addMarker(image: GlobeArt.pin(style), at: place, to: markRoot)
        if !reduceMotion { marker.landedAt = CACurrentMediaTime() }
    }

    /// A dashed great-circle arc in magenta, with an optional measure at its middle.
    func drawArc(from a: LatLng, to b: LatLng, label: String? = nil) {
        let angle = Geo.angle(a, b)
        guard angle > 0.0005 else { return }
        let dashes = max(6, min(70, Int(angle / 0.012)))
        var lines: [[SIMD3<Float>]] = []
        for i in 0..<dashes {
            let t0 = Double(i) / Double(dashes)
            let t1 = (Double(i) + 0.58) / Double(dashes)
            lines.append((0...3).map { Geo.interpolate(a, b, t0 + (t1 - t0) * Double($0) / 3).unitF })
        }
        if let geometry = GlobeGeometry.ribbons(lines, radius: Layer.arc) {
            let ribbon = RibbonMaterial(color: Palette.overprint, points: 2.2)
            geometry.materials = [ribbon.material]
            let node = SCNNode(geometry: geometry)
            node.renderingOrder = 7
            markRoot.addChildNode(node)
            highlightRibbons.append(ribbon)
        }
        if let label {
            addMarker(image: GlobeArt.measureLabel(label), at: Geo.interpolate(a, b, 0.5), to: markRoot)
        }
        needsCameraUpdate = true
    }

    func addLabel(_ text: String, at place: LatLng, offset: CGPoint = .zero) {
        addMarker(image: GlobeArt.placeLabel(text), at: place, to: markRoot, offset: offset)
    }

    func clearMarks() {
        let nodes = Set(markRoot.childNodes)
        markers.removeAll { nodes.contains($0.node) }
        markRoot.childNodes.forEach { $0.removeFromParentNode() }
    }

    func clear() {
        clearHighlights()
        clearMarks()
    }

    @discardableResult
    private func addMarker(image: UIImage, at place: LatLng, to parent: SCNNode, offset: CGPoint = .zero) -> Marker {
        let plane = SCNPlane(width: 1, height: 1)
        let material = SCNMaterial()
        material.lightingModel = .constant
        material.diffuse.contents = image
        material.isDoubleSided = true
        material.readsFromDepthBuffer = false
        material.writesToDepthBuffer = false
        material.blendMode = .alpha
        plane.materials = [material]
        let node = SCNNode(geometry: plane)
        node.renderingOrder = 20
        parent.addChildNode(node)
        let marker = Marker(node: node, anchor: place.unitF, size: image.size, offset: offset)
        markers.append(marker)
        needsCameraUpdate = true
        return marker
    }
}

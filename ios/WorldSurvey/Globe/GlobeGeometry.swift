import SceneKit
import simd

/// Mesh builders for the globe. Everything sits on a unit sphere:
/// longitude 0 faces +Z, east is +X, north is +Y.
enum GlobeGeometry {
    /// A lat/lng sphere with equirectangular texture coordinates (u 0 at 180°W, v 0 at the North Pole).
    static func sphere(radius: Float, segments: Int = 160) -> SCNGeometry {
        let cols = segments
        let rows = segments / 2
        var positions: [SCNVector3] = []
        var normals: [SCNVector3] = []
        var uvs: [CGPoint] = []
        positions.reserveCapacity((cols + 1) * (rows + 1))
        for j in 0...rows {
            let v = Double(j) / Double(rows)
            let lat = 90 - v * 180
            for i in 0...cols {
                let u = Double(i) / Double(cols)
                let n = LatLng(lat: lat, lng: u * 360 - 180).unitF
                positions.append(SCNVector3(n * radius))
                normals.append(SCNVector3(n))
                uvs.append(CGPoint(x: u, y: v))
            }
        }
        var indices: [UInt32] = []
        indices.reserveCapacity(cols * rows * 6)
        let stride = UInt32(cols + 1)
        for j in 0..<UInt32(rows) {
            for i in 0..<UInt32(cols) {
                let a = j * stride + i
                let b = a + 1
                let c = a + stride
                let d = c + 1
                indices.append(contentsOf: [a, c, b, b, c, d])
            }
        }
        return SCNGeometry(
            sources: [SCNGeometrySource(vertices: positions), SCNGeometrySource(normals: normals), SCNGeometrySource(textureCoordinates: uvs)],
            elements: [SCNGeometryElement(indices: indices, primitiveType: .triangles)]
        )
    }

    /// A patch of sphere over a lng/lat box, textured 0...1 across the box (v 0 at the north edge).
    /// `maxLng` may exceed 180 for boxes that cross the antimeridian.
    static func patch(minLng: Double, minLat: Double, maxLng: Double, maxLat: Double, radius: Float) -> SCNGeometry {
        let cols = min(72, max(6, Int(((maxLng - minLng) / 2.5).rounded(.up))))
        let rows = min(48, max(6, Int(((maxLat - minLat) / 2.5).rounded(.up))))
        var positions: [SCNVector3] = []
        var uvs: [CGPoint] = []
        for j in 0...rows {
            let v = Double(j) / Double(rows)
            let lat = maxLat - v * (maxLat - minLat)
            for i in 0...cols {
                let u = Double(i) / Double(cols)
                positions.append(SCNVector3(LatLng(lat: lat, lng: minLng + u * (maxLng - minLng)).unitF * radius))
                uvs.append(CGPoint(x: u, y: v))
            }
        }
        var indices: [UInt32] = []
        let stride = UInt32(cols + 1)
        for j in 0..<UInt32(rows) {
            for i in 0..<UInt32(cols) {
                let a = j * stride + i
                indices.append(contentsOf: [a, a + stride, a + 1, a + 1, a + stride, a + stride + 1])
            }
        }
        return SCNGeometry(
            sources: [SCNGeometrySource(vertices: positions), SCNGeometrySource(textureCoordinates: uvs)],
            elements: [SCNGeometryElement(indices: indices, primitiveType: .triangles)]
        )
    }

    /// Ribbons along polylines on the sphere. Each vertex sits on the centre line; its normal holds the
    /// sideways direction and texcoord.x holds the side (+1 or -1). `RibbonMaterial` pushes the two
    /// sides apart in the vertex stage, so a line keeps its width on screen at any zoom.
    static func ribbons(_ lines: [[SIMD3<Float>]], radius: Float) -> SCNGeometry? {
        var positions: [SCNVector3] = []
        var sides: [SCNVector3] = []
        var uvs: [CGPoint] = []
        var indices: [UInt32] = []
        for line in lines where line.count >= 2 {
            let base = UInt32(positions.count)
            for i in line.indices {
                let p = line[i]
                let prev = line[max(i - 1, 0)]
                let next = line[min(i + 1, line.count - 1)]
                var tangent = next - prev
                if simd_length_squared(tangent) < 1e-12 { tangent = SIMD3(0, 1, 0) }
                var side = simd_cross(simd_normalize(tangent), p)
                side = simd_length_squared(side) < 1e-12 ? SIMD3(1, 0, 0) : simd_normalize(side)
                for sign in [Float(1), Float(-1)] {
                    positions.append(SCNVector3(p * radius))
                    sides.append(SCNVector3(side))
                    uvs.append(CGPoint(x: CGFloat(sign), y: 0))
                }
            }
            for i in 0..<UInt32(line.count - 1) {
                let a = base + i * 2
                indices.append(contentsOf: [a, a + 1, a + 2, a + 1, a + 3, a + 2])
            }
        }
        guard !indices.isEmpty else { return nil }
        return SCNGeometry(
            sources: [SCNGeometrySource(vertices: positions), SCNGeometrySource(normals: sides), SCNGeometrySource(textureCoordinates: uvs)],
            elements: [SCNGeometryElement(indices: indices, primitiveType: .triangles)]
        )
    }

    /// Turns a lng/lat polyline into points on the sphere, adding points on long segments so a line
    /// follows its parallel instead of cutting a chord, and breaking it where the data closes polygons
    /// along the antimeridian or the South Pole (those edges are not coast).
    static func spherePolylines(_ points: [SIMD2<Double>], maxStep: Double = 1.0) -> [[SIMD3<Float>]] {
        var lines: [[SIMD3<Float>]] = []
        var current: [SIMD3<Float>] = []
        func flush() {
            if current.count >= 2 { lines.append(current) }
            current = []
        }
        func onSeam(_ p: SIMD2<Double>) -> Bool { abs(abs(p.x) - 180) < 0.01 || p.y <= -89.9 }
        for i in points.indices.dropLast() {
            let a = points[i]
            let b = points[i + 1]
            // Skip the data's closing edges along the seam, and the jump from 180 to -180
            // where an outline crosses the antimeridian.
            if (onSeam(a) && onSeam(b)) || abs(b.x - a.x) > 180 {
                flush()
                continue
            }
            if current.isEmpty { current.append(LatLng(lat: a.y, lng: a.x).unitF) }
            let steps = max(1, Int((max(abs(b.x - a.x), abs(b.y - a.y)) / maxStep).rounded(.up)))
            for s in 1...steps {
                let t = Double(s) / Double(steps)
                current.append(LatLng(lat: a.y + (b.y - a.y) * t, lng: a.x + (b.x - a.x) * t).unitF)
            }
        }
        flush()
        return lines
    }

    /// Points along the great circle between two places.
    static func greatCircle(from a: LatLng, to b: LatLng, segments: Int) -> [SIMD3<Float>] {
        (0...segments).map { Geo.interpolate(a, b, Double($0) / Double(segments)).unitF }
    }
}

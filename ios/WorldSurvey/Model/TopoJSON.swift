import Foundation
import simd

/// Reads the world-atlas TopoJSON the web game ships: quantised, delta-encoded arcs and one
/// Polygon or MultiPolygon per country, keyed by `properties.iso3`.
nonisolated struct TopoJSON {
    let shapes: [String: [CountryPolygon]]
    let arcs: [BorderArc]

    init(data: Data) throws {
        guard
            let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let rawArcs = root["arcs"] as? [[[Int]]],
            let transform = root["transform"] as? [String: Any],
            let scale = transform["scale"] as? [Double], scale.count == 2,
            let translate = transform["translate"] as? [Double], translate.count == 2,
            let objects = root["objects"] as? [String: Any],
            let layer = objects["countries"] as? [String: Any],
            let geometries = layer["geometries"] as? [[String: Any]]
        else { throw WorldDataError.malformed("world") }

        let decoded: [[SIMD2<Double>]] = rawArcs.map { arc in
            var x = 0, y = 0
            return arc.map { step in
                x += step[0]
                y += step[1]
                return SIMD2(Double(x) * scale[0] + translate[0], Double(y) * scale[1] + translate[1])
            }
        }

        var uses = [Int](repeating: 0, count: decoded.count)
        func ring(_ indexes: [Int]) -> [SIMD2<Double>] {
            var out: [SIMD2<Double>] = []
            for i in indexes {
                let arc = i >= 0 ? decoded[i] : Array(decoded[~i].reversed())
                uses[i >= 0 ? i : ~i] += 1
                out.append(contentsOf: out.isEmpty ? arc[...] : arc.dropFirst())
            }
            // world-atlas stitches outlines across the antimeridian; keep them in one piece.
            return CountryPolygon.unwrapped(out)
        }

        var shapes: [String: [CountryPolygon]] = [:]
        for geometry in geometries {
            guard
                let properties = geometry["properties"] as? [String: Any],
                let iso3 = properties["iso3"] as? String,
                let type = geometry["type"] as? String
            else { continue }
            let polygons: [[[Int]]]
            switch type {
            case "Polygon": polygons = [geometry["arcs"] as? [[Int]] ?? []]
            case "MultiPolygon": polygons = geometry["arcs"] as? [[[Int]]] ?? []
            default: continue
            }
            let built = polygons.map { CountryPolygon(rings: $0.map(ring)) }.filter { !$0.rings.isEmpty }
            shapes[iso3, default: []].append(contentsOf: built)
        }

        self.shapes = shapes
        self.arcs = decoded.enumerated().compactMap { index, points in
            uses[index] == 0 ? nil : BorderArc(points: CountryPolygon.unwrapped(points), shared: uses[index] > 1)
        }
    }
}

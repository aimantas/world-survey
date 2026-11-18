import Foundation
import simd

/// The country table, the 1:50m outlines and the field course, loaded once from the bundle.
nonisolated final class WorldData: Sendable {
    let generated: String
    let sources: [DataSource]
    let countries: [Country]
    let sovereign: [Country]
    let byIso: [String: Country]
    let shapes: [String: [CountryPolygon]]
    let arcs: [BorderArc]
    let lessons: [Lesson]
    let lookalikes: [String: [String]]

    private struct Table: Decodable {
        let generated: String
        let sources: [DataSource]
        let countries: [Country]
    }

    private struct Course: Decodable {
        let lessons: [Lesson]
        let lookalikes: [[String]]
    }

    init(bundle: Bundle = .main) throws {
        func data(_ name: String) throws -> Data {
            guard let url = bundle.url(forResource: name, withExtension: "json") else { throw WorldDataError.missing(name) }
            return try Data(contentsOf: url)
        }
        let table = try JSONDecoder().decode(Table.self, from: data("countries"))
        let course = try JSONDecoder().decode(Course.self, from: data("course"))
        let topo = try TopoJSON(data: data("world"))

        generated = table.generated
        sources = table.sources
        countries = table.countries
        sovereign = table.countries.filter(\.sovereign)
        byIso = Dictionary(uniqueKeysWithValues: table.countries.map { ($0.iso3, $0) })
        shapes = topo.shapes
        arcs = topo.arcs
        lessons = course.lessons

        var groups: [String: [String]] = [:]
        for group in course.lookalikes {
            for iso in group {
                var list = groups[iso] ?? []
                for other in group where other != iso && !list.contains(other) { list.append(other) }
                groups[iso] = list
            }
        }
        lookalikes = groups
    }

    func country(_ iso3: String) -> Country? { byIso[iso3] }

    /// Which country contains this point; nil over sea.
    func country(at point: LatLng) -> Country? {
        for (iso3, polygons) in shapes {
            for polygon in polygons where polygon.contains(lng: point.lng, lat: point.lat) {
                return byIso[iso3]
            }
        }
        return nil
    }

    /// Distance from a point to the nearest outline vertex of a country. Good enough at 1:50m density.
    func distanceKm(from point: LatLng, to country: Country) -> Double {
        guard let polygons = shapes[country.iso3], !polygons.isEmpty else {
            return Geo.distanceKm(point, country.label)
        }
        var best = Double.infinity
        for polygon in polygons {
            for ring in polygon.rings {
                for p in ring {
                    best = min(best, Geo.distanceKm(point, LatLng(lat: p.y, lng: p.x)))
                }
            }
        }
        return best
    }

    func neighbours(of country: Country) -> [Country] {
        country.borders.compactMap { byIso[$0] }
    }

    func lessons(in region: String) -> [Lesson] {
        lessons.filter { $0.region == region }
    }

    static let regions = ["World", "Europe", "Asia", "Africa", "Americas", "Oceania"]
    static let courseRegions = ["Europe", "Asia", "Africa", "Americas", "Oceania"]
}

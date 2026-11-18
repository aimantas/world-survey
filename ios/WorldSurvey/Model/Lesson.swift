import Foundation

nonisolated struct Lesson: Codable, Identifiable, Hashable, Sendable {
    let slug: String
    let region: String
    let group: String
    let name: String
    let number: Int
    let iso3: [String]
    var id: String { slug }
}

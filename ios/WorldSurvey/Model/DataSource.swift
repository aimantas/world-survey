import Foundation

nonisolated struct DataSource: Codable, Identifiable, Sendable {
    let what: String
    let name: String
    let url: String
    let licence: String
    let retrieved: String
    var id: String { what + name }
}

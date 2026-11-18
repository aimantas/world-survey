import Foundation

nonisolated struct ScriptItem: Sendable {
    var kind: RoundKind
    var iso3: String
    var seed: UInt32?
    var isRetry = false
}

import Foundation

nonisolated struct RoundResult: Identifiable, Sendable {
    let round: Round
    let correct: Bool
    let points: Int
    let grade: Grade
    let ms: Double
    /// How far off, where distance means something.
    let km: Double?
    let picked: Country?
    let guess: LatLng?
    let timeBonus: Int
    /// The first correct answer for this country: it prints in colour from now on.
    let newlySurveyed: Bool

    var id: Int { round.id }
}

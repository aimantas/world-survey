import Foundation
import Testing
@testable import WorldSurvey

@MainActor
struct RulesTests {
    @Test func scoringMatchesTheWebGame() {
        #expect(Scoring.timeBonus(ms: 1500) == 200)
        #expect(Scoring.timeBonus(ms: 7000) == 100)
        #expect(Scoring.timeBonus(ms: 13000) == 0)
        #expect(Scoring.nearMissPoints(km: 0) == 600)
        #expect(Scoring.nearMissPoints(km: 4000) == 0)
        #expect(Scoring.pinPoints(km: 20) == 1000)
        #expect(Scoring.pinPoints(km: 250) == 500)
        #expect(Scoring.pinPoints(km: 2500) == 0)
        #expect(Scoring.streakMultiplier(0) == 1)
        #expect(Scoring.streakMultiplier(6) == 2)
        #expect(Scoring.streakMultiplier(60) == 5)
        #expect(Scoring.grade(points: 950) == .perfect)
        #expect(Scoring.grade(points: 0) == .miss)
    }

    /// Values printed by the web game's rng.js for the same inputs.
    @Test func seededRandomMatchesTheWebGame() {
        #expect(Rand.hash("geo-daily:2026-11-14") == 3_023_753_143)
        let rand = Rand(seedString: "geo-daily:2026-11-14")
        let first = [rand.unit(), rand.unit(), rand.unit()]
        #expect(abs(first[0] - 0.019338357727974653) < 1e-12)
        #expect(abs(first[1] - 0.8439377786125988) < 1e-12)
        #expect(abs(first[2] - 0.2077164906077087) < 1e-12)
    }

    @Test func dataLoadsAndIndexes() throws {
        let data = try WorldData()
        #expect(data.sovereign.count == 195)
        #expect(data.lessons.count == 39)
        #expect(Set(data.lessons.flatMap(\.iso3)).count == 195)
        #expect(data.country(at: LatLng(lat: 54.69, lng: 25.28))?.iso3 == "LTU")
        #expect(data.country(at: LatLng(lat: -1.29, lng: 36.82))?.iso3 == "KEN")
        #expect(data.country(at: LatLng(lat: 30, lng: -40)) == nil)
        // Russia's outline crosses the antimeridian: both sides, and the latitudes where it crosses.
        #expect(data.country(at: LatLng(lat: 66.5, lng: -173))?.iso3 == "RUS")
        #expect(data.country(at: LatLng(lat: 66.5, lng: 100))?.iso3 == "RUS")
        #expect(data.country(at: LatLng(lat: 67, lng: 178))?.iso3 == "RUS")
        #expect(data.country(at: LatLng(lat: 66.5, lng: -160))?.iso3 == "USA")
        #expect(data.country(at: LatLng(lat: 75, lng: -175)) == nil)
        #expect(data.country(at: LatLng(lat: -17.8, lng: 178))?.iso3 == "FJI")
        #expect(data.arcs.contains { $0.shared })
        #expect(data.arcs.contains { !$0.shared })
    }

    /// The same five countries the site asks on this date.
    @Test func dailyExpeditionMatchesTheWebGame() throws {
        let data = try WorldData()
        let script = Daily.script(countries: data.countries, date: "2026-11-14")
        #expect(script.map(\.kind) == Daily.plan)
        #expect(script.map(\.iso3) == ["HUN", "JOR", "MNG", "CRI", "ZWE"])
        #expect(script.map(\.seed) == [159_610_993, 260_707_658, 498_442_700, 147_065_426, 279_640_429])
        #expect(Daily.number(for: "2026-11-03") == 1)
        #expect(Daily.number(for: "2026-11-14") == 12)
    }

    @Test func progressTracksMasteryAndReview() {
        let defaults = UserDefaults(suiteName: "tests-\(UUID().uuidString)")!
        let store = ProgressStore(defaults: defaults, key: "t")
        let start = Date(timeIntervalSince1970: 1_800_000_000)
        #expect(store.answer(iso3: "KEN", correct: true, ms: 1500, now: start).newlySurveyed)
        #expect(!store.answer(iso3: "KEN", correct: true, ms: 1500, now: start).newlySurveyed)
        #expect(store.state.mastery["KEN"] == 2)
        store.answer(iso3: "PER", correct: false, ms: nil, now: start)
        #expect(store.state.mastery["PER"] == 0)
        let kenya = Country.stub("KEN"), peru = Country.stub("PER")
        // A fresh miss waits ten minutes; mastery 2 waits three days.
        #expect(store.due(in: [kenya, peru], now: start.addingTimeInterval(60)).isEmpty)
        #expect(store.due(in: [kenya, peru], now: start.addingTimeInterval(700)).map(\.iso3) == ["PER"])
        #expect(store.due(in: [kenya, peru], now: start.addingTimeInterval(4 * 86400)).map(\.iso3) == ["PER", "KEN"])
        // Saved and read back.
        #expect(ProgressStore(defaults: defaults, key: "t").state.mastery["KEN"] == 2)
    }

    /// A record saved before a setting existed must still load, with the new setting at its default.
    @Test func olderSettingsStillLoad() throws {
        let old = #"{"sound":false,"haptics":true,"difficulty":"hard","region":"Asia","units":"mi"}"#
        let settings = try JSONDecoder().decode(ProgressState.Settings.self, from: Data(old.utf8))
        #expect(settings.sound == false)
        #expect(settings.difficulty == .hard)
        #expect(settings.region == "Asia")
        #expect(settings.units == .mi)
        #expect(settings.autoNext == true)
        var changed = settings
        changed.autoNext = false
        let roundTrip = try JSONDecoder().decode(ProgressState.Settings.self, from: JSONEncoder().encode(changed))
        #expect(roundTrip == changed)
    }

    @Test func dayStreakCountsBackFromToday() {
        let calendar = Calendar.current
        let now = Date.now
        func key(_ back: Int) -> String { DayStreak.key(calendar.date(byAdding: .day, value: -back, to: now)!) }
        #expect(DayStreak(days: [key(0): 1, key(1): 2, key(2): 1], now: now).current == 3)
        #expect(DayStreak(days: [key(1): 1, key(2): 1], now: now).current == 2)
        #expect(DayStreak(days: [key(2): 1], now: now).current == 0)
    }

    @Test func distractorsPreferTheSameSubregion() throws {
        let data = try WorldData()
        let kenya = try #require(data.country("KEN"))
        let options = Questions.options(for: kenya, in: data.sovereign, rand: Rand(seed: 7))
        #expect(options.count == 4)
        #expect(options.contains(kenya))
        #expect(options.filter { $0.subregion == kenya.subregion }.count >= 3)
        let capitals = Questions.options(for: kenya, in: data.sovereign, rand: Rand(seed: 7), key: \.capital)
        #expect(Set(capitals.compactMap(\.capital)).count == 4)
    }
}

extension Country {
    static func stub(_ iso3: String) -> Country {
        Country(iso3: iso3, iso2: nil, name: iso3, official: nil, sovereign: true, region: "World", subregion: nil, capital: nil, capitalLatLng: nil, labelLatLng: [0, 0], bbox: nil, area: nil, population: nil, populationYear: nil, gdp: nil, gdpYear: nil, lifeExpectancy: nil, lifeExpectancyYear: nil, borders: [], languages: nil, currencies: nil, landlocked: nil, island: false, tier: 1, tiny: false, inMap: true, flag: nil, slug: nil)
    }
}

import Foundation

/// Everything the player has done, saved as one versioned record on the device.
nonisolated struct ProgressState: Codable, Sendable, Equatable {
    struct Seen: Codable, Sendable, Equatable {
        var right = 0
        var wrong = 0
        var last = Date.distantPast
    }

    struct DailyEntry: Codable, Sendable, Equatable {
        var score: Int
        var grades: [Grade]
        var number: Int
    }

    struct LessonRecord: Codable, Sendable, Equatable {
        var done: Date
        var right: Int
        var total: Int
        var runs: Int
    }

    struct Stats: Codable, Sendable, Equatable {
        var games = 0
        var answers = 0
        var correct = 0
        var fastestMs: Double?
    }

    struct Settings: Codable, Sendable, Equatable {
        var sound = true
        var haptics = true
        var difficulty = Difficulty.easy
        var region = "World"
        var units: DistanceUnit?
        /// After an answer, move on to the next country by itself.
        var autoNext = true
    }

    var version = 1
    var created = Date.now
    /// iso3 -> 0...3
    var mastery: [String: Int] = [:]
    var seen: [String: Seen] = [:]
    /// record key -> best score
    var records: [String: Int] = [:]
    var bestStreak = 0
    /// UTC "YYYY-MM-DD" -> result
    var daily: [String: DailyEntry] = [:]
    /// medal id -> date unlocked
    var medals: [String: Date] = [:]
    /// Countries opened in the atlas.
    var visited: Set<String> = []
    /// Local "YYYY-MM-DD" -> games finished that day
    var days: [String: Int] = [:]
    /// lesson slug -> record
    var course: [String: LessonRecord] = [:]
    var stats = Stats()
    var settings = Settings()

    var surveyedCount: Int { mastery.values.count { $0 > 0 } }

    func isSurveyed(_ iso3: String) -> Bool { (mastery[iso3] ?? 0) > 0 }

    func surveyed(in countries: [Country]) -> Int {
        countries.count { isSurveyed($0.iso3) }
    }
}

nonisolated extension ProgressState.Settings {
    private enum CodingKeys: String, CodingKey {
        case sound, haptics, difficulty, region, units, autoNext
    }

    /// Settings saved by an older version miss newer keys; those take their defaults
    /// instead of failing the whole record.
    init(from decoder: Decoder) throws {
        self.init()
        let c = try decoder.container(keyedBy: CodingKeys.self)
        sound = try c.decodeIfPresent(Bool.self, forKey: .sound) ?? sound
        haptics = try c.decodeIfPresent(Bool.self, forKey: .haptics) ?? haptics
        difficulty = try c.decodeIfPresent(Difficulty.self, forKey: .difficulty) ?? difficulty
        region = try c.decodeIfPresent(String.self, forKey: .region) ?? region
        units = try c.decodeIfPresent(DistanceUnit.self, forKey: .units)
        autoNext = try c.decodeIfPresent(Bool.self, forKey: .autoNext) ?? autoNext
    }
}

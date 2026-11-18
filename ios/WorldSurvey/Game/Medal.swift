import Foundation

/// Survey medals. Each check reads one event plus the saved state.
nonisolated struct Medal: Identifiable, Sendable {
    let id: String
    let name: String
    let text: String
    let symbol: String
    let check: @Sendable (GameEvent, ProgressState, WorldData) -> Bool

    private static let micro: Set<String> = ["VAT", "MCO", "SMR", "LIE", "AND", "MLT", "NRU", "TUV"]

    private static func answered(_ event: GameEvent, _ test: (RoundKind, GameMode, String, Bool, Double, Double?, Int) -> Bool) -> Bool {
        if case let .answer(kind, mode, iso3, correct, ms, km, streak) = event {
            return test(kind, mode, iso3, correct, ms, km, streak)
        }
        return false
    }

    private static func finished(_ event: GameEvent) -> (rounds: Int, misses: Int, courseTotal: Int)? {
        if case let .finish(rounds, misses, courseTotal) = event { return (rounds, misses, courseTotal) }
        return nil
    }

    static let all: [Medal] = [
        Medal(id: "first", name: "First benchmark", text: "Get your first answer right.", symbol: "triangle.fill") { e, _, _ in
            answered(e) { _, _, _, correct, _, _, _ in correct }
        },
        Medal(id: "streak5", name: "Five in a row", text: "Five correct answers in a row.", symbol: "5.circle.fill") { e, _, _ in
            answered(e) { _, _, _, _, _, _, streak in streak >= 5 }
        },
        Medal(id: "streak10", name: "Ten in a row", text: "Ten correct answers in a row.", symbol: "10.circle.fill") { e, _, _ in
            answered(e) { _, _, _, _, _, _, streak in streak >= 10 }
        },
        Medal(id: "streak25", name: "Long traverse", text: "Twenty-five correct answers in a row.", symbol: "25.circle.fill") { e, _, _ in
            answered(e) { _, _, _, _, _, _, streak in streak >= 25 }
        },
        Medal(id: "quick", name: "Quick draw", text: "A correct answer in under two seconds.", symbol: "bolt.fill") { e, _, _ in
            answered(e) { _, _, _, correct, ms, _, _ in correct && ms < 2000 }
        },
        Medal(id: "perfect", name: "Clean sheet", text: "Finish a ten-round game without a miss.", symbol: "checkmark.seal.fill") { e, _, _ in
            finished(e).map { $0.rounds >= 10 && $0.misses == 0 } ?? false
        },
        Medal(id: "pin25", name: "Dead reckoning", text: "Pin a capital within 25 km.", symbol: "mappin.and.ellipse") { e, _, _ in
            answered(e) { kind, _, _, _, _, km, _ in kind == .capitalPin && (km ?? .infinity) <= 25 }
        },
        Medal(id: "micro", name: "Microstate finder", text: "Find Vatican City, Monaco, San Marino, Liechtenstein, Andorra, Malta, Nauru or Tuvalu.", symbol: "scope") { e, _, _ in
            answered(e) { _, _, iso3, correct, _, _, _ in correct && micro.contains(iso3) }
        },
        Medal(id: "island10", name: "Island hopper", text: "Survey ten island nations.", symbol: "water.waves") { _, s, data in
            data.sovereign.count { $0.island && s.isSurveyed($0.iso3) } >= 10
        },
        Medal(id: "hl15", name: "Statistician", text: "Fifteen in a row in Higher or lower.", symbol: "chart.bar.fill") { e, _, _ in
            answered(e) { _, mode, _, _, _, _, streak in mode == .higherLower && streak >= 15 }
        },
        Medal(id: "survey50", name: "Fifty surveyed", text: "Survey 50 countries.", symbol: "globe.europe.africa.fill") { _, s, _ in
            s.surveyedCount >= 50
        },
        Medal(id: "survey100", name: "Hundred surveyed", text: "Survey 100 countries.", symbol: "globe.asia.australia.fill") { _, s, _ in
            s.surveyedCount >= 100
        },
        Medal(id: "survey195", name: "The whole world", text: "Survey all 195 countries.", symbol: "globe") { _, s, data in
            data.sovereign.allSatisfy { s.isSurveyed($0.iso3) }
        },
        Medal(id: "region", name: "Region complete", text: "Survey every country in one region.", symbol: "map.fill") { _, s, data in
            WorldData.courseRegions.contains { region in
                data.sovereign.filter { $0.region == region }.allSatisfy { s.isSurveyed($0.iso3) }
            }
        },
        Medal(id: "daily7", name: "Seven expeditions", text: "Play the daily expedition on seven days.", symbol: "calendar") { _, s, _ in
            s.daily.count >= 7
        },
        Medal(id: "days3", name: "Three days running", text: "Play on three days in a row.", symbol: "flame.fill") { e, s, _ in
            finished(e) != nil && DayStreak(days: s.days).current >= 3
        },
        Medal(id: "days7", name: "A week in the field", text: "Play on seven days in a row.", symbol: "tent.fill") { e, s, _ in
            finished(e) != nil && DayStreak(days: s.days).current >= 7
        },
        Medal(id: "lesson1", name: "First lesson", text: "Finish a lesson of the field course.", symbol: "book.fill") { e, s, _ in
            finished(e) != nil && s.course.count >= 1
        },
        Medal(id: "lesson10", name: "Ten lessons", text: "Finish ten lessons of the field course.", symbol: "books.vertical.fill") { e, s, _ in
            finished(e) != nil && s.course.count >= 10
        },
        Medal(id: "course", name: "Course complete", text: "Finish every lesson of the field course.", symbol: "graduationcap.fill") { e, s, _ in
            finished(e).map { $0.courseTotal > 0 && s.course.count >= $0.courseTotal } ?? false
        },
    ]
}

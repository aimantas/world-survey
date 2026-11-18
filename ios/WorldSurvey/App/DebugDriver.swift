#if DEBUG
import Foundation

/// Debug builds only: puts the app into a named state from a launch argument, so each screen can be
/// checked from the command line. Example: `xcrun simctl launch booted com.aimantas.WorldSurvey -wsDemo find-miss`.
/// `-wsReset YES` clears saved progress first; `-wsAutoNext NO` (or YES) sets the auto-next setting.
enum DebugDriver {
    static func run(_ model: AppModel) {
        let defaults = UserDefaults.standard
        if defaults.bool(forKey: "wsReset") { model.progress.reset(); model.refreshSurvey() }
        if defaults.object(forKey: "wsAutoNext") != nil {
            var settings = model.progress.settings
            settings.autoNext = defaults.bool(forKey: "wsAutoNext")
            model.progress.settings = settings
        }
        guard let demo = defaults.string(forKey: "wsDemo") else { return }
        Task {
            try? await Task.sleep(for: .seconds(1))
            await play(demo, model)
        }
    }

    private static func play(_ demo: String, _ model: AppModel) async {
        func wait(_ seconds: Double) async { try? await Task.sleep(for: .seconds(seconds)) }
        func config(_ mode: GameMode, region: String = "World", difficulty: Difficulty = .easy) -> GameConfig {
            var config = GameConfig(mode: mode)
            config.region = region
            config.difficulty = difficulty
            return config
        }
        /// Answers the current round, right or wrong, the way a player would.
        func answer(correct: Bool) {
            guard let session = model.session, let round = session.round else { return }
            let target = round.country
            let wrong = model.data.neighbours(of: target).first { $0.sovereign } ?? model.data.sovereign.first { $0 != target }
            switch round.kind {
            case .find, .flagHunt:
                let picked = correct ? target : wrong
                guard let picked else { return }
                session.tapGlobe(GlobePick(point: picked.label, country: picked, nearbyTiny: []))
            case .capitalPin:
                guard let capital = target.capitalPoint else { return }
                let point = correct ? capital : LatLng(lat: capital.lat + 3.2, lng: capital.lng - 4.1)
                session.tapGlobe(GlobePick(point: point, country: model.data.country(at: point), nearbyTiny: []))
            case .nameIt, .flagQuiz, .capitalQuiz:
                if let option = round.options.first(where: { ($0 == target) == correct }) { session.choose(option) }
            case .higherLower:
                guard let stat = round.stat, let other = round.other, let a = stat.value(other), let b = stat.value(target) else { return }
                session.answerHigherLower(higher: (b >= a) == correct)
            }
        }
        func next() {
            model.session?.advance()
            if model.session?.phase == .finished { model.showResults() }
        }

        switch demo {
        case "find-ask":
            model.start(config(.find, region: "Europe"))
        case "find-miss", "find-hit":
            model.start(config(.find, region: "Africa"))
            await wait(1.6)
            answer(correct: demo == "find-hit")
        case "name-ask":
            model.start(config(.nameIt, region: "Asia"))
        case "flag-ask":
            model.start(config(.flagQuiz))
        case "flag-miss":
            model.start(config(.flagQuiz))
            await wait(1.2)
            answer(correct: false)
        case "flaghunt-ask":
            model.start(config(.flagHunt, region: "Americas"))
        case "capital-ask":
            model.start(config(.capitalQuiz, region: "Europe"))
        case "pin-miss":
            model.start(config(.capitalPin, region: "Europe"))
            await wait(1.6)
            answer(correct: false)
        case "hl-ask", "hl-right":
            var hl = config(.higherLower)
            hl.preset = .population
            model.start(hl)
            if demo == "hl-right" {
                await wait(1.4)
                answer(correct: true)
            }
        case "results", "daily":
            if demo == "daily" { model.startDaily() } else { model.start(config(.find, region: "Europe")) }
            for i in 0..<12 {
                guard model.session?.phase != .finished, model.screen == .play else { break }
                await wait(0.5)
                answer(correct: i % 4 != 2)
                await wait(0.4)
                next()
            }
        case "auto-test":
            // Logs the auto-next behaviour: it moves on after three seconds, a touch holds it,
            // a drag on the globe holds it, and the last round waits.
            func log(_ text: String) { NSLog("%@", "AUTO \(text)") }
            func state() -> String {
                guard let s = model.session else { return "no session" }
                return "round=\(s.roundNumber) phase=\(s.phase) autoNextAt=\(s.autoNextAt != nil) screen=\(model.screen)"
            }
            model.start(config(.find, region: "Europe"))
            await wait(1)
            answer(correct: false)
            log("answered: \(state())")
            await wait(1.5)
            log("after 1.5 s: \(state())")
            await wait(1.8)
            log("after 3.3 s: \(state())")
            await wait(0.8)
            answer(correct: true)
            await wait(1)
            model.session?.holdAutoNext()
            log("held by a touch: \(state())")
            await wait(3)
            log("4 s after the answer: \(state())")
            next()
            await wait(1)
            answer(correct: true)
            await wait(1)
            model.globe.pan(translation: CGPoint(x: 8, y: 0))
            log("after a globe drag: \(state())")
            await wait(3)
            log("4 s after the answer: \(state())")
            while let s = model.session, s.phase != .finished, !s.isLastRound {
                next()
                await wait(0.3)
                answer(correct: true)
                await wait(0.3)
            }
            log("last round answered: \(state())")
            await wait(3.5)
            log("3.5 s later: \(state())")
            next()
            await wait(0.5)
            log("after Results: \(state())")
        case "pick-test":
            // Projects known places to the screen and picks them back, to check the tap maths.
            model.select(.atlas)
            for (iso3, place) in [("KEN", LatLng(lat: 0.5, lng: 37.9)), ("BRA", LatLng(lat: -10, lng: -52)), ("LTU", LatLng(lat: 55.3, lng: 23.9)), ("FJI", LatLng(lat: -17.8, lng: 178.0)), ("NZL", LatLng(lat: -43.5, lng: 171)), ("RUS", LatLng(lat: 66.5, lng: -173))] {
                model.globe.fly(to: place, distance: 2.2, duration: 0)
                await wait(0.4)
                let screen = model.globe.screenPoint(of: place)
                let pick = screen.flatMap { model.globe.pick(at: $0) }
                let error = pick.map { Geo.distanceKm($0.point, place) } ?? -1
                NSLog("%@", "PICK want=\(iso3) got=\(pick?.country?.iso3 ?? "nil") errorKm=\(Int(error)) screen=\(screen.map { "\(Int($0.x)),\(Int($0.y))" } ?? "nil")")
            }
            if let malta = model.data.country("MLT"), let italy = model.data.country("ITA") {
                model.globe.fly(to: italy, duration: 0)
                await wait(0.4)
                let screen = model.globe.screenPoint(of: malta.label)
                let pick = screen.flatMap { model.globe.pick(at: CGPoint(x: $0.x + 9, y: $0.y - 7)) }
                NSLog("%@", "PICK tiny near Malta: country=\(pick?.country?.iso3 ?? "sea") tiny=\(pick?.nearbyTiny.map(\.iso3) ?? [])")
            }
        case "atlas":
            model.select(.atlas)
        case "atlas-pick":
            model.select(.play)
            await wait(1)
            // A tap on the globe from any tab opens the country in the Atlas.
            if let kenya = model.data.country("KEN") {
                model.globe.onPick?(GlobePick(point: kenya.label, country: kenya, nearbyTiny: []))
            }
        case "tab-learn", "course":
            model.select(.learn)
        case "tab-progress", "medals":
            model.select(.progress)
        case "region-europe":
            model.setRegion("Europe")
        case "region-world":
            model.setRegion("World")
        case "lesson-card":
            if let lesson = model.data.lessons.first {
                model.openLesson(lesson)
                await wait(1.5)
                model.startLessonQuiz(lesson)
            }
        case "lesson":
            if let lesson = model.data.lessons.first { model.openLesson(lesson) }
        case "settings":
            model.sheet = .settings
        case "setup-flags":
            model.sheet = .modes(.flags)
        case "setup-hl":
            model.sheet = .modes(.higherLower)
        default:
            break
        }
    }
}
#endif

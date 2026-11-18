import Foundation
import Observation
import UIKit

/// One game from the first question to the results: draws the rounds, scores the answers,
/// saves progress and tells the globe what to show.
@Observable
final class GameSession {
    enum Phase { case asking, revealed, finished }

    let config: GameConfig
    private(set) var phase = Phase.asking
    private(set) var round: Round?
    private(set) var lastResult: RoundResult?
    private(set) var results: [RoundResult] = []
    private(set) var score = 0
    private(set) var streak = 0
    private(set) var bestStreak = 0
    private(set) var misses = 0
    /// Rounds in this game; nil when one miss ends it.
    private(set) var total: Int?
    private(set) var askedAt = Date.now
    private(set) var summary: GameSummary?
    /// Medals unlocked by the last answer.
    private(set) var freshMedals: [Medal] = []
    /// A short hint when a tap could not count, such as open water.
    private(set) var nudge: String?
    /// When the reveal moves on to the next country by itself; nil when it waits for Next.
    private(set) var autoNextAt: Date?

    /// How long the reveal stays up after an answer before the next country comes up on its own.
    static let autoNextDelay: TimeInterval = 3
    /// Called once the game ends, by a tap on Results or otherwise.
    @ObservationIgnored var onFinish: (() -> Void)?

    @ObservationIgnored private let data: WorldData
    @ObservationIgnored private let progress: ProgressStore
    @ObservationIgnored private let globe: GlobeController
    @ObservationIgnored private let feedback: Feedback
    @ObservationIgnored private var script: [ScriptItem]
    @ObservationIgnored private var used: Set<String> = []
    @ObservationIgnored private var recent: [String] = []
    @ObservationIgnored private let rand = Rand()
    @ObservationIgnored private var medals: [Medal] = []
    @ObservationIgnored private var surveyedAtStart = 0
    @ObservationIgnored private var autoNextTask: Task<Void, Never>?
    @ObservationIgnored private var autoNextScheduled = Date.distantPast

    init(config: GameConfig, data: WorldData, progress: ProgressStore, globe: GlobeController, feedback: Feedback) {
        self.config = config
        self.data = data
        self.progress = progress
        self.globe = globe
        self.feedback = feedback
        self.script = config.script
    }

    var isEndless: Bool { config.mode.endless }
    var roundNumber: Int { round?.id ?? results.count }
    var isLastRound: Bool {
        if isEndless { return lastResult?.correct == false }
        return total.map { results.count >= $0 } ?? false
    }
    var multiplier: Double { config.mode == .streak ? Scoring.streakMultiplier(streak) : 1 }

    // MARK: - Flow

    func start() {
        total = config.mode.scripted ? script.count : isEndless ? nil : config.mode.defaultRounds
        surveyedAtStart = progress.state.surveyedCount
        globe.idleSpin = false
        globe.onPick = { [weak self] pick in self?.tapGlobe(pick) }
        globe.onUserInteraction = { [weak self] in self?.holdAutoNext() }
        advance()
    }

    /// Moves on from a reveal: the next question, or the results.
    func advance() {
        cancelAutoNext()
        guard phase != .finished else { return }
        if isLastRound {
            finish()
            return
        }
        guard let next = makeRound(number: results.count + 1) else {
            finish()
            return
        }
        round = next
        lastResult = nil
        nudge = nil
        freshMedals = []
        phase = .asking
        stageQuestion(next)
        askedAt = .now
    }

    func quit() {
        cancelAutoNext()
        globe.onPick = nil
        globe.onUserInteraction = nil
        globe.interactive = true
        globe.clear()
    }

    // MARK: - Auto next

    /// Three seconds after an answer the next country comes up by itself. The last round never
    /// does: the results wait for a tap. Off in Settings, and while VoiceOver is running, so the
    /// card is never pulled away while it is being read.
    private func scheduleAutoNext() {
        cancelAutoNext()
        guard progress.settings.autoNext, !UIAccessibility.isVoiceOverRunning, !isLastRound else { return }
        let deadline = Date.now.addingTimeInterval(Self.autoNextDelay)
        autoNextScheduled = .now
        autoNextAt = deadline
        autoNextTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(Self.autoNextDelay))
            guard !Task.isCancelled, let self, self.phase == .revealed, self.autoNextAt == deadline else { return }
            self.advance()
        }
    }

    /// The player touched the card or the globe: stay on this card until Next.
    /// A touch in the first moment after scheduling is the answer itself, so it does not count.
    func holdAutoNext() {
        guard autoNextAt != nil, Date.now.timeIntervalSince(autoNextScheduled) > 0.35 else { return }
        cancelAutoNext()
    }

    private func cancelAutoNext() {
        autoNextTask?.cancel()
        autoNextTask = nil
        autoNextAt = nil
    }

    // MARK: - Drawing rounds

    private func makeRound(number: Int) -> Round? {
        if config.mode.scripted {
            guard script.indices.contains(number - 1) else { return nil }
            let item = script[number - 1]
            guard let country = data.country(item.iso3) else { return nil }
            let source = item.seed.map { Rand(seed: $0) } ?? rand
            return build(item.kind, country, number: number, rand: source, isRetry: item.isRetry)
        }
        if config.mode == .higherLower { return makeHigherLower(number: number) }

        let kind: RoundKind
        if config.mode == .streak {
            kind = rand.pick([RoundKind.find, .nameIt, .flagQuiz]) ?? .find
        } else {
            kind = config.mode.kind ?? .find
        }
        guard let country = Questions.nextCountry(pool(for: kind), progress: progress.state, used: used, rand: rand) else { return nil }
        used.insert(country.iso3)
        return build(kind, country, number: number, rand: rand, isRetry: false)
    }

    private func pool(for kind: RoundKind) -> [Country] {
        if config.mode == .lookalikes {
            return data.sovereign.filter { data.lookalikes[$0.iso3] != nil && $0.flagAsset != nil }
        }
        let need: [Questions.Need] = switch kind {
        case .flagQuiz, .flagHunt: [.flag]
        case .capitalQuiz: [.capital]
        case .capitalPin: [.capitalPoint]
        default: []
        }
        return Questions.pool(data.sovereign, region: config.region, difficulty: config.difficulty, need: need)
    }

    private func build(_ kind: RoundKind, _ country: Country, number: Int, rand: Rand, isRetry: Bool) -> Round {
        var round = Round(id: number, kind: kind, country: country, isRetry: isRetry)
        switch kind {
        case .nameIt:
            round.options = Questions.options(for: country, in: data.sovereign, rand: rand)
        case .flagQuiz:
            round.options = config.mode == .lookalikes
                ? Questions.lookalikeOptions(for: country, data: data, rand: rand)
                : Questions.options(for: country, in: data.sovereign.filter { $0.flagAsset != nil }, rand: rand)
        case .capitalQuiz:
            round.options = Questions.options(for: country, in: data.sovereign, rand: rand, key: \.capital)
        case .find, .flagHunt, .capitalPin, .higherLower:
            break
        }
        return round
    }

    /// The country just asked about becomes the known one, so each round builds on the last.
    private func makeHigherLower(number: Int) -> Round? {
        let list = Questions.pool(data.sovereign, region: config.region, difficulty: config.difficulty)
        let neighboursOnly = config.preset == .neighbours
        for _ in 0..<40 {
            guard let stat = config.preset.stat ?? rand.pick(Stat.allCases) else { return nil }
            let previous = lastResult?.round.country
            guard let other = previous.flatMap({ stat.value($0) != nil ? $0 : nil }) ?? rand.pick(list.filter { stat.value($0) != nil }),
                  let known = stat.value(other)
            else { continue }
            let source = neighboursOnly ? data.neighbours(of: other).filter(\.sovereign) : list
            let candidates = source.filter { c in
                c != other && !recent.contains(c.iso3) && stat.value(c).map { $0 != known } == true
            }
            guard let country = rand.pick(candidates) else {
                // A dead end (an island in Neighbours, say): start a fresh pair.
                if previous != nil, let fresh = rand.pick(list), let pair = freshPair(from: fresh, stat: stat, list: list) {
                    return Round(id: number, kind: .higherLower, country: pair.country, stat: stat, other: pair.other)
                }
                continue
            }
            remember(country.iso3)
            remember(other.iso3)
            return Round(id: number, kind: .higherLower, country: country, stat: stat, other: other)
        }
        return nil
    }

    private func freshPair(from other: Country, stat: Stat, list: [Country]) -> (other: Country, country: Country)? {
        guard let known = stat.value(other) else { return nil }
        let source = config.preset == .neighbours ? data.neighbours(of: other).filter(\.sovereign) : list
        guard let country = rand.pick(source.filter { c in c != other && stat.value(c).map { $0 != known } == true }) else { return nil }
        remember(country.iso3)
        remember(other.iso3)
        return (other, country)
    }

    private func remember(_ iso3: String) {
        recent.append(iso3)
        if recent.count > 10 { recent.removeFirst(recent.count - 10) }
    }

    // MARK: - Answers

    /// A tap on the globe: a country for Find it and Flag hunt, a point for Capital pin.
    func tapGlobe(_ pick: GlobePick) {
        guard phase == .asking, let round else { return }
        switch round.kind {
        case .find, .flagHunt:
            let target = round.country
            // Small states count when their ring is under the finger, and the target wins a tie.
            let picked: Country? = (pick.country == target || pick.nearbyTiny.contains(target)) ? target : pick.country ?? pick.nearbyTiny.first
            guard let picked else {
                nudge = "That’s open water. Tap a country."
                feedback.play(.tap)
                return
            }
            let ms = elapsedMs
            let correct = picked == target
            let km = correct ? 0 : data.distanceKm(from: pick.point, to: target)
            let bonus = correct ? Scoring.timeBonus(ms: ms) : 0
            conclude(round, correct: correct, base: correct ? Scoring.roundMax + bonus : Scoring.nearMissPoints(km: km), ms: ms, km: km, picked: picked, guess: pick.point, timeBonus: bonus)
        case .capitalPin:
            guard let capital = round.country.capitalPoint else { return }
            let ms = elapsedMs
            let km = Geo.distanceKm(pick.point, capital)
            let bonus = km <= 250 ? Scoring.timeBonus(ms: ms) : 0
            conclude(round, correct: km <= 150, base: Scoring.pinPoints(km: km) + bonus, ms: ms, km: km, picked: pick.country, guess: pick.point, timeBonus: bonus)
        case .nameIt, .flagQuiz, .capitalQuiz, .higherLower:
            break
        }
    }

    func choose(_ option: Country) {
        guard phase == .asking, let round, !round.options.isEmpty else { return }
        let ms = elapsedMs
        let correct = option == round.country
        let bonus = correct ? Scoring.timeBonus(ms: ms) : 0
        conclude(round, correct: correct, base: correct ? Scoring.roundMax + bonus : 0, ms: ms, km: nil, picked: option, guess: nil, timeBonus: bonus)
    }

    func answerHigherLower(higher: Bool) {
        guard phase == .asking, let round, round.kind == .higherLower,
              let stat = round.stat, let other = round.other,
              let known = stat.value(other), let asked = stat.value(round.country)
        else { return }
        conclude(round, correct: higher ? asked >= known : asked <= known, base: 1, ms: elapsedMs, km: nil, picked: nil, guess: nil, timeBonus: 0)
    }

    private var elapsedMs: Double { Date.now.timeIntervalSince(askedAt) * 1000 }

    private func conclude(_ round: Round, correct: Bool, base: Int, ms: Double, km: Double?, picked: Country?, guess: LatLng?, timeBonus: Int) {
        let isHigherLower = round.kind == .higherLower
        let points: Int
        let grade: Grade
        if isHigherLower {
            points = correct ? 1 : 0
            grade = correct ? .perfect : .miss
        } else if correct {
            points = Int((Double(base) * multiplier).rounded())
            grade = base >= 900 ? .perfect : .close
        } else {
            points = base
            grade = Scoring.grade(points: points)
        }

        if correct {
            streak += 1
            bestStreak = max(bestStreak, streak)
        } else {
            streak = 0
            misses += 1
            if config.retryMisses, !round.isRetry {
                script.append(ScriptItem(kind: round.kind, iso3: round.country.iso3, isRetry: true))
                total = script.count
            }
        }
        score += points

        var newlySurveyed = false
        if !isHigherLower {
            newlySurveyed = progress.answer(iso3: round.country.iso3, correct: correct, ms: correct ? ms : nil).newlySurveyed
        }
        freshMedals = unlock(for: .answer(kind: round.kind, mode: config.mode, iso3: round.country.iso3, correct: correct, ms: ms, km: km, streak: streak))

        let result = RoundResult(round: round, correct: correct, points: points, grade: grade, ms: ms, km: km, picked: picked, guess: guess, timeBonus: correct ? timeBonus : 0, newlySurveyed: newlySurveyed)
        results.append(result)
        lastResult = result
        nudge = nil
        phase = .revealed
        globe.interactive = false
        stageReveal(result)
        scheduleAutoNext()
        feedback.play(correct ? (newlySurveyed ? .stamp : .correct) : grade == .miss ? .miss : .near)
    }

    private func unlock(for event: GameEvent) -> [Medal] {
        let state = progress.state
        let earned = Medal.all.filter { state.medals[$0.id] == nil && $0.check(event, state, data) && progress.unlock($0.id) }
        medals.append(contentsOf: earned)
        return earned
    }

    private func finish() {
        let record = progress.finishGame(recordKey: config.recordKey, score: score, bestStreak: bestStreak)
        var share: String?
        if config.mode == .daily, let date = config.dailyDate {
            let grades = results.map(\.grade)
            progress.saveDaily(date: date, entry: .init(score: score, grades: grades, number: Daily.number(for: date)))
            share = Daily.shareText(date: date, score: score, grades: grades)
        }
        var lessonFirstTime = false
        if config.mode == .lesson, let lesson = config.lesson {
            let firstTries = results.filter { !$0.round.isRetry }
            lessonFirstTime = progress.finishLesson(slug: lesson.slug, right: firstTries.count { $0.correct }, total: firstTries.count)
        }
        _ = unlock(for: .finish(rounds: results.count, misses: misses, courseTotal: data.lessons.count))

        let accuracy = results.isEmpty ? 0 : Double(results.count { $0.correct }) / Double(results.count)
        summary = GameSummary(
            config: config,
            results: results,
            score: score,
            bestStreak: bestStreak,
            misses: misses,
            rank: isEndless ? .forRun(bestStreak) : .forAccuracy(accuracy),
            isRecord: record.isRecord,
            previousRecord: record.previous,
            newMedals: medals,
            newlySurveyed: max(0, progress.state.surveyedCount - surveyedAtStart),
            lessonFirstTime: lessonFirstTime,
            shareText: share
        )
        phase = .finished
        round = nil
        globe.onPick = nil
        stageRoute()
        onFinish?()
        feedback.play(.finish)
    }

    // MARK: - Staging the globe

    private var overviewRegion: String {
        if let lesson = config.lesson { return lesson.region }
        return config.mode.usesRegion ? config.region : "World"
    }

    private func stageQuestion(_ round: Round) {
        globe.clear()
        switch round.kind {
        case .find, .flagHunt, .capitalPin:
            globe.interactive = true
            if let lesson = config.lesson {
                // A lesson is searched in its own neighbourhood, with room around it.
                globe.fly(toFit: lesson.iso3.compactMap { data.country($0) }, minRadius: 0.2, margin: 1.7, duration: 0.9)
            } else {
                globe.overview(region: overviewRegion)
            }
        case .nameIt:
            globe.interactive = false
            globe.highlight(round.country, style: .answer)
            globe.fly(to: round.country)
        case .capitalQuiz:
            globe.interactive = false
            globe.highlight(round.country, style: .focus)
            globe.fly(to: round.country)
        case .flagQuiz:
            // Showing the country would give the flag away.
            globe.interactive = false
            globe.overview(region: overviewRegion)
        case .higherLower:
            globe.interactive = false
            guard let other = round.other else { return }
            globe.highlight(other, style: .focus, label: true)
            globe.highlight(round.country, style: .wrong, label: true)
            globe.drawArc(from: other.label, to: round.country.label)
            globe.fly(toFit: [other, round.country], minRadius: 0.12)
        }
    }

    private func stageReveal(_ result: RoundResult) {
        let round = result.round
        let country = round.country
        globe.setSurveyed(surveyedSet)
        if round.kind == .higherLower { return }

        globe.clear()
        for neighbour in data.neighbours(of: country) where neighbour != result.picked {
            globe.highlight(neighbour, style: .neighbour)
        }
        // Capital pin labels the city instead; the two names would sit on top of each other.
        globe.highlight(country, style: result.correct ? .correct : .answer, label: round.kind != .capitalPin)

        switch round.kind {
        case .find, .flagHunt:
            if !result.correct, let picked = result.picked, let guess = result.guess {
                globe.highlight(picked, style: .wrong, label: true)
                globe.dropPin(at: guess, style: .guess)
                let label = result.km.map { progress.units.format(km: $0) }
                globe.drawArc(from: guess, to: country.label, label: label)
                globe.fly(toFit: [country, picked], points: [guess], minRadius: 0.08)
            } else {
                globe.fly(to: country)
            }
        case .capitalPin:
            guard let capital = country.capitalPoint, let guess = result.guess else { return }
            globe.dropPin(at: capital, style: .capital)
            globe.dropPin(at: guess, style: .guess)
            globe.drawArc(from: guess, to: capital, label: result.km.map { progress.units.format(km: $0) })
            if let name = country.capital { globe.addLabel(name, at: capital, offset: CGPoint(x: 0, y: -20)) }
            globe.fly(toFit: [guess, capital], minRadius: 0.06)
        case .nameIt, .flagQuiz, .capitalQuiz:
            if round.kind == .capitalQuiz, let capital = country.capitalPoint {
                globe.dropPin(at: capital, style: .capital)
            }
            globe.fly(to: country)
        case .higherLower:
            break
        }
    }

    /// The results sheet shows the route: every country of the game, joined in the order played.
    private func stageRoute() {
        globe.clear()
        globe.setSurveyed(surveyedSet)
        var stops: [Country] = []
        for result in results where !stops.contains(result.round.country) { stops.append(result.round.country) }
        for (i, stop) in stops.enumerated() {
            let result = results.first { $0.round.country == stop }
            globe.highlight(stop, style: result?.correct == true ? .correct : .wrong)
            if i > 0 { globe.drawArc(from: stops[i - 1].label, to: stop.label) }
        }
        if stops.isEmpty {
            globe.zoomOut()
        } else {
            globe.fly(toFit: stops, minRadius: 0.2, duration: 1.4)
        }
    }

    private var surveyedSet: Set<String> {
        Set(progress.state.mastery.filter { $0.value > 0 }.keys)
    }
}

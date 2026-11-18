import Foundation
import Observation

/// App-wide state: which screen is up, the running game, and the long-lived services.
@Observable
final class AppModel {
    enum Screen: Equatable {
        /// The tabs: Play, Learn, Atlas and Progress.
        case home
        case play
        case results
        case lesson(Lesson)
    }

    enum Sheet: Identifiable, Equatable {
        /// The games inside a tile that holds several.
        case modes(ModeGroup)
        case settings

        var id: String {
            switch self {
            case .modes(let group): "modes-\(group.rawValue)"
            case .settings: "settings"
            }
        }
    }

    let data: WorldData
    let progress: ProgressStore
    let globe: GlobeController
    let feedback = Feedback()

    var screen = Screen.home
    private(set) var tab = HomeTab.play
    var sheet: Sheet?
    /// The country open in the Atlas tab.
    private(set) var atlasSelection: Country?
    private(set) var session: GameSession?

    init(data: WorldData, progress: ProgressStore) {
        self.data = data
        self.progress = progress
        globe = GlobeController(data: data)
        applySettings()
        refreshSurvey()
        stageHome()
    }

    func applySettings() {
        feedback.soundOn = progress.settings.sound
        feedback.hapticsOn = progress.settings.haptics
    }

    func refreshSurvey() {
        globe.setSurveyed(Set(progress.state.mastery.filter { $0.value > 0 }.keys))
    }

    // MARK: - Starting games

    func start(_ config: GameConfig) {
        session?.quit()
        sheet = nil
        let session = GameSession(config: config, data: data, progress: progress, globe: globe, feedback: feedback)
        session.onFinish = { [weak self] in self?.showResults() }
        self.session = session
        screen = .play
        session.start()
    }

    func startDaily() {
        let date = Daily.today()
        var config = GameConfig(mode: .daily)
        config.dailyDate = date
        config.script = Daily.script(countries: data.countries, date: date)
        start(config)
    }

    /// The quiz half of a lesson: find each country, then name it, its flag or its capital.
    func startLessonQuiz(_ lesson: Lesson) {
        let rand = Rand()
        let countries = lesson.iso3.compactMap { data.country($0) }
        var script = rand.shuffled(countries).map { ScriptItem(kind: .find, iso3: $0.iso3) }
        let seconds: [RoundKind] = [.nameIt, .flagQuiz, .capitalQuiz]
        for (i, country) in rand.shuffled(countries).enumerated() {
            var kind = seconds[i % seconds.count]
            if kind == .flagQuiz, country.flagAsset == nil { kind = .nameIt }
            if kind == .capitalQuiz, country.capital == nil { kind = .nameIt }
            script.append(ScriptItem(kind: kind, iso3: country.iso3))
        }
        var config = GameConfig(mode: .lesson)
        config.lesson = lesson
        config.script = script
        config.retryMisses = true
        start(config)
    }

    /// Up to ten countries that are due again, least known first.
    func startReview() {
        let due = progress.due(in: data.sovereign).prefix(10)
        guard !due.isEmpty else { return }
        let kinds: [RoundKind] = [.find, .nameIt, .flagQuiz, .capitalQuiz]
        let rand = Rand()
        var config = GameConfig(mode: .review)
        config.script = due.enumerated().map { i, item in
            ScriptItem(kind: item.mastery == 0 ? .find : kinds[(i + rand.int(below: kinds.count)) % kinds.count], iso3: item.iso3)
        }
        start(config)
    }

    /// The countries just missed, asked the same way.
    func startPractice(from summary: GameSummary) {
        var seen: Set<String> = []
        let items = summary.results.filter { !$0.correct && $0.round.kind != .higherLower && seen.insert($0.round.country.iso3).inserted }
        guard !items.isEmpty else { return }
        var config = GameConfig(mode: .practice)
        config.script = items.map { ScriptItem(kind: $0.round.kind, iso3: $0.round.country.iso3) }
        start(config)
    }

    func showResults() {
        screen = .results
    }

    func openLesson(_ lesson: Lesson) {
        session?.quit()
        session = nil
        sheet = nil
        globe.idleSpin = false
        screen = .lesson(lesson)
    }

    /// Back to the tabs from a game, its results or a lesson, on the tab it was started from.
    func goHome() {
        session?.quit()
        session = nil
        refreshSurvey()
        screen = .home
        stageHome()
    }

    // MARK: - Tabs

    func select(_ tab: HomeTab) {
        if screen != .home {
            session?.quit()
            session = nil
            refreshSurvey()
            screen = .home
        }
        self.tab = tab
        stageHome()
    }

    /// Opens a country in the Atlas tab, from a search, a tap on the globe or a neighbour chip.
    func showInAtlas(_ country: Country) {
        guard screen == .home else { return }
        tab = .atlas
        atlasSelection = country
        stageAtlas(country)
        if country.sovereign { progress.visit(country.iso3) }
        feedback.play(.tap)
    }

    /// Sets the globe up for the current tab. On every tab a tap on a country opens it in the Atlas.
    private func stageHome() {
        globe.clear()
        globe.interactive = true
        globe.onPick = { [weak self] pick in
            guard let self, let country = pick.nearbyTiny.first ?? pick.country else { return }
            self.showInAtlas(country)
        }
        switch tab {
        case .play:
            let region = progress.settings.region
            globe.idleSpin = region == "World"
            globe.overview(region: region)
        case .learn:
            globe.idleSpin = false
            if let lesson = nextLesson {
                let countries = lesson.iso3.compactMap { data.country($0) }
                for country in countries { globe.highlight(country, style: .focus, label: true) }
                globe.fly(toFit: countries, minRadius: 0.12, margin: 1.3)
            } else {
                globe.zoomOut()
            }
        case .atlas:
            globe.idleSpin = false
            if let atlasSelection { stageAtlas(atlasSelection) }
        case .progress:
            globe.idleSpin = true
            globe.zoomOut()
        }
    }

    private func stageAtlas(_ country: Country) {
        globe.idleSpin = false
        globe.clear()
        for neighbour in data.neighbours(of: country) {
            globe.highlight(neighbour, style: .neighbour)
        }
        globe.highlight(country, style: .focus, label: true)
        if let capital = country.capitalPoint {
            globe.dropPin(at: capital, style: .capital)
        }
        globe.fly(to: country)
    }

    // MARK: - Choosing a game

    /// The region and level every game on the Play tab uses, kept between launches.
    var region: String { progress.settings.region }
    var difficulty: Difficulty { progress.settings.difficulty }

    func setRegion(_ region: String) {
        guard region != progress.settings.region else { return }
        var settings = progress.settings
        settings.region = region
        progress.settings = settings
        if screen == .home, tab == .play {
            globe.idleSpin = region == "World"
            globe.overview(region: region)
        }
    }

    func setDifficulty(_ difficulty: Difficulty) {
        var settings = progress.settings
        settings.difficulty = difficulty
        progress.settings = settings
    }

    /// Starts a game with the region and level chosen on the Play tab.
    func startMode(_ mode: GameMode, preset: HigherLowerPreset = .mixed) {
        var config = GameConfig(mode: mode)
        config.region = mode.usesRegion ? region : "World"
        config.difficulty = mode.usesDifficulty ? difficulty : .hard
        config.preset = preset
        start(config)
    }

    /// A tile either starts its game or, when it holds several, opens the picker.
    func open(_ group: ModeGroup) {
        switch group {
        case .find: startMode(.find)
        case .nameIt: startMode(.nameIt)
        case .streak: startMode(.streak)
        case .flags, .capitals, .higherLower: sheet = .modes(group)
        }
    }

    /// The best saved score for a game at the current region and level.
    func best(for mode: GameMode, preset: HigherLowerPreset? = nil) -> Int? {
        var config = GameConfig(mode: mode)
        config.region = mode.usesRegion ? region : "World"
        config.difficulty = mode.usesDifficulty ? difficulty : .hard
        if let preset { config.preset = preset }
        return config.recordKey.flatMap { progress.state.records[$0] }
    }

    /// The best score across the games a tile holds.
    func best(for group: ModeGroup) -> Int? {
        if group == .higherLower {
            return HigherLowerPreset.allCases.compactMap { best(for: .higherLower, preset: $0) }.max()
        }
        return group.modes.compactMap { best(for: $0) }.max()
    }

    // MARK: - Home summaries

    var nextLesson: Lesson? {
        data.lessons.first { progress.state.course[$0.slug] == nil }
    }

    var lessonsDone: Int {
        data.lessons.count { progress.state.course[$0.slug] != nil }
    }

    var dueCount: Int {
        progress.due(in: data.sovereign).count
    }

    var todaysDaily: ProgressState.DailyEntry? {
        progress.state.daily[Daily.today()]
    }
}

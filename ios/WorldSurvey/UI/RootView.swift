import SwiftUI

/// The sheet: the relief globe behind everything, the masthead along the top margin and one
/// ruled panel at the bottom that changes with the screen.
struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var sheetHeight: CGFloat = 800

    var body: some View {
        @Bindable var model = model
        ZStack {
            Theme.paper.ignoresSafeArea()
            GlobeView(controller: model.globe)
                .ignoresSafeArea()
            VStack(spacing: 0) {
                Masthead()
                    .padding(.horizontal, 12)
                    .padding(.top, 4)
                    // Chrome stays compact at the largest text sizes; the panel below gets the room.
                    .dynamicTypeSize(...DynamicTypeSize.xLarge)
                // The gap between the masthead and the panel is the globe's own space.
                Color.clear
                    .allowsHitTesting(false)
                    .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { band in
                        model.globe.setFreeBand(top: band.minY, bottom: band.maxY)
                    }
                panel
                    .padding(.horizontal, 8)
                    .padding(.bottom, model.screen == .home ? 8 : 4)
                    .frame(maxWidth: 560)
                if model.screen == .home {
                    HomeTabBar()
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { sheetHeight = $0 }
        .environment(\.panelBodyMaxHeight, max(220, sheetHeight * 0.52))
        .animation(reduceMotion ? .easeInOut(duration: 0.2) : .snappy(duration: 0.38), value: model.screen)
        .animation(.easeInOut(duration: 0.2), value: model.tab)
        .sheet(item: $model.sheet) { sheet in
            switch sheet {
            case .modes(let group): ModePicker(group: group)
            case .settings: SettingsSheet()
            }
        }
        // A sheet over the game, or leaving the app, keeps the card up until Next.
        .onChange(of: model.sheet) {
            if model.sheet != nil { model.session?.holdAutoNext() }
        }
        .onChange(of: scenePhase) {
            if scenePhase != .active { model.session?.holdAutoNext() }
        }
        .onChange(of: reduceMotion, initial: true) {
            model.globe.reduceMotion = reduceMotion
        }
    }

    @ViewBuilder
    private var panel: some View {
        switch model.screen {
        case .home:
            Group {
                switch model.tab {
                case .play: PlayTab()
                case .learn: LearnTab()
                case .atlas: AtlasPanel()
                case .progress: ProgressTab()
                }
            }
            .id(model.tab)
            .transition(.opacity)
        case .play:
            if let session = model.session {
                PlayPanel(session: session)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        case .results:
            if let summary = model.session?.summary {
                ResultsPanel(summary: summary)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        case .lesson(let lesson):
            LessonPanel(lesson: lesson)
                .id(lesson.slug)
                .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
}

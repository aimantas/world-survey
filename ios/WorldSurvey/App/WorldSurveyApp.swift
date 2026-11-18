import SwiftUI

@main
struct WorldSurveyApp: App {
    @State private var model: AppModel?
    @State private var loadError: String?

    var body: some Scene {
        WindowGroup {
            Group {
                if let model {
                    RootView()
                        .environment(model)
                } else if let loadError {
                    ContentUnavailableView("The map data did not load", systemImage: "map", description: Text(loadError))
                } else {
                    Theme.paper.ignoresSafeArea()
                }
            }
            .preferredColorScheme(.light)
            .tint(Theme.overprint)
            .task {
                guard model == nil else { return }
                do {
                    let loaded = AppModel(data: try WorldData(), progress: ProgressStore())
                    model = loaded
                    #if DEBUG
                    DebugDriver.run(loaded)
                    #endif
                } catch {
                    loadError = error.localizedDescription
                }
            }
        }
    }
}

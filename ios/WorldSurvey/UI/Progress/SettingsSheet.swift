import SwiftUI

/// Sound, haptics, units, a reset, and where the data comes from.
struct SettingsSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var settings = ProgressState.Settings()
    @State private var confirmingReset = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Next country by itself", isOn: $settings.autoNext)
                } header: {
                    Text("Play")
                } footer: {
                    Text("Three seconds after each answer the next country comes up. Touch the card or the globe to stay on it. The last round always waits, and it is off while VoiceOver is running.")
                }
                Section("Feedback") {
                    Toggle("Sound", isOn: $settings.sound)
                    Toggle("Haptics", isOn: $settings.haptics)
                }
                Section {
                    Picker("Distances", selection: $settings.units) {
                        Text("Automatic").tag(DistanceUnit?.none)
                        Text("Kilometres").tag(DistanceUnit?.some(.km))
                        Text("Miles").tag(DistanceUnit?.some(.mi))
                    }
                } footer: {
                    Text("Everything is measured in kilometres; miles are a display choice.")
                }
                Section {
                    Button("Reset progress", role: .destructive) {
                        confirmingReset = true
                    }
                } footer: {
                    Text("Progress is stored on this device only. There is no account and nothing is sent anywhere.")
                }
                Section("Sources") {
                    ForEach(model.data.sources) { source in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(source.name)
                                .font(.subheadline.weight(.semibold))
                            Text(source.what)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                            Text("\(source.licence) · retrieved \(source.retrieved)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
                Section {
                    if let url = URL(string: "https://geography.aimantas.com/") {
                        Link("World Survey on the web", destination: url)
                    }
                    LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0")
                    LabeledContent("Data built", value: model.data.generated)
                } header: {
                    Text("About")
                } footer: {
                    Text("Statistics are the latest World Bank values per country, so years differ. Boundaries are Natural Earth 1:50m de facto lines. Flags: flag-icons (MIT).")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .confirmationDialog("Reset all progress?", isPresented: $confirmingReset, titleVisibility: .visible) {
                Button("Reset progress", role: .destructive) {
                    model.progress.reset()
                    model.refreshSurvey()
                }
            } message: {
                Text("Surveyed countries, records, medals and lessons are erased. This cannot be undone.")
            }
        }
        .onAppear {
            settings = model.progress.settings
        }
        .onChange(of: settings) {
            model.progress.settings = settings
            model.applySettings()
        }
    }
}

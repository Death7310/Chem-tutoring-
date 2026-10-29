import SwiftUI

struct SettingsView: View {
    @Environment(AppSettings.self) private var settings
    @State private var keyDraft = ""

    var body: some View {
        @Bindable var settings = settings

        Form {
            Section {
                SecureField("sk-ant-…", text: $keyDraft)
                    .textContentType(.password)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                Button("Save key") { settings.apiKey = keyDraft.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .disabled(keyDraft.isEmpty)
                if !settings.apiKey.isEmpty {
                    Label("Key saved in the Keychain", systemImage: "checkmark.seal")
                        .foregroundStyle(.green)
                }
            } header: {
                Text("Claude API key")
            } footer: {
                Text("Create a key at console.anthropic.com. API usage is billed separately from a Claude subscription, so set a monthly spend limit in the Console.")
            }

            Section {
                Picker("Default mode", selection: $settings.defaultMode) {
                    ForEach(TutorMode.allCases) { Text($0.label).tag($0) }
                }
                Picker("Thinking effort", selection: $settings.effort) {
                    Text("Low (fastest, cheapest)").tag("low")
                    Text("Medium (recommended)").tag("medium")
                    Text("High (most careful)").tag("high")
                }
            } header: {
                Text("Tutor")
            } footer: {
                Text("Coach gives hints before answers and checks your understanding from a different angle. Explain answers directly. Quiz me asks you the questions.")
            }
        }
        .navigationTitle("Settings")
    }
}

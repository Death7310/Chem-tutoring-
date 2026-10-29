import Foundation
import Observation

@Observable
final class AppSettings {
    private static let apiKeyAccount = "anthropic-api-key"

    var apiKey: String {
        didSet { KeychainStore.write(apiKey, for: AppSettings.apiKeyAccount) }
    }

    /// How hard the model thinks. Higher is more careful and costs more per answer.
    var effort: String {
        didSet { UserDefaults.standard.set(effort, forKey: "effort") }
    }

    var defaultMode: TutorMode {
        didSet { UserDefaults.standard.set(defaultMode.rawValue, forKey: "defaultMode") }
    }

    init() {
        apiKey = KeychainStore.read(AppSettings.apiKeyAccount) ?? ""
        effort = UserDefaults.standard.string(forKey: "effort") ?? "medium"
        defaultMode = TutorMode(rawValue: UserDefaults.standard.string(forKey: "defaultMode") ?? "") ?? .coach
    }
}

import SwiftUI

@main
struct ChemTutorApp: App {
    @State private var library: LibraryStore
    @State private var sessions: SessionStore
    @State private var settings: AppSettings
    @State private var tutor: TutorService

    init() {
        let library = LibraryStore()
        let sessions = SessionStore()
        let settings = AppSettings()
        _library = State(initialValue: library)
        _sessions = State(initialValue: sessions)
        _settings = State(initialValue: settings)
        _tutor = State(initialValue: TutorService(library: library, sessions: sessions, settings: settings))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(library)
                .environment(sessions)
                .environment(settings)
                .environment(tutor)
                .task {
                    library.load()
                    sessions.load()
                }
        }
    }
}

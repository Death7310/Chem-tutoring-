import SwiftUI

enum SidebarItem: Hashable {
    case session(UUID)
    case library
    case settings
}

struct RootView: View {
    @Environment(SessionStore.self) private var sessions
    @Environment(AppSettings.self) private var settings
    @State private var selection: SidebarItem? = .library

    var body: some View {
        NavigationSplitView {
            List(selection: $selection) {
                Section("Study") {
                    Button {
                        selection = .session(sessions.create(mode: settings.defaultMode))
                    } label: {
                        Label("New session", systemImage: "plus.bubble")
                    }
                    ForEach(sessions.sessions) { session in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(session.title).lineLimit(1)
                            Text(session.updatedAt, format: .relative(presentation: .named))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .tag(SidebarItem.session(session.id))
                        .contextMenu {
                            Button("Delete", systemImage: "trash", role: .destructive) {
                                delete(session.id)
                            }
                        }
                    }
                    .onDelete { offsets in
                        offsets.map { sessions.sessions[$0].id }.forEach(delete)
                    }
                }
                Section {
                    Label("Library", systemImage: "books.vertical").tag(SidebarItem.library)
                    Label("Settings", systemImage: "gear").tag(SidebarItem.settings)
                }
            }
            .navigationTitle("Chem Tutor")
        } detail: {
            NavigationStack {
                switch selection {
                case .session(let id):
                    TutorView(sessionID: id).id(id)
                case .settings:
                    SettingsView()
                case .library, .none:
                    LibraryView()
                }
            }
        }
    }

    private func delete(_ id: UUID) {
        if selection == .session(id) { selection = .library }
        sessions.delete(id)
    }
}

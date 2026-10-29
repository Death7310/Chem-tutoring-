import Foundation
import Observation

/// Study sessions (tutor conversations), each saved as a folder with session.json and its images.
@MainActor
@Observable
final class SessionStore {
    private(set) var sessions: [StudySession] = []

    private let root: URL = {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return documents.appendingPathComponent("Sessions", isDirectory: true)
    }()

    func load() {
        let fm = FileManager.default
        try? fm.createDirectory(at: root, withIntermediateDirectories: true)
        let folders = (try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        let decoder = JSONDecoder()
        sessions = folders
            .compactMap { try? Data(contentsOf: $0.appendingPathComponent("session.json")) }
            .compactMap { try? decoder.decode(StudySession.self, from: $0) }
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    func session(withID id: UUID) -> StudySession? {
        sessions.first { $0.id == id }
    }

    @discardableResult
    func create(mode: TutorMode) -> UUID {
        let now = Date()
        let session = StudySession(id: UUID(), title: "New session", createdAt: now, updatedAt: now, mode: mode)
        sessions.insert(session, at: 0)
        save(session)
        return session.id
    }

    func update(_ id: UUID, _ change: (inout StudySession) -> Void) {
        guard let i = sessions.firstIndex(where: { $0.id == id }) else { return }
        change(&sessions[i])
        sessions[i].updatedAt = Date()
        save(sessions[i])
    }

    func delete(_ id: UUID) {
        sessions.removeAll { $0.id == id }
        try? FileManager.default.removeItem(at: folder(for: id))
    }

    func saveImage(_ jpeg: Data, in sessionID: UUID) -> String? {
        let name = "img-\(UUID().uuidString).jpg"
        do {
            try FileManager.default.createDirectory(at: folder(for: sessionID), withIntermediateDirectories: true)
            try jpeg.write(to: imageURL(name, in: sessionID))
            return name
        } catch {
            return nil
        }
    }

    func imageURL(_ fileName: String, in sessionID: UUID) -> URL {
        folder(for: sessionID).appendingPathComponent(fileName)
    }

    private func folder(for id: UUID) -> URL {
        root.appendingPathComponent(id.uuidString, isDirectory: true)
    }

    private func save(_ session: StudySession) {
        let dir = folder(for: session.id)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? JSONEncoder().encode(session).write(to: dir.appendingPathComponent("session.json"), options: .atomic)
    }
}

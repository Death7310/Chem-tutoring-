import Foundation

enum TutorMode: String, Codable, CaseIterable, Identifiable {
    /// Hints first, then checks understanding from another angle.
    case coach
    /// Direct explanation, followed by a check-for-understanding question.
    case explain
    /// The tutor asks the questions.
    case quiz

    var id: String { rawValue }

    var label: String {
        switch self {
        case .coach: return "Coach"
        case .explain: return "Explain"
        case .quiz: return "Quiz me"
        }
    }
}

struct SourceRef: Codable, Hashable {
    let bookID: UUID
    let bookTitle: String
    let locator: Locator
}

struct ChatMessage: Codable, Identifiable {
    enum Role: String, Codable {
        case user
        case assistant
    }

    let id: UUID
    let role: Role
    let createdAt: Date
    /// What the app shows in the chat.
    var text: String
    /// JPEG files stored in the session folder.
    var imageFiles: [String] = []
    /// Book passages that were given to the tutor with this message.
    var sources: [SourceRef] = []
    /// Exact content blocks sent to / received from the API, replayed unchanged.
    var apiContent: [JSONValue] = []
    /// Errors and failed requests are shown but never sent back to the API.
    var excludedFromContext = false
}

struct StudySession: Codable, Identifiable {
    let id: UUID
    var title: String
    let createdAt: Date
    var updatedAt: Date
    var mode: TutorMode
    /// Books the tutor searches. Empty means the whole library.
    var focusBookIDs: [UUID] = []
    var messages: [ChatMessage] = []
}

import Foundation
import Observation
import UIKit

/// Turns a student message into a tutor reply: reads attached images, finds matching
/// book passages, calls Claude, and records both sides of the exchange.
@MainActor
@Observable
final class TutorService {
    private(set) var sendingSessionIDs: Set<UUID> = []

    private let library: LibraryStore
    private let sessions: SessionStore
    private let settings: AppSettings

    init(library: LibraryStore, sessions: SessionStore, settings: AppSettings) {
        self.library = library
        self.sessions = sessions
        self.settings = settings
    }

    func isSending(_ sessionID: UUID) -> Bool {
        sendingSessionIDs.contains(sessionID)
    }

    func send(_ text: String, images: [UIImage], in sessionID: UUID) async {
        guard let session = sessions.session(withID: sessionID), !isSending(sessionID) else { return }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty || !images.isEmpty else { return }

        sendingSessionIDs.insert(sessionID)
        defer { sendingSessionIDs.remove(sessionID) }

        // 1. Prepare images and read any printed text in them (for finding passages).
        let jpegs = images.compactMap { ImageUtils.preparedJPEG($0) }
        let imageText = await Task.detached(priority: .userInitiated) {
            jpegs.compactMap { UIImage(data: $0)?.cgImage }
                .map { TextRecognizer.recognizeText(in: $0) }
                .joined(separator: "\n")
        }.value

        // 2. Find book passages. Short replies like "I don't get it" also use the tutor's last message.
        var query = trimmed + "\n" + imageText
        if trimmed.count < 60, let lastReply = session.messages.last(where: { $0.role == .assistant && !$0.excludedFromContext }) {
            query += "\n" + lastReply.text
        }
        let passages = library.search(query, in: Set(session.focusBookIDs))
        let sources = passages.map { chunk in
            SourceRef(bookID: chunk.bookID,
                      bookTitle: library.book(withID: chunk.bookID)?.title ?? "Book",
                      locator: chunk.locator)
        }

        // 3. Record the student's message.
        let imageFiles = jpegs.compactMap { sessions.saveImage($0, in: sessionID) }
        var content: [JSONValue] = jpegs.map { jpeg -> JSONValue in
            ["type": "image",
             "source": ["type": "base64", "media_type": "image/jpeg", "data": .string(jpeg.base64EncodedString())]]
        }
        content.append(["type": "text", "text": .string(userTurnText(trimmed, hasImages: !jpegs.isEmpty,
                                                                       mode: session.mode, passages: passages, sources: sources))])

        let userMessage = ChatMessage(id: UUID(), role: .user, createdAt: Date(), text: trimmed,
                                      imageFiles: imageFiles, sources: [], apiContent: content)
        sessions.update(sessionID) { s in
            s.messages.append(userMessage)
            if s.title == "New session" {
                let base = trimmed.isEmpty ? "Image question" : trimmed
                s.title = String(base.prefix(48))
            }
        }

        // 4. Ask Claude with the full conversation so far.
        guard let updated = sessions.session(withID: sessionID) else { return }
        let history: [JSONValue] = updated.messages
            .filter { !$0.excludedFromContext }
            .map { message -> JSONValue in
                ["role": .string(message.role.rawValue), "content": .array(message.apiContent)]
            }

        let client = ClaudeClient(apiKey: settings.apiKey, effort: settings.effort)
        do {
            let response = try await client.send(system: TutorPrompt.system, messages: history)
            if response.stopReason == "refusal" || response.content.isEmpty {
                fail(userMessage.id, in: sessionID,
                     reason: "The tutor couldn't answer that one. Try rephrasing the question.")
                return
            }
            var reply = response.text
            if response.stopReason == "max_tokens" {
                reply += "\n\n_(Reply was cut off. Ask the tutor to continue.)_"
            }
            let assistant = ChatMessage(id: UUID(), role: .assistant, createdAt: Date(), text: reply,
                                        sources: sources, apiContent: response.content)
            sessions.update(sessionID) { $0.messages.append(assistant) }
        } catch {
            fail(userMessage.id, in: sessionID, reason: error.localizedDescription)
        }
    }

    /// Keeps the failed message visible but drops it from the API history, so the
    /// conversation stays a valid user/assistant alternation.
    private func fail(_ userMessageID: UUID, in sessionID: UUID, reason: String) {
        sessions.update(sessionID) { s in
            if let i = s.messages.firstIndex(where: { $0.id == userMessageID }) {
                s.messages[i].excludedFromContext = true
            }
            s.messages.append(ChatMessage(id: UUID(), role: .assistant, createdAt: Date(), text: reason,
                                          excludedFromContext: true))
        }
    }

    private func userTurnText(_ text: String, hasImages: Bool, mode: TutorMode,
                              passages: [BookChunk], sources: [SourceRef]) -> String {
        var out = "<book_passages>\n"
        if library.books.isEmpty {
            out += "The student has not imported any books yet.\n"
        } else if passages.isEmpty {
            out += "No passages in the student's books matched this message.\n"
        } else {
            for (i, (chunk, source)) in zip(passages, sources).enumerated() {
                out += "<passage id=\"\(i + 1)\" source=\"\(source.bookTitle)\" location=\"\(source.locator.display)\">\n"
                out += chunk.text + "\n</passage>\n"
            }
        }
        out += "</book_passages>\n\n<tutor_mode>\(mode.rawValue)</tutor_mode>\n\n<student_message>\n"
        if text.isEmpty {
            out += hasImages ? "(The student sent the attached image(s) without a message.)" : ""
        } else {
            out += text
        }
        out += "\n</student_message>"
        return out
    }
}

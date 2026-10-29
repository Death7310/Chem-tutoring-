import SwiftUI

struct TutorView: View {
    @Environment(SessionStore.self) private var sessions
    @Environment(LibraryStore.self) private var library
    @Environment(TutorService.self) private var tutor
    let sessionID: UUID

    @State private var openSource: SourceRef?

    var body: some View {
        if let session = sessions.session(withID: sessionID) {
            VStack(spacing: 0) {
                messageList(session)
                Divider()
                ComposerView(sessionID: sessionID, isSending: tutor.isSending(sessionID)) { text, images in
                    Task { await tutor.send(text, images: images, in: sessionID) }
                }
            }
            .navigationTitle(session.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbar(session) }
            .sheet(item: $openSource) { source in
                NavigationStack {
                    if let book = library.book(withID: source.bookID) {
                        BookReaderView(book: book, startAt: source.locator)
                            .toolbar {
                                Button("Done") { openSource = nil }
                            }
                    } else {
                        ContentUnavailableView("This book was removed", systemImage: "book.closed")
                    }
                }
            }
        } else {
            ContentUnavailableView("Session not found", systemImage: "bubble.left.and.exclamationmark.bubble.right")
        }
    }

    private func messageList(_ session: StudySession) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    if session.messages.isEmpty {
                        EmptySessionHint(mode: session.mode)
                    }
                    ForEach(session.messages) { message in
                        MessageBubble(message: message, sessionID: sessionID) { openSource = $0 }
                            .id(message.id)
                    }
                    if tutor.isSending(sessionID) {
                        HStack(spacing: 8) {
                            ProgressView()
                            Text("Thinking…").foregroundStyle(.secondary)
                        }
                        .id("thinking")
                    }
                }
                .padding()
                .frame(maxWidth: 860)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: session.messages.count) {
                if let last = session.messages.last?.id {
                    withAnimation { proxy.scrollTo(last, anchor: .bottom) }
                }
            }
            .onChange(of: tutor.isSending(sessionID)) {
                if tutor.isSending(sessionID) { withAnimation { proxy.scrollTo("thinking", anchor: .bottom) } }
            }
            .onAppear {
                if let last = session.messages.last?.id { proxy.scrollTo(last, anchor: .bottom) }
            }
        }
    }

    @ToolbarContentBuilder
    private func toolbar(_ session: StudySession) -> some ToolbarContent {
        ToolbarItem(placement: .principal) {
            Picker("Mode", selection: Binding(
                get: { session.mode },
                set: { mode in sessions.update(sessionID) { $0.mode = mode } }
            )) {
                ForEach(TutorMode.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .frame(width: 300)
        }
        ToolbarItem(placement: .primaryAction) {
            Menu {
                Button {
                    sessions.update(sessionID) { $0.focusBookIDs = [] }
                } label: {
                    CheckLabel(title: "All books", checked: session.focusBookIDs.isEmpty)
                }
                Divider()
                ForEach(library.books) { book in
                    Button {
                        sessions.update(sessionID) { s in
                            if let i = s.focusBookIDs.firstIndex(of: book.id) {
                                s.focusBookIDs.remove(at: i)
                            } else {
                                s.focusBookIDs.append(book.id)
                            }
                        }
                    } label: {
                        CheckLabel(title: book.title, checked: session.focusBookIDs.contains(book.id))
                    }
                }
            } label: {
                Label(session.focusBookIDs.isEmpty ? "All books" : "\(session.focusBookIDs.count) book(s)",
                      systemImage: "books.vertical")
            }
        }
    }
}

private struct CheckLabel: View {
    let title: String
    let checked: Bool

    var body: some View {
        if checked {
            Label(title, systemImage: "checkmark")
        } else {
            Text(title)
        }
    }
}

extension SourceRef: Identifiable {
    var id: String { "\(bookID.uuidString)-\(locator.display)" }
}

private struct EmptySessionHint: View {
    let mode: TutorMode

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.title2.bold())
            Text(detail).foregroundStyle(.secondary)
            Text("Attach a photo or scan of a problem, or tap the pencil to work it out by hand.")
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 24)
    }

    private var title: String {
        switch mode {
        case .coach: return "Bring a problem you're stuck on."
        case .explain: return "Ask about any concept."
        case .quiz: return "Name a topic to be quizzed on."
        }
    }

    private var detail: String {
        switch mode {
        case .coach:
            return "The tutor gives hints before answers and, once you get it, asks about the same idea from a different angle to make sure it sticks."
        case .explain:
            return "You'll get a direct explanation grounded in your book, then a quick question to check it landed."
        case .quiz:
            return "For example: “stoichiometry, chapter 4” or “gas laws.” Questions get harder as you go."
        }
    }
}

import SwiftUI

struct MessageBubble: View {
    @Environment(SessionStore.self) private var sessions
    let message: ChatMessage
    let sessionID: UUID
    let openSource: (SourceRef) -> Void

    private var isUser: Bool { message.role == .user }

    var body: some View {
        HStack {
            if isUser { Spacer(minLength: 80) }
            VStack(alignment: isUser ? .trailing : .leading, spacing: 8) {
                if !message.imageFiles.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(message.imageFiles, id: \.self) { file in
                                if let image = UIImage(contentsOfFile: sessions.imageURL(file, in: sessionID).path) {
                                    Image(uiImage: image)
                                        .resizable()
                                        .scaledToFit()
                                        .frame(maxHeight: 220)
                                        .clipShape(RoundedRectangle(cornerRadius: 10))
                                }
                            }
                        }
                    }
                }
                if !message.text.isEmpty {
                    Text(Self.markdown(message.text))
                        .textSelection(.enabled)
                        .padding(12)
                        .background(background, in: RoundedRectangle(cornerRadius: 14))
                        .foregroundStyle(message.excludedFromContext && !isUser ? Color.red : Color.primary)
                }
                if !message.sources.isEmpty {
                    sourceChips
                }
            }
            if !isUser { Spacer(minLength: 80) }
        }
    }

    private var background: Color {
        isUser ? Color.accentColor.opacity(0.15) : Color(.secondarySystemBackground)
    }

    private var sourceChips: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Passages from your books")
                .font(.caption)
                .foregroundStyle(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(uniqueSources, id: \.self) { source in
                        Button {
                            openSource(source)
                        } label: {
                            Label("\(source.bookTitle) · \(source.locator.display)", systemImage: "book")
                                .font(.caption)
                                .lineLimit(1)
                        }
                        .buttonStyle(.bordered)
                    }
                }
            }
        }
    }

    private var uniqueSources: [SourceRef] {
        var seen = Set<SourceRef>()
        return message.sources.filter { seen.insert($0).inserted }
    }

    static func markdown(_ text: String) -> AttributedString {
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        return (try? AttributedString(markdown: text, options: options)) ?? AttributedString(text)
    }
}

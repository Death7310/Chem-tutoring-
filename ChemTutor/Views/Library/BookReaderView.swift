import PDFKit
import SwiftUI

/// Reads a book: PDFs in Apple's PDF viewer, EPUB and text files as reflowable chapters.
struct BookReaderView: View {
    @Environment(LibraryStore.self) private var library
    let book: Book
    var startAt: Locator?

    var body: some View {
        Group {
            switch book.format {
            case .pdf:
                PDFReader(url: library.fileURL(for: book), pageIndex: startAt?.pageIndex)
                    .ignoresSafeArea(edges: .bottom)
            case .epub, .text:
                ChapterReader(chapters: library.chapters(for: book),
                              chapterIndex: startAt?.chapterIndex ?? 0)
            }
        }
        .navigationTitle(book.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct PDFReader: UIViewRepresentable {
    let url: URL
    let pageIndex: Int?

    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.document = PDFDocument(url: url)
        if let pageIndex, let page = view.document?.page(at: pageIndex) {
            // Wait for layout so the jump lands on the right page.
            DispatchQueue.main.async { view.go(to: page) }
        }
        return view
    }

    func updateUIView(_ view: PDFView, context: Context) {}
}

private struct ChapterReader: View {
    let chapters: [Chapter]
    @State var chapterIndex: Int

    var body: some View {
        if chapters.isEmpty {
            ContentUnavailableView("Nothing to show", systemImage: "book.closed")
        } else {
            let index = min(max(chapterIndex, 0), chapters.count - 1)
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(chapters[index].title)
                            .font(.title.bold())
                            .id("top")
                        Text(chapters[index].text)
                            .font(.system(.body, design: .serif))
                            .lineSpacing(5)
                            .textSelection(.enabled)
                        HStack {
                            if index > 0 {
                                Button("Previous", systemImage: "chevron.left") { chapterIndex = index - 1 }
                            }
                            Spacer()
                            if index < chapters.count - 1 {
                                Button("Next", systemImage: "chevron.right") { chapterIndex = index + 1 }
                            }
                        }
                        .buttonStyle(.bordered)
                        .padding(.top)
                    }
                    .frame(maxWidth: 720, alignment: .leading)
                    .padding(32)
                    .frame(maxWidth: .infinity)
                }
                .onChange(of: chapterIndex) { proxy.scrollTo("top", anchor: .top) }
            }
            .toolbar {
                Menu {
                    ForEach(Array(chapters.enumerated()), id: \.offset) { i, chapter in
                        Button(chapter.title) { chapterIndex = i }
                    }
                } label: {
                    Label("Contents", systemImage: "list.bullet")
                }
            }
        }
    }
}

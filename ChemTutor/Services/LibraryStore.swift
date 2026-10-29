import Foundation
import Observation

/// The student's books: imported files, their extracted text, and the search index over them.
@MainActor
@Observable
final class LibraryStore {
    struct ImportStatus {
        var fileName: String
        var progress: Double
    }

    private(set) var books: [Book] = []
    private(set) var importStatus: ImportStatus?
    var lastError: String?

    private var chunks: [BookChunk] = []
    private var index: BM25Index?

    private let root: URL = {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return documents.appendingPathComponent("Library", isDirectory: true)
    }()

    // MARK: - Loading

    func load() {
        let fm = FileManager.default
        try? fm.createDirectory(at: root, withIntermediateDirectories: true)
        let folders = (try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []

        var loadedBooks: [Book] = []
        var loadedChunks: [BookChunk] = []
        let decoder = JSONDecoder()
        for folder in folders {
            guard let bookData = try? Data(contentsOf: folder.appendingPathComponent("book.json")),
                  let book = try? decoder.decode(Book.self, from: bookData),
                  let chunkData = try? Data(contentsOf: folder.appendingPathComponent("chunks.json")),
                  let bookChunks = try? decoder.decode([BookChunk].self, from: chunkData) else { continue }
            loadedBooks.append(book)
            loadedChunks.append(contentsOf: bookChunks)
        }
        books = loadedBooks.sorted { $0.importedAt > $1.importedAt }
        chunks = loadedChunks
        rebuildIndex()
    }

    private func rebuildIndex() {
        let texts = chunks.map(\.text)
        Task.detached(priority: .userInitiated) {
            let newIndex = BM25Index(documents: texts)
            await MainActor.run { self.index = newIndex }
        }
    }

    // MARK: - Importing

    func importFiles(_ urls: [URL]) async {
        for url in urls {
            await importFile(url)
        }
    }

    func importFile(_ url: URL) async {
        let ext = url.pathExtension
        guard let format = BookFormat(fileExtension: ext) else {
            lastError = ImportError.unsupportedFormat(ext).localizedDescription
            return
        }

        let id = UUID()
        let folder = root.appendingPathComponent(id.uuidString, isDirectory: true)
        let fileName = "original." + ext.lowercased()
        let destination = folder.appendingPathComponent(fileName)

        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }

        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try FileManager.default.copyItem(at: url, to: destination)
        } catch {
            lastError = "Couldn't copy \(url.lastPathComponent): \(error.localizedDescription)"
            return
        }

        let displayName = url.deletingPathExtension().lastPathComponent
        importStatus = ImportStatus(fileName: url.lastPathComponent, progress: 0)

        do {
            let result = try await Task.detached(priority: .userInitiated) { [weak self] in
                try LibraryStore.extract(format: format, from: destination, bookID: id) { progress in
                    Task { @MainActor in self?.importStatus?.progress = progress }
                }
            }.value

            var title = result.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if title.isEmpty || title.lowercased() == "untitled" { title = displayName }

            let book = Book(id: id, title: title, format: format, fileName: fileName, importedAt: Date(),
                            sectionCount: result.sectionCount, chunkCount: result.chunks.count)

            let encoder = JSONEncoder()
            try encoder.encode(book).write(to: folder.appendingPathComponent("book.json"))
            try encoder.encode(result.chunks).write(to: folder.appendingPathComponent("chunks.json"))
            if let chapters = result.chapters {
                try encoder.encode(chapters).write(to: folder.appendingPathComponent("chapters.json"))
            }

            books.insert(book, at: 0)
            chunks.append(contentsOf: result.chunks)
            rebuildIndex()
        } catch {
            try? FileManager.default.removeItem(at: folder)
            lastError = "Couldn't import \(url.lastPathComponent): \(error.localizedDescription)"
        }
        importStatus = nil
    }

    private struct Extraction {
        let title: String?
        let sectionCount: Int
        let chunks: [BookChunk]
        let chapters: [Chapter]?
    }

    nonisolated private static func extract(format: BookFormat, from url: URL, bookID: UUID,
                                            progress: @escaping (Double) -> Void) throws -> Extraction {
        switch format {
        case .pdf:
            let output = try PDFImporter.importPDF(at: url, progress: progress)
            let chunks = output.chunks.map { BookChunk(bookID: bookID, locator: $0.0, text: $0.1) }
            return Extraction(title: output.title, sectionCount: output.pageCount, chunks: chunks, chapters: nil)
        case .epub:
            let output = try EPUBImporter.importEPUB(at: url)
            return Extraction(title: output.title, sectionCount: output.chapters.count,
                              chunks: chunkChapters(output.chapters, bookID: bookID), chapters: output.chapters)
        case .text:
            let chapters = try PlainTextImporter.importText(at: url)
            return Extraction(title: nil, sectionCount: chapters.count,
                              chunks: chunkChapters(chapters, bookID: bookID), chapters: chapters)
        }
    }

    nonisolated private static func chunkChapters(_ chapters: [Chapter], bookID: UUID) -> [BookChunk] {
        chapters.enumerated().flatMap { index, chapter in
            TextChunker.chunk(chapter.text).map { text in
                BookChunk(bookID: bookID,
                          locator: Locator(chapterIndex: index, chapterTitle: chapter.title),
                          text: text)
            }
        }
    }

    // MARK: - Managing

    func delete(_ book: Book) {
        try? FileManager.default.removeItem(at: folder(for: book))
        books.removeAll { $0.id == book.id }
        chunks.removeAll { $0.bookID == book.id }
        rebuildIndex()
    }

    func rename(_ book: Book, to title: String) {
        guard let i = books.firstIndex(where: { $0.id == book.id }) else { return }
        books[i].title = title
        try? JSONEncoder().encode(books[i]).write(to: folder(for: book).appendingPathComponent("book.json"))
    }

    func book(withID id: UUID) -> Book? {
        books.first { $0.id == id }
    }

    func folder(for book: Book) -> URL {
        root.appendingPathComponent(book.id.uuidString, isDirectory: true)
    }

    func fileURL(for book: Book) -> URL {
        folder(for: book).appendingPathComponent(book.fileName)
    }

    func chapters(for book: Book) -> [Chapter] {
        let url = folder(for: book).appendingPathComponent("chapters.json")
        guard let data = try? Data(contentsOf: url) else { return [] }
        return (try? JSONDecoder().decode([Chapter].self, from: data)) ?? []
    }

    // MARK: - Searching

    /// Best-matching passages for a query, optionally limited to some books.
    func search(_ query: String, in bookIDs: Set<UUID>, limit: Int = 6) -> [BookChunk] {
        guard let index, index.documentCount == chunks.count else { return [] }
        let all = chunks
        let filter: ((Int) -> Bool)? = bookIDs.isEmpty ? nil : { bookIDs.contains(all[$0].bookID) }
        return index.search(query, limit: limit, where: filter).map { all[$0.documentIndex] }
    }
}

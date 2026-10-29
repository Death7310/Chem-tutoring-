import Foundation

enum BookFormat: String, Codable {
    case pdf
    case epub
    case text

    init?(fileExtension: String) {
        switch fileExtension.lowercased() {
        case "pdf": self = .pdf
        case "epub": self = .epub
        case "txt", "md", "markdown": self = .text
        default: return nil
        }
    }
}

struct Book: Codable, Identifiable, Hashable {
    let id: UUID
    var title: String
    let format: BookFormat
    /// Name of the original file inside the book's folder.
    let fileName: String
    let importedAt: Date
    /// Pages for PDFs, chapters/sections for EPUB and text files.
    let sectionCount: Int
    let chunkCount: Int
}

/// Where a passage lives in its book, so it can be cited and opened.
struct Locator: Codable, Hashable {
    var pageIndex: Int?
    /// Printed page number from the PDF, when it differs from the index.
    var pageLabel: String?
    var chapterIndex: Int?
    var chapterTitle: String?

    var display: String {
        if let pageLabel, !pageLabel.isEmpty { return "p. \(pageLabel)" }
        if let pageIndex { return "p. \(pageIndex + 1)" }
        if let chapterTitle, !chapterTitle.isEmpty { return chapterTitle }
        if let chapterIndex { return "Section \(chapterIndex + 1)" }
        return "Unknown location"
    }
}

/// A searchable slice of a book's text.
struct BookChunk: Codable, Hashable {
    let bookID: UUID
    let locator: Locator
    let text: String
}

/// Reflowable text used by the reader for EPUB and plain-text books.
struct Chapter: Codable, Hashable {
    let title: String
    let text: String
}

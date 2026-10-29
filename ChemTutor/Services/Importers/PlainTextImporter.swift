import Foundation

/// Imports .txt and Markdown files, splitting Markdown into chapters at "# " / "## " headings.
enum PlainTextImporter {
    static func importText(at url: URL) throws -> [Chapter] {
        let data = try Data(contentsOf: url)
        guard let text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1),
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw ImportError.noText("This file is empty.")
        }
        let fallbackTitle = url.deletingPathExtension().lastPathComponent
        return splitIntoChapters(text, fallbackTitle: fallbackTitle)
    }

    static func splitIntoChapters(_ text: String, fallbackTitle: String) -> [Chapter] {
        var chapters: [Chapter] = []
        var title = fallbackTitle
        var lines: [String] = []

        func flush() {
            let body = lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            if !body.isEmpty { chapters.append(Chapter(title: title, text: body)) }
            lines = []
        }

        for line in text.components(separatedBy: .newlines) {
            if line.hasPrefix("# ") || line.hasPrefix("## ") {
                flush()
                title = line.drop(while: { $0 == "#" }).trimmingCharacters(in: .whitespaces)
            } else {
                lines.append(line)
            }
        }
        flush()
        return chapters
    }
}

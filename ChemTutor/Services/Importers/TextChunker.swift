import Foundation

/// Splits text into overlapping, paragraph-aligned chunks small enough to retrieve precisely.
enum TextChunker {
    static func chunk(_ text: String, targetLength: Int = 1200, overlap: Int = 200) -> [String] {
        let paragraphs = text
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .flatMap { splitLong($0, targetLength: targetLength) }

        var chunks: [String] = []
        var current = ""
        for paragraph in paragraphs {
            if current.isEmpty {
                current = paragraph
            } else if current.count + 1 + paragraph.count <= targetLength {
                current += "\n" + paragraph
            } else {
                chunks.append(current)
                let tail = overlapTail(of: current, length: overlap)
                current = tail.isEmpty ? paragraph : tail + "\n" + paragraph
            }
        }
        if !current.isEmpty { chunks.append(current) }
        return chunks
    }

    /// Breaks a paragraph longer than the target into word-aligned pieces.
    private static func splitLong(_ paragraph: String, targetLength: Int) -> [String] {
        guard paragraph.count > targetLength else { return [paragraph] }
        var pieces: [String] = []
        var current = ""
        for word in paragraph.split(separator: " ") {
            if !current.isEmpty && current.count + 1 + word.count > targetLength {
                pieces.append(current)
                current = String(word)
            } else {
                current += current.isEmpty ? String(word) : " " + word
            }
        }
        if !current.isEmpty { pieces.append(current) }
        return pieces
    }

    /// The last `length` characters of a chunk, starting at a word boundary.
    private static func overlapTail(of text: String, length: Int) -> String {
        guard length > 0, text.count > length else { return "" }
        let start = text.index(text.endIndex, offsetBy: -length)
        let tail = text[start...]
        guard let space = tail.firstIndex(where: { $0 == " " || $0 == "\n" }) else { return "" }
        return tail[space...].trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

import Foundation

/// Keyword search over book chunks using Okapi BM25 (Robertson & Zaragoza, 2009).
/// Runs fully on-device, so it needs no extra API key or embedding service.
final class BM25Index {
    struct Hit {
        let documentIndex: Int
        let score: Double
    }

    private let k1 = 1.5
    private let b = 0.75
    private let documentLengths: [Int]
    private let averageLength: Double
    /// term → [(document index, term frequency)]
    private let postings: [String: [(Int, Int)]]

    var documentCount: Int { documentLengths.count }

    init(documents: [String]) {
        var lengths: [Int] = []
        var postings: [String: [(Int, Int)]] = [:]
        lengths.reserveCapacity(documents.count)

        for (index, document) in documents.enumerated() {
            let tokens = BM25Index.tokenize(document)
            lengths.append(tokens.count)
            var counts: [String: Int] = [:]
            for token in tokens { counts[token, default: 0] += 1 }
            for (term, count) in counts {
                postings[term, default: []].append((index, count))
            }
        }

        self.documentLengths = lengths
        self.averageLength = lengths.isEmpty ? 0 : Double(lengths.reduce(0, +)) / Double(lengths.count)
        self.postings = postings
    }

    func search(_ query: String, limit: Int, where include: ((Int) -> Bool)? = nil) -> [Hit] {
        let terms = Set(BM25Index.tokenize(query))
        guard !terms.isEmpty, averageLength > 0 else { return [] }

        let n = Double(documentLengths.count)
        var scores: [Int: Double] = [:]
        for term in terms {
            guard let list = postings[term] else { continue }
            let df = Double(list.count)
            let idf = log(1 + (n - df + 0.5) / (df + 0.5))
            for (doc, tf) in list {
                if let include, !include(doc) { continue }
                let freq = Double(tf)
                let norm = 1 - b + b * Double(documentLengths[doc]) / averageLength
                scores[doc, default: 0] += idf * (freq * (k1 + 1)) / (freq + k1 * norm)
            }
        }

        return scores
            .map { Hit(documentIndex: $0.key, score: $0.value) }
            .sorted { $0.score > $1.score }
            .prefix(limit)
            .map { $0 }
    }

    // MARK: - Tokenizing

    private static let stopwords: Set<String> = [
        "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "do", "does", "for", "from",
        "had", "has", "have", "how", "i", "if", "in", "into", "is", "it", "its", "me", "my", "of",
        "on", "or", "so", "that", "the", "their", "then", "there", "these", "this", "to", "was",
        "we", "what", "when", "where", "which", "who", "why", "will", "with", "would", "you", "your",
    ]

    private static let digitMap: [Character: Character] = Dictionary(
        uniqueKeysWithValues: zip("₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹", "01234567890123456789"))

    static func tokenize(_ text: String) -> [String] {
        let normalized = String(text.lowercased().map { digitMap[$0] ?? $0 })
        return normalized
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty && !stopwords.contains($0) }
            .map(stem)
    }

    /// Very light plural stripping so "reactions" matches "reaction".
    private static func stem(_ token: String) -> String {
        if token.count > 4 && token.hasSuffix("ies") { return String(token.dropLast(3)) + "y" }
        if token.count > 3 && token.hasSuffix("s") && !token.hasSuffix("ss") && !token.hasSuffix("us") && !token.hasSuffix("is") {
            return String(token.dropLast())
        }
        return token
    }
}

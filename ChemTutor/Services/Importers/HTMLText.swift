import Foundation

/// Converts EPUB XHTML into readable plain text, keeping chemical subscripts (H<sub>2</sub>O → H₂O).
enum HTMLText {
    struct Result {
        let heading: String?
        let text: String
    }

    static func plainText(fromHTML html: String) -> Result {
        var s = html
        s = replace(#"<head\b[^>]*>.*?</head>"#, in: s, with: "")
        s = replace(#"<(script|style)\b[^>]*>.*?</\1>"#, in: s, with: "")

        s = transformMatches(#"<sub\b[^>]*>(.*?)</sub>"#, in: s) { inner in
            mapCharacters(stripTags(inner), using: subscripts) ?? "_" + stripTags(inner)
        }
        s = transformMatches(#"<sup\b[^>]*>(.*?)</sup>"#, in: s) { inner in
            mapCharacters(stripTags(inner), using: superscripts) ?? "^" + stripTags(inner)
        }

        var heading: String?
        if let match = firstMatch(#"<h[1-3]\b[^>]*>(.*?)</h[1-3]>"#, in: s) {
            let cleaned = collapseWhitespace(decodeEntities(stripTags(match)))
            if !cleaned.isEmpty { heading = cleaned }
        }

        s = replace(#"<li\b[^>]*>"#, in: s, with: "\n• ")
        s = replace(#"</?(p|div|br|h[1-6]|ul|ol|li|tr|table|section|article|blockquote|figure|figcaption|dt|dd|pre)\b[^>]*>"#, in: s, with: "\n")
        s = stripTags(s)
        s = decodeEntities(s)

        let lines = s.components(separatedBy: .newlines).map(collapseWhitespace)
        var text = lines.joined(separator: "\n")
        text = replace(#"\n{3,}"#, in: text, with: "\n\n")
        return Result(heading: heading, text: text.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    // MARK: - Helpers

    private static let subscripts: [Character: Character] = Dictionary(
        uniqueKeysWithValues: zip("0123456789+-=()", "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎"))
    private static let superscripts: [Character: Character] = Dictionary(
        uniqueKeysWithValues: zip("0123456789+-=()n", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ"))

    /// Maps every character, or returns nil if any character has no mapping.
    private static func mapCharacters(_ text: String, using table: [Character: Character]) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        var out = ""
        for ch in trimmed {
            let normalized: Character = (ch == "−" || ch == "–") ? "-" : ch
            guard let mapped = table[normalized] else { return nil }
            out.append(mapped)
        }
        return out
    }

    static func stripTags(_ text: String) -> String {
        replace(#"<[^>]+>"#, in: text, with: "")
    }

    private static func collapseWhitespace(_ text: String) -> String {
        replace(#"[ \t\u{00A0}]+"#, in: text, with: " ").trimmingCharacters(in: .whitespaces)
    }

    static func decodeEntities(_ text: String) -> String {
        var s = text
        let named = ["&nbsp;": " ", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&apos;": "'",
                     "&#39;": "'", "&ndash;": "–", "&mdash;": "—", "&rarr;": "→", "&larr;": "←",
                     "&harr;": "↔", "&rlarr;": "⇌", "&deg;": "°", "&times;": "×", "&minus;": "−",
                     "&plusmn;": "±", "&Delta;": "Δ", "&delta;": "δ", "&middot;": "·", "&hellip;": "…"]
        for (entity, value) in named {
            s = s.replacingOccurrences(of: entity, with: value)
        }
        s = transformMatches(#"&#(x?[0-9a-fA-F]+);"#, in: s) { code in
            let value: UInt32?
            if code.hasPrefix("x") || code.hasPrefix("X") {
                value = UInt32(code.dropFirst(), radix: 16)
            } else {
                value = UInt32(code)
            }
            guard let value, let scalar = Unicode.Scalar(value) else { return "" }
            return String(Character(scalar))
        }
        // &amp; last so "&amp;lt;" decodes to "&lt;", not "<".
        return s.replacingOccurrences(of: "&amp;", with: "&")
    }

    private static func regex(_ pattern: String) -> NSRegularExpression {
        // Patterns are constants; a failure here is a programming error.
        try! NSRegularExpression(pattern: pattern, options: [.caseInsensitive, .dotMatchesLineSeparators])
    }

    private static func replace(_ pattern: String, in text: String, with template: String) -> String {
        let range = NSRange(text.startIndex..., in: text)
        return regex(pattern).stringByReplacingMatches(in: text, range: range, withTemplate: template)
    }

    private static func firstMatch(_ pattern: String, in text: String) -> String? {
        let range = NSRange(text.startIndex..., in: text)
        guard let match = regex(pattern).firstMatch(in: text, range: range),
              let group = Range(match.range(at: 1), in: text) else { return nil }
        return String(text[group])
    }

    /// Replaces each match with `transform(first capture group)`.
    private static func transformMatches(_ pattern: String, in text: String, transform: (String) -> String) -> String {
        let range = NSRange(text.startIndex..., in: text)
        let matches = regex(pattern).matches(in: text, range: range)
        var result = text
        for match in matches.reversed() {
            guard let whole = Range(match.range, in: result),
                  let group = Range(match.range(at: 1), in: result) else { continue }
            let replacement = transform(String(result[group]))
            result.replaceSubrange(whole, with: replacement)
        }
        return result
    }
}

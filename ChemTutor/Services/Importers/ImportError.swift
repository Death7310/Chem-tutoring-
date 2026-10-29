import Foundation

enum ImportError: LocalizedError {
    case unsupportedFormat(String)
    case unreadable(String)
    case noText(String)

    var errorDescription: String? {
        switch self {
        case .unsupportedFormat(let ext):
            return "“.\(ext)” files aren't supported yet. Use PDF, EPUB, TXT or Markdown."
        case .unreadable(let message), .noText(let message):
            return message
        }
    }
}

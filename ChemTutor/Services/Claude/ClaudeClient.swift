import Foundation

/// Minimal client for the Claude Messages API (there is no official Swift SDK, so this uses raw HTTP).
struct ClaudeClient {
    struct Response {
        /// Full content blocks, including thinking blocks; stored and replayed unchanged.
        let content: [JSONValue]
        let stopReason: String?

        var text: String {
            content
                .filter { $0["type"]?.stringValue == "text" }
                .compactMap { $0["text"]?.stringValue }
                .joined()
        }
    }

    enum ClientError: LocalizedError {
        case missingAPIKey
        case http(status: Int, message: String)
        case invalidResponse

        var errorDescription: String? {
            switch self {
            case .missingAPIKey:
                return "Add your Claude API key in Settings first."
            case .http(401, _):
                return "The API key was rejected. Check it in Settings."
            case .http(429, _):
                return "Rate limited. Wait a moment and try again."
            case .http(529, _):
                return "Claude is overloaded right now. Try again in a minute."
            case .http(let status, let message):
                return "Claude API error \(status): \(message)"
            case .invalidResponse:
                return "Claude sent a response the app couldn't read."
            }
        }
    }

    static let model = "claude-opus-5-5"
    private static let endpoint = URL(string: "https://api.anthropic.com/v1/messages")!

    let apiKey: String
    /// "low", "medium", "high", "xhigh" or "max".
    let effort: String

    private static let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 600
        config.timeoutIntervalForResource = 900
        return URLSession(configuration: config)
    }()

    func send(system: String, messages: [JSONValue]) async throws -> Response {
        guard !apiKey.isEmpty else { throw ClientError.missingAPIKey }

        let body: JSONValue = [
            "model": .string(ClaudeClient.model),
            "max_tokens": 16000,
            "thinking": ["type": "adaptive"],
            "output_config": ["effort": .string(effort)],
            // If a safety classifier declines, retry server-side on Anthropic's recommended model.
            "fallbacks": "default",
            // Cache the system prompt and conversation so follow-up turns are cheaper.
            "cache_control": ["type": "ephemeral"],
            "system": .string(system),
            "messages": .array(messages),
        ]

        var request = URLRequest(url: ClaudeClient.endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2026-10-21", forHTTPHeaderField: "anthropic-version")
        request.setValue("server-side-fallback-2026-07-01", forHTTPHeaderField: "anthropic-beta")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await ClaudeClient.session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ClientError.invalidResponse }
        let json = try? JSONDecoder().decode(JSONValue.self, from: data)

        guard http.statusCode == 200 else {
            let message = json?["error"]?["message"]?.stringValue
                ?? String(data: data, encoding: .utf8)
                ?? "Unknown error"
            throw ClientError.http(status: http.statusCode, message: message)
        }
        guard let json, let content = json["content"]?.arrayValue else {
            throw ClientError.invalidResponse
        }
        return Response(content: content, stopReason: json["stop_reason"]?.stringValue)
    }
}

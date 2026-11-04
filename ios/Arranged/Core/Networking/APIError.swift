import Foundation

enum APIError: LocalizedError, Equatable {
    case invalidURL
    case network(String)
    case unauthorized
    case server(status: Int, code: String, message: String)
    case decoding(String)
    case paymentRequired(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid request."
        case .network(let message): return message
        case .unauthorized: return "Please sign in again."
        case .server(_, _, let message): return message
        case .decoding(let message): return "Unexpected response: \(message)"
        case .paymentRequired(let message): return message
        }
    }

    var code: String? {
        if case .server(_, let code, _) = self { return code }
        return nil
    }
}

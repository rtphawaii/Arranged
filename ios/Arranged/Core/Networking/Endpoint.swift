import Foundation

enum HTTPMethod: String {
    case get = "GET", post = "POST", patch = "PATCH", put = "PUT", delete = "DELETE"
}

/// A single API call. Paths are relative to `AppConfig.apiBaseURL` (which already includes `/v1`).
struct Endpoint {
    var method: HTTPMethod
    var path: String
    var query: [URLQueryItem] = []
    var body: Encodable? = nil
    var requiresAuth: Bool = true

    static func get(_ path: String, query: [URLQueryItem] = [], auth: Bool = true) -> Endpoint {
        Endpoint(method: .get, path: path, query: query, requiresAuth: auth)
    }
    static func post(_ path: String, body: Encodable? = nil, auth: Bool = true) -> Endpoint {
        Endpoint(method: .post, path: path, body: body, requiresAuth: auth)
    }
    static func patch(_ path: String, body: Encodable) -> Endpoint {
        Endpoint(method: .patch, path: path, body: body)
    }
    static func put(_ path: String, body: Encodable) -> Endpoint {
        Endpoint(method: .put, path: path, body: body)
    }
    static func delete(_ path: String, body: Encodable? = nil) -> Endpoint {
        Endpoint(method: .delete, path: path, body: body)
    }
}

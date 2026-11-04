import Foundation

/// JSON client for the Arranged API with bearer auth and transparent refresh-token rotation.
actor APIClient {
    private let baseURL: URL
    private let session: URLSession
    private let tokenStore: TokenStoring
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private var refreshTask: Task<AuthTokens, Error>?

    /// Called when the refresh token is rejected; the session layer signs the user out.
    var onSessionExpired: (@Sendable () async -> Void)?

    init(baseURL: URL = AppConfig.apiBaseURL, session: URLSession = .shared, tokenStore: TokenStoring) {
        self.baseURL = baseURL
        self.session = session
        self.tokenStore = tokenStore
        self.encoder = JSONEncoder()
        self.decoder = JSONDecoder.api
    }

    func setSessionExpiredHandler(_ handler: @escaping @Sendable () async -> Void) {
        onSessionExpired = handler
    }

    var isAuthenticated: Bool { tokenStore.tokens != nil }

    func setTokens(_ tokens: AuthTokens?) {
        tokenStore.tokens = tokens
    }

    func currentTokens() -> AuthTokens? { tokenStore.tokens }

    // MARK: - Requests

    func request<T: Decodable>(_ endpoint: Endpoint, as type: T.Type = T.self) async throws -> T {
        let data = try await send(endpoint, allowRefresh: true)
        if T.self == EmptyBody.self, data.isEmpty { return EmptyBody() as! T }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(String(describing: error))
        }
    }

    func request(_ endpoint: Endpoint) async throws {
        _ = try await send(endpoint, allowRefresh: true)
    }

    private func send(_ endpoint: Endpoint, allowRefresh: Bool) async throws -> Data {
        let request = try buildRequest(endpoint)
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.network(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else { throw APIError.network("No response") }

        switch http.statusCode {
        case 200..<300:
            return data
        case 401 where endpoint.requiresAuth && allowRefresh:
            _ = try await refreshTokens()
            return try await send(endpoint, allowRefresh: false)
        case 401:
            throw APIError.unauthorized
        default:
            let body = try? decoder.decode(APIErrorBody.self, from: data)
            if http.statusCode == 402 {
                throw APIError.paymentRequired(body?.error.message ?? "Payment required")
            }
            throw APIError.server(
                status: http.statusCode,
                code: body?.error.code ?? "http_\(http.statusCode)",
                message: body?.error.message ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
            )
        }
    }

    private func buildRequest(_ endpoint: Endpoint) throws -> URLRequest {
        var components = URLComponents(url: baseURL.appendingPathComponent(endpoint.path), resolvingAgainstBaseURL: false)
        if !endpoint.query.isEmpty { components?.queryItems = endpoint.query }
        guard let url = components?.url else { throw APIError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Arranged-iOS/\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "dev")", forHTTPHeaderField: "User-Agent")
        if let body = endpoint.body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }
        if endpoint.requiresAuth, let token = tokenStore.tokens?.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    // MARK: - Refresh

    private func refreshTokens() async throws -> AuthTokens {
        if let task = refreshTask { return try await task.value }
        guard let refreshToken = tokenStore.tokens?.refreshToken else {
            await expireSession()
            throw APIError.unauthorized
        }
        let task = Task<AuthTokens, Error> {
            defer { refreshTask = nil }
            let endpoint = Endpoint.post("auth/refresh", body: ["refreshToken": refreshToken], auth: false)
            do {
                let data = try await send(endpoint, allowRefresh: false)
                let tokens = try decoder.decode(AuthTokens.self, from: data)
                tokenStore.tokens = tokens
                return tokens
            } catch {
                await expireSession()
                throw APIError.unauthorized
            }
        }
        refreshTask = task
        return try await task.value
    }

    private func expireSession() async {
        tokenStore.tokens = nil
        await onSessionExpired?()
    }
}

/// Type-erases any Encodable so endpoints can carry heterogeneous bodies.
struct AnyEncodable: Encodable {
    private let encodeImpl: (Encoder) throws -> Void
    init(_ value: Encodable) { encodeImpl = value.encode }
    func encode(to encoder: Encoder) throws { try encodeImpl(encoder) }
}

extension JSONDecoder {
    /// Decodes the backend's ISO-8601 timestamps, with or without fractional seconds.
    static let api: JSONDecoder = {
        let decoder = JSONDecoder()
        let withFractional = ISO8601DateFormatter()
        withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            if let date = withFractional.date(from: raw) ?? plain.date(from: raw) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unrecognised date: \(raw)")
        }
        return decoder
    }()
}

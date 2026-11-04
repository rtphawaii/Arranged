import XCTest
@testable import Arranged

/// URLProtocol stub so the client can be exercised without a network.
final class StubURLProtocol: URLProtocol {
    static var handler: ((URLRequest) -> (Int, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let handler = Self.handler else { return }
        let (status, data) = handler(request)
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

final class APIClientTests: XCTestCase {
    private func makeClient(tokens: AuthTokens?) -> (APIClient, InMemoryTokenStore) {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        let store = InMemoryTokenStore(tokens: tokens)
        let client = APIClient(baseURL: URL(string: "https://example.test/v1")!, session: URLSession(configuration: config), tokenStore: store)
        return (client, store)
    }

    func testSendsBearerTokenAndDecodes() async throws {
        let (client, _) = makeClient(tokens: AuthTokens(accessToken: "abc", refreshToken: "r", expiresIn: 900))
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer abc")
            XCTAssertEqual(request.url?.path, "/v1/health")
            return (200, #"{"ok":true}"#.data(using: .utf8)!)
        }
        let result: OKResponse = try await client.request(.get("health"))
        XCTAssertTrue(result.ok)
    }

    func testRefreshesOnceOn401AndRetries() async throws {
        let (client, store) = makeClient(tokens: AuthTokens(accessToken: "old", refreshToken: "refresh-1", expiresIn: 900))
        var calls: [String] = []
        StubURLProtocol.handler = { request in
            calls.append(request.url!.path)
            if request.url!.path == "/v1/auth/refresh" {
                return (200, #"{"accessToken":"new","refreshToken":"refresh-2","expiresIn":900}"#.data(using: .utf8)!)
            }
            if request.value(forHTTPHeaderField: "Authorization") == "Bearer old" {
                return (401, #"{"error":{"code":"unauthorized","message":"expired"}}"#.data(using: .utf8)!)
            }
            return (200, #"{"ok":true}"#.data(using: .utf8)!)
        }
        let result: OKResponse = try await client.request(.get("me"))
        XCTAssertTrue(result.ok)
        XCTAssertEqual(calls, ["/v1/me", "/v1/auth/refresh", "/v1/me"])
        XCTAssertEqual(store.tokens?.accessToken, "new")
    }

    func testMapsServerErrors() async {
        let (client, _) = makeClient(tokens: nil)
        StubURLProtocol.handler = { _ in (409, #"{"error":{"code":"conflict","message":"Already booked"}}"#.data(using: .utf8)!) }
        do {
            let _: OKResponse = try await client.request(.get("x", auth: false))
            XCTFail("expected error")
        } catch let error as APIError {
            XCTAssertEqual(error, .server(status: 409, code: "conflict", message: "Already booked"))
        } catch {
            XCTFail("unexpected \(error)")
        }
    }
}

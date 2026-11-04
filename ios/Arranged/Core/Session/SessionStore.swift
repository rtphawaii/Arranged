import Foundation
import Observation

/// Source of truth for "who is signed in" and which top-level flow the app should show.
@MainActor
@Observable
final class SessionStore {
    enum State: Equatable {
        case loading
        case signedOut
        case onboarding(User)
        case active(User)
    }

    private(set) var state: State = .loading
    private let api: ArrangedAPI
    private let client: APIClient

    var currentUser: User? {
        switch state {
        case .onboarding(let user), .active(let user): return user
        default: return nil
        }
    }

    init(api: ArrangedAPI, client: APIClient) {
        self.api = api
        self.client = client
    }

    func bootstrap() async {
        await client.setSessionExpiredHandler { [weak self] in
            await MainActor.run { self?.state = .signedOut }
        }
        guard await client.isAuthenticated else {
            state = .signedOut
            return
        }
        do {
            apply(user: try await api.me())
        } catch APIError.unauthorized {
            state = .signedOut
        } catch {
            // Offline or server error: keep the cached session so the app still opens.
            state = .signedOut
        }
    }

    func signedIn(_ response: OTPVerifyResponse) {
        apply(user: response.user)
    }

    func apply(user: User) {
        state = user.status == .active ? .active(user) : .onboarding(user)
    }

    func refreshUser() async {
        if let user = try? await api.me() { apply(user: user) }
    }

    func signOut() async {
        await api.logout()
        state = .signedOut
    }
}

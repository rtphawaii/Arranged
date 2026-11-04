import Foundation
import Observation

/// Dependency container handed to the view tree through the SwiftUI environment.
@MainActor
@Observable
final class AppEnvironment {
    let api: ArrangedAPI
    let session: SessionStore
    let paymentSheet: PaymentSheetPresenting

    init(api: ArrangedAPI, session: SessionStore, paymentSheet: PaymentSheetPresenting) {
        self.api = api
        self.session = session
        self.paymentSheet = paymentSheet
    }

    static func live() -> AppEnvironment {
        let client = APIClient(tokenStore: KeychainTokenStore())
        let api = LiveArrangedAPI(client: client)
        let session = SessionStore(api: api, client: client)
        let paymentSheet: PaymentSheetPresenting = AppConfig.usesFakePayments ? DevPaymentSheet(api: api) : UnavailablePaymentSheet()
        PushService.shared.configure(api: api)
        return AppEnvironment(api: api, session: session, paymentSheet: paymentSheet)
    }

    static func preview(state: SessionStore.State = .active(MockData.user)) -> AppEnvironment {
        let client = APIClient(tokenStore: InMemoryTokenStore(tokens: AuthTokens(accessToken: "x", refreshToken: "y", expiresIn: 900)))
        let api = MockArrangedAPI()
        let session = SessionStore(api: api, client: client)
        if case .active(let user) = state { session.apply(user: user) }
        return AppEnvironment(api: api, session: session, paymentSheet: DevPaymentSheet(api: api))
    }
}

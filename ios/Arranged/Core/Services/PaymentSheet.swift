import Foundation

enum PaymentOutcome {
    case completed
    case cancelled
    case failed(String)
}

/// Presents the provider's payment UI for a payment intent's client secret.
///
/// Production: implement this with `StripePaymentSheet` (add the `stripe-ios` Swift package, set the
/// publishable key, build a `PaymentSheet` with the client secret, and map its result).
/// Development: `DevPaymentSheet` calls the backend's dev-only endpoint to simulate success.
protocol PaymentSheetPresenting {
    func present(payment: Payment) async -> PaymentOutcome
}

final class DevPaymentSheet: PaymentSheetPresenting {
    private let api: ArrangedAPI
    init(api: ArrangedAPI) { self.api = api }

    func present(payment: Payment) async -> PaymentOutcome {
        do {
            try await api.devCompletePayment(id: payment.id)
            return .completed
        } catch {
            return .failed(error.localizedDescription)
        }
    }
}

/// Placeholder for the real integration so the app compiles without the Stripe SDK.
final class UnavailablePaymentSheet: PaymentSheetPresenting {
    func present(payment: Payment) async -> PaymentOutcome {
        .failed("Payments are not configured in this build.")
    }
}

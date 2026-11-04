import SwiftUI

/// Sign-in and onboarding: Welcome → Phone → Code → Profile → City → Personality quiz.
struct OnboardingFlow: View {
    enum Step: Hashable {
        case welcome, phone, code(String), profile, personality
    }

    @Environment(AppEnvironment.self) private var env
    @State private var path: [Step] = []
    let startAt: Step

    var body: some View {
        NavigationStack(path: $path) {
            screen(for: startAt)
                .navigationDestination(for: Step.self) { screen(for: $0) }
        }
        .tint(Theme.Colors.primary)
    }

    @ViewBuilder
    private func screen(for step: Step) -> some View {
        switch step {
        case .welcome:
            WelcomeView { path.append(.phone) }
        case .phone:
            PhoneEntryView { phone in path.append(.code(phone)) }
        case .code(let phone):
            OTPVerifyView(phone: phone) { response in
                // RootView swaps to the right flow (profile / personality / main) based on the user's status.
                env.session.signedIn(response)
            }
        case .profile:
            ProfileSetupView { path.append(.personality) }
        case .personality:
            PersonalityQuizView {
                await env.session.refreshUser()
            }
        }
    }
}

struct WelcomeView: View {
    let onContinue: () -> Void

    var body: some View {
        VStack(spacing: Theme.Spacing.lg) {
            Spacer()
            Image(systemName: "fork.knife.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(Theme.Colors.primary)
            Text("Dinner with five strangers.\nEvery Wednesday.")
                .font(Theme.Typography.largeTitle)
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.Colors.textPrimary)
            Text("We match you with people you'll actually get along with, book the table, and reveal it the day before.")
                .font(Theme.Typography.body)
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.Colors.textSecondary)
                .padding(.horizontal, Theme.Spacing.md)
            Spacer()
            PrimaryButton(title: "Get started", action: onContinue)
            Text("By continuing you agree to our Terms and Privacy Policy.")
                .font(Theme.Typography.caption)
                .foregroundStyle(Theme.Colors.textTertiary)
                .multilineTextAlignment(.center)
        }
        .padding(Theme.Spacing.lg)
        .screenBackground()
        .navigationBarHidden(true)
    }
}

struct PhoneEntryView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var countryCode = "+1"
    @State private var number = ""
    @State private var isLoading = false
    @State private var error: String?
    let onCodeSent: (String) -> Void

    private var fullPhone: String { countryCode + number.filter(\.isNumber) }
    private var isValid: Bool { number.filter(\.isNumber).count >= 7 }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
            SectionHeader(title: "What's your number?", subtitle: "We'll text you a code. No passwords, no spam.")
            HStack(spacing: Theme.Spacing.sm) {
                TextField("+1", text: $countryCode)
                    .keyboardType(.phonePad)
                    .frame(width: 70)
                    .inputFieldStyle()
                TextField("415 555 0100", text: $number)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .inputFieldStyle()
            }
            if let error { ErrorBanner(message: error) }
            Spacer()
            PrimaryButton(title: "Send code", isLoading: isLoading, isEnabled: isValid) { Task { await send() } }
        }
        .padding(Theme.Spacing.lg)
        .screenBackground()
        .navigationTitle("Sign in")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func send() async {
        isLoading = true
        defer { isLoading = false }
        error = nil
        do {
            let response = try await env.api.requestOTP(phone: fullPhone)
            onCodeSent(response.phone)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct OTPVerifyView: View {
    @Environment(AppEnvironment.self) private var env
    let phone: String
    let onVerified: (OTPVerifyResponse) -> Void

    @State private var code = ""
    @State private var isLoading = false
    @State private var error: String?
    @State private var resent = false

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
            SectionHeader(title: "Enter the code", subtitle: "Sent to \(phone)")
            OTPCodeField(code: $code)
            if AppConfig.usesFakePayments {
                Text("Dev build: use code 000000").font(Theme.Typography.caption).foregroundStyle(Theme.Colors.textTertiary)
            }
            if let error { ErrorBanner(message: error) }
            HStack {
                TextLinkButton(title: resent ? "Code sent again" : "Resend code") { Task { await resend() } }
                Spacer()
            }
            Spacer()
            PrimaryButton(title: "Continue", isLoading: isLoading, isEnabled: code.count == 6) { Task { await verify() } }
        }
        .padding(Theme.Spacing.lg)
        .screenBackground()
        .navigationTitle("Verify")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: code) { _, newValue in
            if newValue.count == 6 { Task { await verify() } }
        }
    }

    private func verify() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        error = nil
        do {
            onVerified(try await env.api.verifyOTP(phone: phone, code: code))
        } catch {
            self.error = error.localizedDescription
            code = ""
        }
    }

    private func resend() async {
        _ = try? await env.api.requestOTP(phone: phone)
        resent = true
    }
}

extension View {
    func inputFieldStyle() -> some View {
        self
            .font(Theme.Typography.body)
            .padding(14)
            .background(Theme.Colors.surface)
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous).stroke(Theme.Colors.border, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
    }
}

#Preview {
    OnboardingFlow(startAt: .welcome).environment(AppEnvironment.preview(state: .signedOut))
}

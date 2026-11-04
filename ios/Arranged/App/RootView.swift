import SwiftUI

/// Switches between the sign-in/onboarding flow and the main tab bar based on session state.
struct RootView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        Group {
            switch env.session.state {
            case .loading:
                LoadingView(message: "Setting the table…")
            case .signedOut:
                OnboardingFlow(startAt: .welcome).id(OnboardingFlow.Step.welcome)
            case .onboarding(let user):
                // `.id` recreates the flow (and its navigation path) when the starting step changes.
                let step: OnboardingFlow.Step = user.hasProfileBasics ? .personality : .profile
                OnboardingFlow(startAt: step).id(step)
            case .active:
                MainTabView()
            }
        }
        .animation(.easeInOut(duration: 0.25), value: env.session.state)
    }
}

#Preview("Signed in") {
    RootView().environment(AppEnvironment.preview())
}

#Preview("Signed out") {
    RootView().environment(AppEnvironment.preview(state: .signedOut))
}

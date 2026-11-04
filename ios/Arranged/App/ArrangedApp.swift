import SwiftUI

@main
struct ArrangedApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var environment = AppEnvironment.live()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(environment)
                .tint(Theme.Colors.primary)
                .task { await environment.session.bootstrap() }
        }
    }
}

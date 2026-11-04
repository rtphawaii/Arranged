import SwiftUI
import Combine

struct MainTabView: View {
    enum Tab: Hashable { case home, dinners, messages, profile }
    @State private var tab: Tab = .home

    var body: some View {
        TabView(selection: $tab) {
            HomeView()
                .tabItem { Label("Home", systemImage: "fork.knife") }
                .tag(Tab.home)
            DinnersView()
                .tabItem { Label("Dinners", systemImage: "person.3") }
                .tag(Tab.dinners)
            ConversationsListView()
                .tabItem { Label("Messages", systemImage: "bubble.left.and.bubble.right") }
                .tag(Tab.messages)
            ProfileView()
                .tabItem { Label("Profile", systemImage: "person.crop.circle") }
                .tag(Tab.profile)
        }
        .onAppear { PushService.shared.requestPermission() }
        .onReceive(NotificationCenter.default.publisher(for: .pushNotificationOpened)) { note in
            guard let type = note.userInfo?["type"] as? String else { return }
            switch type {
            case "new_message": tab = .messages
            case "new_connection", "feedback_request": tab = .dinners
            default: tab = .home
            }
        }
    }
}

#Preview {
    MainTabView().environment(AppEnvironment.preview())
}

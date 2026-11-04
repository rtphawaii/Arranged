import Foundation
import UIKit
import UserNotifications

/// Requests notification permission, registers with APNs and forwards the device token to the API.
@MainActor
final class PushService: NSObject {
    static let shared = PushService()
    private var api: ArrangedAPI?
    private var pendingToken: String?

    func configure(api: ArrangedAPI) {
        self.api = api
        if let pendingToken { Task { await upload(token: pendingToken) } }
    }

    func requestPermission() {
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
        }
    }

    func didRegister(deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { await upload(token: token) }
    }

    private func upload(token: String) async {
        guard let api else {
            pendingToken = token
            return
        }
        #if DEBUG
        let sandbox = true
        #else
        let sandbox = false
        #endif
        do {
            try await api.registerDevice(token: token, sandbox: sandbox)
            pendingToken = nil
        } catch {
            pendingToken = token
        }
    }
}

extension PushService: UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .badge])
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo
        if let type = userInfo["type"] as? String {
            Task { @MainActor in
                NotificationCenter.default.post(name: .pushNotificationOpened, object: nil, userInfo: ["type": type, "payload": userInfo])
            }
        }
        completionHandler()
    }
}

extension Notification.Name {
    static let pushNotificationOpened = Notification.Name("arranged.pushNotificationOpened")
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in PushService.shared.didRegister(deviceToken: deviceToken) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        #if DEBUG
        print("APNs registration failed: \(error.localizedDescription)")
        #endif
    }
}

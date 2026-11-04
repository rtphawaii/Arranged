import Foundation

/// Build-time configuration. Values come from Info.plist keys that XcodeGen fills from the
/// per-configuration build settings in `project.yml`.
enum AppConfig {
    static var apiBaseURL: URL {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
           !raw.isEmpty,
           let url = URL(string: raw) {
            return url
        }
        return URL(string: "http://localhost:3000/v1")!
    }

    /// When true the app shows the dev-only "simulate payment" path instead of a real payment sheet.
    static var usesFakePayments: Bool {
        #if DEBUG
        return true
        #else
        return false
        #endif
    }
}

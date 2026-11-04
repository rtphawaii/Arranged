import Foundation
import Security

/// Persists auth tokens. Production uses the Keychain; tests can inject the in-memory variant.
protocol TokenStoring: AnyObject {
    var tokens: AuthTokens? { get set }
}

final class KeychainTokenStore: TokenStoring {
    private let service = "com.arranged.app.auth"
    private let account = "tokens"
    private let queue = DispatchQueue(label: "com.arranged.tokenstore")
    private var cache: AuthTokens??

    var tokens: AuthTokens? {
        get {
            queue.sync {
                if let cached = cache { return cached }
                let loaded = load()
                cache = .some(loaded)
                return loaded
            }
        }
        set {
            queue.sync {
                cache = .some(newValue)
                if let newValue { save(newValue) } else { clear() }
            }
        }
    }

    private var baseQuery: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    private func load() -> AuthTokens? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(AuthTokens.self, from: data)
    }

    private func save(_ tokens: AuthTokens) {
        guard let data = try? JSONEncoder().encode(tokens) else { return }
        var query = baseQuery
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(query as CFDictionary, nil)
        if status == errSecDuplicateItem {
            SecItemUpdate(baseQuery as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        }
    }

    private func clear() {
        SecItemDelete(baseQuery as CFDictionary)
    }
}

final class InMemoryTokenStore: TokenStoring {
    var tokens: AuthTokens?
    init(tokens: AuthTokens? = nil) { self.tokens = tokens }
}

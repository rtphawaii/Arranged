import Foundation

/// Every call the app makes to the backend. Feature code depends on this protocol so screens can be
/// previewed and tested with `MockArrangedAPI`.
protocol ArrangedAPI: AnyObject {
    // Auth
    func requestOTP(phone: String) async throws -> OTPRequestResponse
    func verifyOTP(phone: String, code: String) async throws -> OTPVerifyResponse
    func logout() async
    // Profile
    func me() async throws -> User
    func updateProfile(_ request: UpdateProfileRequest) async throws -> User
    func deleteAccount() async throws
    func registerDevice(token: String, sandbox: Bool) async throws
    func cities() async throws -> [City]
    func personalityQuestions() async throws -> PersonalityQuestionsResponse
    func submitPersonality(answers: [String: Int]) async throws -> PersonalityProfile
    // Events & bookings
    func events(cityId: String?) async throws -> [DinnerEvent]
    func event(id: String) async throws -> DinnerEvent
    func createBooking(eventId: String, preferences: BookingPreferences) async throws -> CreateBookingResponse
    func confirmBooking(id: String) async throws -> Booking
    func cancelBooking(id: String) async throws -> Booking
    func bookings() async throws -> [Booking]
    func devCompletePayment(id: String) async throws
    func membership() async throws -> Membership?
    func subscribe() async throws -> Membership
    func cancelMembership() async throws -> Membership
    // Dinners
    func upcomingDinner() async throws -> DinnerGroup?
    func dinnerHistory() async throws -> [DinnerGroup]
    func dinner(id: String) async throws -> DinnerGroup
    func checkIn(groupId: String) async throws -> DinnerGroup
    func icebreakers(groupId: String) async throws -> [Icebreaker]
    // Feedback & connections
    func submitFeedback(groupId: String, feedback: FeedbackRequest) async throws -> FeedbackResponse
    func connect(groupId: String, userId: String) async throws -> ConnectResponse
    func connections() async throws -> [Connection]
    func removeConnection(id: String) async throws
    func block(userId: String, reason: String?) async throws
    // Chat
    func conversations() async throws -> [Conversation]
    func messages(conversationId: String, after: String?, before: String?) async throws -> [Message]
    func sendMessage(conversationId: String, body: String) async throws -> Message
    func markRead(conversationId: String) async throws
    // Notifications
    func notifications() async throws -> [AppNotification]
    func markNotificationsRead() async throws
}

final class LiveArrangedAPI: ArrangedAPI {
    let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    // MARK: Auth
    func requestOTP(phone: String) async throws -> OTPRequestResponse {
        try await client.request(.post("auth/otp/request", body: ["phone": phone], auth: false))
    }

    func verifyOTP(phone: String, code: String) async throws -> OTPVerifyResponse {
        let response: OTPVerifyResponse = try await client.request(.post("auth/otp/verify", body: ["phone": phone, "code": code], auth: false))
        await client.setTokens(response.tokens)
        return response
    }

    func logout() async {
        if let refresh = await client.currentTokens()?.refreshToken {
            try? await client.request(.post("auth/logout", body: ["refreshToken": refresh], auth: false))
        }
        await client.setTokens(nil)
    }

    // MARK: Profile
    func me() async throws -> User { try await client.request(.get("me")) }
    func updateProfile(_ request: UpdateProfileRequest) async throws -> User { try await client.request(.patch("me", body: request)) }
    func deleteAccount() async throws { try await client.request(.delete("me")) }
    func registerDevice(token: String, sandbox: Bool) async throws {
        try await client.request(.post("me/devices", body: RegisterDeviceRequest(token: token, platform: "ios", environment: sandbox ? "sandbox" : "production")))
    }
    func cities() async throws -> [City] { try await client.request(.get("cities", auth: false)) }
    func personalityQuestions() async throws -> PersonalityQuestionsResponse { try await client.request(.get("personality/questions", auth: false)) }
    func submitPersonality(answers: [String: Int]) async throws -> PersonalityProfile {
        try await client.request(.put("personality/me", body: SubmitAnswersRequest(answers: answers)))
    }

    // MARK: Events & bookings
    func events(cityId: String?) async throws -> [DinnerEvent] {
        let query = cityId.map { [URLQueryItem(name: "cityId", value: $0)] } ?? []
        return try await client.request(.get("events", query: query))
    }
    func event(id: String) async throws -> DinnerEvent { try await client.request(.get("events/\(id)")) }
    func createBooking(eventId: String, preferences: BookingPreferences) async throws -> CreateBookingResponse {
        try await client.request(.post("events/\(eventId)/bookings", body: CreateBookingRequest(preferences: preferences)))
    }
    func confirmBooking(id: String) async throws -> Booking { try await client.request(.post("bookings/\(id)/confirm")) }
    func cancelBooking(id: String) async throws -> Booking { try await client.request(.delete("bookings/\(id)")) }
    func bookings() async throws -> [Booking] { try await client.request(.get("bookings")) }
    func devCompletePayment(id: String) async throws { try await client.request(.post("payments/\(id)/dev-complete")) }
    func membership() async throws -> Membership? {
        let value: Membership? = try await client.request(.get("membership"), as: Membership?.self)
        return value
    }
    func subscribe() async throws -> Membership { try await client.request(.post("membership")) }
    func cancelMembership() async throws -> Membership { try await client.request(.delete("membership")) }

    // MARK: Dinners
    func upcomingDinner() async throws -> DinnerGroup? {
        try await client.request(.get("dinners/upcoming"), as: DinnerGroup?.self)
    }
    func dinnerHistory() async throws -> [DinnerGroup] { try await client.request(.get("dinners/history")) }
    func dinner(id: String) async throws -> DinnerGroup { try await client.request(.get("dinners/\(id)")) }
    func checkIn(groupId: String) async throws -> DinnerGroup { try await client.request(.post("dinners/\(groupId)/checkin")) }
    func icebreakers(groupId: String) async throws -> [Icebreaker] { try await client.request(.get("dinners/\(groupId)/icebreakers")) }

    // MARK: Feedback & connections
    func submitFeedback(groupId: String, feedback: FeedbackRequest) async throws -> FeedbackResponse {
        try await client.request(.post("dinners/\(groupId)/feedback", body: feedback))
    }
    func connect(groupId: String, userId: String) async throws -> ConnectResponse {
        try await client.request(.post("dinners/\(groupId)/connect", body: ConnectRequest(userId: userId)))
    }
    func connections() async throws -> [Connection] { try await client.request(.get("connections")) }
    func removeConnection(id: String) async throws { try await client.request(.delete("connections/\(id)")) }
    func block(userId: String, reason: String?) async throws {
        try await client.request(.post("users/\(userId)/block", body: ["reason": reason]))
    }

    // MARK: Chat
    func conversations() async throws -> [Conversation] { try await client.request(.get("conversations")) }
    func messages(conversationId: String, after: String?, before: String?) async throws -> [Message] {
        var query: [URLQueryItem] = []
        if let after { query.append(URLQueryItem(name: "after", value: after)) }
        if let before { query.append(URLQueryItem(name: "before", value: before)) }
        return try await client.request(.get("conversations/\(conversationId)/messages", query: query))
    }
    func sendMessage(conversationId: String, body: String) async throws -> Message {
        try await client.request(.post("conversations/\(conversationId)/messages", body: SendMessageRequest(body: body)))
    }
    func markRead(conversationId: String) async throws { try await client.request(.post("conversations/\(conversationId)/read")) }

    // MARK: Notifications
    func notifications() async throws -> [AppNotification] { try await client.request(.get("notifications")) }
    func markNotificationsRead() async throws { try await client.request(.post("notifications/read")) }
}

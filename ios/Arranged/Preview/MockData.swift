import Foundation

/// Static fixtures for SwiftUI previews and unit tests.
enum MockData {
    static let city = City(id: "city-sf", slug: "sf", name: "San Francisco", countryCode: "US", timezone: "America/Los_Angeles", currency: "USD", dinnerWeekday: 3, dinnerTime: "19:30", isActive: true)
    static let city2 = City(id: "city-nyc", slug: "nyc", name: "New York", countryCode: "US", timezone: "America/New_York", currency: "USD", dinnerWeekday: 3, dinnerTime: "19:30", isActive: true)

    static let user = User(
        id: "user-1", phone: "+14155550001", email: nil, firstName: "Maya", lastName: "Chen", birthdate: "1994-03-12",
        gender: .woman, cityId: city.id, locale: "en", languages: ["en"], jobTitle: "Designer", bio: nil, photoUrl: nil,
        dietary: [], role: .member, status: .active, personalityCompleted: true,
        personalityLabels: ["Social spark", "Adventurous palate", "Deep talker"], referralCode: "MAYA2026",
        hasActiveMembership: false, createdAt: Date()
    )

    static let onboardingUser = User(
        id: "user-2", phone: "+14155550002", email: nil, firstName: nil, lastName: nil, birthdate: nil, gender: nil,
        cityId: nil, locale: "en", languages: ["en"], jobTitle: nil, bio: nil, photoUrl: nil, dietary: [], role: .member,
        status: .onboarding, personalityCompleted: false, personalityLabels: [], referralCode: "NEW12345",
        hasActiveMembership: false, createdAt: Date()
    )

    static let restaurant = Restaurant(id: "r-1", name: "Nopalito", address: "306 Broderick St", neighborhood: "NoPa", latitude: 37.7746, longitude: -122.4383, cuisine: "Mexican", priceLevel: 2, phone: nil, websiteUrl: "https://example.com")

    static var nextWednesday: Date {
        var date = Calendar.current.date(bySettingHour: 19, minute: 30, second: 0, of: Date()) ?? Date()
        while Calendar.current.component(.weekday, from: date) != 4 || date < Date() {
            date = Calendar.current.date(byAdding: .day, value: 1, to: date) ?? date
        }
        return date
    }

    static let payment = Payment(id: "pay-1", provider: "fake", status: .requiresPayment, amountCents: 1800, currency: "USD", clientSecret: "secret")

    static let booking = Booking(id: "b-1", eventId: "e-1", status: .confirmed, preferences: BookingPreferences(budget: .mid), payment: nil, groupId: "g-1", createdAt: Date())

    static let event = DinnerEvent(
        id: "e-1", cityId: city.id, startsAt: nextWednesday, bookingOpensAt: Date().addingTimeInterval(-86400 * 3),
        bookingClosesAt: nextWednesday.addingTimeInterval(-30 * 3600), revealAt: nextWednesday.addingTimeInterval(-24 * 3600),
        status: .bookingOpen, priceCents: 1800, currency: "USD", spotsLeft: 14, myBooking: nil
    )
    static let bookedEvent = DinnerEvent(
        id: "e-1", cityId: city.id, startsAt: event.startsAt, bookingOpensAt: event.bookingOpensAt, bookingClosesAt: event.bookingClosesAt,
        revealAt: event.revealAt, status: .bookingOpen, priceCents: 1800, currency: "USD", spotsLeft: 13, myBooking: booking
    )
    static let nextWeekEvent = DinnerEvent(
        id: "e-2", cityId: city.id, startsAt: nextWednesday.addingTimeInterval(7 * 86400), bookingOpensAt: Date(),
        bookingClosesAt: nextWednesday.addingTimeInterval(7 * 86400 - 30 * 3600), revealAt: nextWednesday.addingTimeInterval(7 * 86400 - 24 * 3600),
        status: .scheduled, priceCents: 1800, currency: "USD", spotsLeft: nil, myBooking: nil
    )

    static let tablemates: [Tablemate] = [
        Tablemate(userId: "u-2", firstName: "Leo", age: 34, jobTitle: "Engineer", photoUrl: nil, languages: ["en", "pt"], personalityLabels: ["Calm presence", "Planner"], checkedIn: true),
        Tablemate(userId: "u-3", firstName: "Priya", age: 29, jobTitle: "Nurse", photoUrl: nil, languages: ["en"], personalityLabels: ["Brings the laughs", "Connector"], checkedIn: false),
        Tablemate(userId: "u-4", firstName: "Jonas", age: 37, jobTitle: "Teacher", photoUrl: nil, languages: ["en", "de"], personalityLabels: ["Deep talker"], checkedIn: false),
        Tablemate(userId: "u-5", firstName: "Sofia", age: 32, jobTitle: "Founder", photoUrl: nil, languages: ["en", "it"], personalityLabels: ["Social spark", "Adventurous palate"], checkedIn: false),
        Tablemate(userId: "u-6", firstName: "Daniel", age: 31, jobTitle: "Chef", photoUrl: nil, languages: ["en"], personalityLabels: ["Easy-going"], checkedIn: false),
    ]

    static let hiddenGroup = DinnerGroup(
        id: "g-1", eventId: "e-1", startsAt: event.startsAt, revealAt: event.revealAt, status: .draft, isRevealed: false,
        tableLabel: "Table 1", reservationName: nil, restaurant: nil, tablemates: [], afterParty: nil, myCheckedInAt: nil,
        feedbackSubmitted: false, conversationId: nil
    )
    static let revealedGroup = DinnerGroup(
        id: "g-1", eventId: "e-1", startsAt: event.startsAt, revealAt: event.revealAt, status: .revealed, isRevealed: true,
        tableLabel: "Table 1", reservationName: "Arranged", restaurant: restaurant, tablemates: tablemates,
        afterParty: AfterParty(id: "ap-1", name: "The Alembic", address: "1725 Haight St", startsAt: event.startsAt.addingTimeInterval(2.5 * 3600), notes: "Ask for the Arranged table."),
        myCheckedInAt: nil, feedbackSubmitted: false, conversationId: "conv-group"
    )
    static let completedGroup = DinnerGroup(
        id: "g-0", eventId: "e-0", startsAt: Date().addingTimeInterval(-7 * 86400), revealAt: Date().addingTimeInterval(-8 * 86400), status: .completed,
        isRevealed: true, tableLabel: "Table 2", reservationName: "Arranged", restaurant: restaurant, tablemates: tablemates, afterParty: nil,
        myCheckedInAt: Date().addingTimeInterval(-7 * 86400), feedbackSubmitted: false, conversationId: "conv-old"
    )

    static let icebreakers: [Icebreaker] = [
        Icebreaker(id: 1, category: "warmup", text: "What is the best meal you have had in this city?", intensity: 1),
        Icebreaker(id: 2, category: "story", text: "What is a trip that changed how you see things?", intensity: 2),
        Icebreaker(id: 3, category: "deep", text: "What is something you are working on becoming?", intensity: 3),
    ]

    static let connection = Connection(id: "c-1", user: tablemates[0], groupId: "g-0", conversationId: "conv-1", createdAt: Date())

    static let messages: [Message] = [
        Message(id: "m-1", conversationId: "conv-1", senderId: "u-2", body: "Great meeting you last night!", createdAt: Date().addingTimeInterval(-3600)),
        Message(id: "m-2", conversationId: "conv-1", senderId: "user-1", body: "Likewise! Still thinking about that mole.", createdAt: Date().addingTimeInterval(-3000)),
    ]

    static let conversations: [Conversation] = [
        Conversation(id: "conv-1", kind: .direct, groupId: "g-0", title: "Leo", participants: [Participant(userId: "u-2", firstName: "Leo", photoUrl: nil)], lastMessage: messages.last, unreadCount: 1),
        Conversation(id: "conv-group", kind: .group, groupId: "g-1", title: "Table 1 · Leo, Priya, Jonas, Sofia, Daniel", participants: tablemates.map { Participant(userId: $0.userId, firstName: $0.firstName, photoUrl: nil) }, lastMessage: nil, unreadCount: 0),
    ]

    static let questions = PersonalityQuestionsResponse(
        scale: .init(min: 1, max: 5, minLabel: "Not me at all", maxLabel: "Very much me"),
        questions: [
            PersonalityQuestion(key: "energy_1", dimension: "energy", text: "A dinner with six strangers sounds energising, not draining."),
            PersonalityQuestion(key: "openness_1", dimension: "openness", text: "I like trying dishes I cannot pronounce."),
            PersonalityQuestion(key: "depth_1", dimension: "depth", text: "I would rather discuss big questions than the latest series."),
        ]
    )
}

/// In-memory API used by previews and tests. Mutate the properties to drive different states.
final class MockArrangedAPI: ArrangedAPI {
    var user = MockData.user
    var cityList = [MockData.city, MockData.city2]
    var eventList = [MockData.event, MockData.nextWeekEvent]
    var upcoming: DinnerGroup? = MockData.revealedGroup
    var history = [MockData.completedGroup]
    var connectionList = [MockData.connection]
    var conversationList = MockData.conversations
    var messageList = MockData.messages
    var membershipValue: Membership? = nil
    var delay: Duration = .milliseconds(150)

    private func wait() async { try? await Task.sleep(for: delay) }

    func requestOTP(phone: String) async throws -> OTPRequestResponse { await wait(); return OTPRequestResponse(phone: phone, expiresInSeconds: 600) }
    func verifyOTP(phone: String, code: String) async throws -> OTPVerifyResponse {
        await wait()
        return OTPVerifyResponse(user: user, isNewUser: false, tokens: AuthTokens(accessToken: "a", refreshToken: "r", expiresIn: 900))
    }
    func logout() async {}
    func me() async throws -> User { await wait(); return user }
    func updateProfile(_ request: UpdateProfileRequest) async throws -> User { await wait(); return user }
    func deleteAccount() async throws {}
    func registerDevice(token: String, sandbox: Bool) async throws {}
    func cities() async throws -> [City] { await wait(); return cityList }
    func personalityQuestions() async throws -> PersonalityQuestionsResponse { await wait(); return MockData.questions }
    func submitPersonality(answers: [String: Int]) async throws -> PersonalityProfile {
        PersonalityProfile(completed: true, answered: answers.count, total: answers.count, vector: nil, dimensions: [], labels: user.personalityLabels)
    }
    func events(cityId: String?) async throws -> [DinnerEvent] { await wait(); return eventList }
    func event(id: String) async throws -> DinnerEvent { eventList.first { $0.id == id } ?? MockData.event }
    func createBooking(eventId: String, preferences: BookingPreferences) async throws -> CreateBookingResponse {
        await wait()
        let booking = Booking(id: "b-new", eventId: eventId, status: .pendingPayment, preferences: preferences, payment: MockData.payment, groupId: nil, createdAt: Date())
        return CreateBookingResponse(booking: booking, requiresPayment: true)
    }
    func confirmBooking(id: String) async throws -> Booking { await wait(); return MockData.booking }
    func cancelBooking(id: String) async throws -> Booking { await wait(); return MockData.booking }
    func bookings() async throws -> [Booking] { [MockData.booking] }
    func devCompletePayment(id: String) async throws { await wait() }
    func membership() async throws -> Membership? { membershipValue }
    func subscribe() async throws -> Membership {
        let m = Membership(id: "sub-1", plan: "monthly", status: .active, currentPeriodEnd: Date().addingTimeInterval(30 * 86400), cancelAtPeriodEnd: false, clientSecret: nil)
        membershipValue = m
        return m
    }
    func cancelMembership() async throws -> Membership {
        let m = Membership(id: "sub-1", plan: "monthly", status: .active, currentPeriodEnd: Date().addingTimeInterval(30 * 86400), cancelAtPeriodEnd: true, clientSecret: nil)
        membershipValue = m
        return m
    }
    func upcomingDinner() async throws -> DinnerGroup? { await wait(); return upcoming }
    func dinnerHistory() async throws -> [DinnerGroup] { await wait(); return history }
    func dinner(id: String) async throws -> DinnerGroup { (history + [upcoming].compactMap { $0 }).first { $0.id == id } ?? MockData.revealedGroup }
    func checkIn(groupId: String) async throws -> DinnerGroup { MockData.revealedGroup }
    func icebreakers(groupId: String) async throws -> [Icebreaker] { MockData.icebreakers }
    func submitFeedback(groupId: String, feedback: FeedbackRequest) async throws -> FeedbackResponse { await wait(); return FeedbackResponse(matched: []) }
    func connect(groupId: String, userId: String) async throws -> ConnectResponse { ConnectResponse(requested: true, matched: false, connection: nil) }
    func connections() async throws -> [Connection] { await wait(); return connectionList }
    func removeConnection(id: String) async throws { connectionList.removeAll { $0.id == id } }
    func block(userId: String, reason: String?) async throws {}
    func conversations() async throws -> [Conversation] { await wait(); return conversationList }
    func messages(conversationId: String, after: String?, before: String?) async throws -> [Message] { messageList }
    func sendMessage(conversationId: String, body: String) async throws -> Message {
        let m = Message(id: UUID().uuidString, conversationId: conversationId, senderId: user.id, body: body, createdAt: Date())
        messageList.append(m)
        return m
    }
    func markRead(conversationId: String) async throws {}
    func notifications() async throws -> [AppNotification] { [] }
    func markNotificationsRead() async throws {}
}

import Foundation

// MARK: - Shared enums

enum Gender: String, Codable, CaseIterable, Identifiable {
    case woman, man
    case nonBinary = "non_binary"
    case preferNotToSay = "prefer_not_to_say"

    var id: String { rawValue }
    var label: String {
        switch self {
        case .woman: return "Woman"
        case .man: return "Man"
        case .nonBinary: return "Non-binary"
        case .preferNotToSay: return "Prefer not to say"
        }
    }
}

enum Budget: String, Codable, CaseIterable, Identifiable, Hashable {
    case low, mid, high, any
    var id: String { rawValue }
    var label: String {
        switch self {
        case .low: return "$"
        case .mid: return "$$"
        case .high: return "$$$"
        case .any: return "Any"
        }
    }
}

enum UserStatus: String, Codable { case onboarding, active, suspended, deleted }
enum UserRole: String, Codable { case member, admin }

enum EventStatus: String, Codable {
    case scheduled
    case bookingOpen = "booking_open"
    case bookingClosed = "booking_closed"
    case matched, revealed, completed, cancelled
}

enum BookingStatus: String, Codable {
    case pendingPayment = "pending_payment"
    case confirmed, waitlisted, cancelled, refunded, attended
    case noShow = "no_show"
}

enum PaymentStatus: String, Codable {
    case requiresPayment = "requires_payment"
    case processing, succeeded, failed, refunded, cancelled
}

enum GroupStatus: String, Codable { case draft, reserved, revealed, completed, cancelled }
enum MembershipStatus: String, Codable { case active, pastDue = "past_due", cancelled, expired }
enum ConversationKind: String, Codable { case direct, group }

// MARK: - Auth

struct AuthTokens: Codable, Equatable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int
}

struct OTPRequestResponse: Codable {
    let phone: String
    let expiresInSeconds: Int
}

struct OTPVerifyResponse: Codable {
    let user: User
    let isNewUser: Bool
    let tokens: AuthTokens
}

// MARK: - User

struct User: Codable, Identifiable, Equatable {
    let id: String
    let phone: String
    let email: String?
    let firstName: String?
    let lastName: String?
    let birthdate: String?
    let gender: Gender?
    let cityId: String?
    let locale: String
    let languages: [String]
    let jobTitle: String?
    let bio: String?
    let photoUrl: String?
    let dietary: [String]
    let role: UserRole
    let status: UserStatus
    let personalityCompleted: Bool
    let personalityLabels: [String]
    let referralCode: String
    let hasActiveMembership: Bool
    let createdAt: Date

    var displayName: String { firstName ?? "You" }
    var hasProfileBasics: Bool { firstName != nil && birthdate != nil && gender != nil && cityId != nil }
}

struct UpdateProfileRequest: Codable {
    var firstName: String?
    var lastName: String?
    var email: String?
    var birthdate: String?
    var gender: Gender?
    var cityId: String?
    var locale: String?
    var languages: [String]?
    var jobTitle: String?
    var bio: String?
    var photoUrl: String?
    var dietary: [String]?
    var referralCode: String?
}

struct RegisterDeviceRequest: Codable {
    let token: String
    let platform: String
    let environment: String
}

// MARK: - Personality

struct PersonalityQuestion: Codable, Identifiable, Equatable {
    let key: String
    let dimension: String
    let text: String
    var id: String { key }
}

struct PersonalityQuestionsResponse: Codable {
    struct Scale: Codable {
        let min: Int
        let max: Int
        let minLabel: String
        let maxLabel: String
    }
    let scale: Scale
    let questions: [PersonalityQuestion]
}

struct PersonalityProfile: Codable {
    let completed: Bool
    let answered: Int
    let total: Int
    let vector: [Double]?
    let dimensions: [String]
    let labels: [String]
}

struct SubmitAnswersRequest: Codable {
    let answers: [String: Int]
}

// MARK: - Cities & restaurants

struct City: Codable, Identifiable, Equatable, Hashable {
    let id: String
    let slug: String
    let name: String
    let countryCode: String
    let timezone: String
    let currency: String
    let dinnerWeekday: Int
    let dinnerTime: String
    let isActive: Bool
}

struct Restaurant: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let address: String
    let neighborhood: String?
    let latitude: Double?
    let longitude: Double?
    let cuisine: String?
    let priceLevel: Int
    let phone: String?
    let websiteUrl: String?

    var priceLabel: String { String(repeating: "$", count: max(1, min(4, priceLevel))) }
}

// MARK: - Events & bookings

struct BookingPreferences: Codable, Hashable {
    var budget: Budget = .any
    var dietary: [String] = []
    var languages: [String] = []
    var sameAgeGroup: Bool = false
}

struct Payment: Codable, Identifiable, Hashable {
    let id: String
    let provider: String
    let status: PaymentStatus
    let amountCents: Int
    let currency: String
    let clientSecret: String?
}

struct Booking: Codable, Identifiable, Hashable {
    let id: String
    let eventId: String
    let status: BookingStatus
    let preferences: BookingPreferences
    let payment: Payment?
    let groupId: String?
    let createdAt: Date

    var isLive: Bool { [.pendingPayment, .confirmed, .waitlisted].contains(status) }
}

struct DinnerEvent: Codable, Identifiable, Hashable {
    let id: String
    let cityId: String
    let startsAt: Date
    let bookingOpensAt: Date
    let bookingClosesAt: Date
    let revealAt: Date
    let status: EventStatus
    let priceCents: Int
    let currency: String
    let spotsLeft: Int?
    let myBooking: Booking?

    var isBookable: Bool {
        let now = Date()
        return (status == .bookingOpen || status == .scheduled) && now >= bookingOpensAt && now < bookingClosesAt
    }
    var isFull: Bool { (spotsLeft ?? 1) <= 0 }
}

struct CreateBookingRequest: Codable {
    let preferences: BookingPreferences
}

struct CreateBookingResponse: Codable {
    let booking: Booking
    let requiresPayment: Bool
}

struct Membership: Codable, Identifiable, Equatable {
    let id: String
    let plan: String
    let status: MembershipStatus
    let currentPeriodEnd: Date
    let cancelAtPeriodEnd: Bool
    let clientSecret: String?
}

// MARK: - Dinner groups

struct Tablemate: Codable, Identifiable, Equatable, Hashable {
    let userId: String
    let firstName: String
    let age: Int?
    let jobTitle: String?
    let photoUrl: String?
    let languages: [String]
    let personalityLabels: [String]
    let checkedIn: Bool
    var id: String { userId }
}

struct AfterParty: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let address: String
    let startsAt: Date
    let notes: String?
}

struct DinnerGroup: Codable, Identifiable, Equatable {
    let id: String
    let eventId: String
    let startsAt: Date
    let revealAt: Date
    let status: GroupStatus
    let isRevealed: Bool
    let tableLabel: String
    let reservationName: String?
    let restaurant: Restaurant?
    let tablemates: [Tablemate]
    let afterParty: AfterParty?
    let myCheckedInAt: Date?
    let feedbackSubmitted: Bool
    let conversationId: String?

    var checkInWindowOpen: Bool {
        let now = Date()
        return now >= startsAt.addingTimeInterval(-90 * 60) && now <= startsAt.addingTimeInterval(4 * 3600)
    }
}

struct Icebreaker: Codable, Identifiable, Equatable {
    let id: Int
    let category: String
    let text: String
    let intensity: Int
}

// MARK: - Feedback & connections

struct FeedbackRequest: Codable {
    var rating: Int
    var restaurantRating: Int?
    var comment: String?
    var attended: Bool = true
    var connectWith: [String] = []
}

struct FeedbackResponse: Codable {
    let matched: [String]
}

struct Connection: Codable, Identifiable, Equatable {
    let id: String
    let user: Tablemate
    let groupId: String
    let conversationId: String
    let createdAt: Date
}

struct ConnectRequest: Codable {
    let userId: String
}

struct ConnectResponse: Codable {
    let requested: Bool
    let matched: Bool
    let connection: Connection?
}

// MARK: - Chat

struct Message: Codable, Identifiable, Equatable {
    let id: String
    let conversationId: String
    let senderId: String
    let body: String
    let createdAt: Date
}

struct Participant: Codable, Identifiable, Equatable {
    let userId: String
    let firstName: String
    let photoUrl: String?
    var id: String { userId }
}

struct Conversation: Codable, Identifiable, Equatable {
    let id: String
    let kind: ConversationKind
    let groupId: String?
    let title: String
    let participants: [Participant]
    let lastMessage: Message?
    let unreadCount: Int
}

struct SendMessageRequest: Codable {
    let body: String
}

// MARK: - Notifications

struct AppNotification: Codable, Identifiable, Equatable {
    let id: String
    let type: String
    let title: String
    let body: String
    let readAt: Date?
    let createdAt: Date
}

// MARK: - Generic

struct OKResponse: Codable {
    let ok: Bool
}

struct EmptyBody: Codable {}

struct APIErrorBody: Codable {
    struct Inner: Codable {
        let code: String
        let message: String
    }
    let error: Inner
}

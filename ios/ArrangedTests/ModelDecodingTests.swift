import XCTest
@testable import Arranged

final class ModelDecodingTests: XCTestCase {
    func testDecodesEventWithFractionalSecondTimestamps() throws {
        let json = """
        {"id":"e1","cityId":"c1","startsAt":"2026-11-12T03:30:00.000Z","bookingOpensAt":"2026-10-29T03:30:00.000Z",
         "bookingClosesAt":"2026-11-10T21:30:00.000Z","revealAt":"2026-11-11T03:30:00.000Z","status":"booking_open",
         "priceCents":1800,"currency":"USD","spotsLeft":null,"myBooking":null}
        """.data(using: .utf8)!
        let event = try JSONDecoder.api.decode(DinnerEvent.self, from: json)
        XCTAssertEqual(event.status, .bookingOpen)
        XCTAssertNil(event.spotsLeft)
        XCTAssertEqual(Calendar(identifier: .gregorian).component(.year, from: event.startsAt), 2026)
    }

    func testDecodesTimestampsWithoutFractionalSeconds() throws {
        let json = #"{"id":"m1","conversationId":"c","senderId":"u","body":"hi","createdAt":"2026-11-12T03:30:00Z"}"#.data(using: .utf8)!
        let message = try JSONDecoder.api.decode(Message.self, from: json)
        XCTAssertEqual(message.body, "hi")
    }

    func testDecodesNullOptionalTopLevel() throws {
        let value = try JSONDecoder.api.decode(DinnerGroup?.self, from: "null".data(using: .utf8)!)
        XCTAssertNil(value)
    }

    func testBookingPreferencesEncodeDefaults() throws {
        let data = try JSONEncoder().encode(CreateBookingRequest(preferences: BookingPreferences()))
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let prefs = try XCTUnwrap(object["preferences"] as? [String: Any])
        XCTAssertEqual(prefs["budget"] as? String, "any")
        XCTAssertEqual(prefs["sameAgeGroup"] as? Bool, false)
    }
}

import SwiftUI
import Observation

@MainActor
@Observable
final class HomeViewModel {
    var upcomingDinner: DinnerGroup?
    var events: [DinnerEvent] = []
    var isLoading = false
    var error: String?

    private let api: ArrangedAPI
    init(api: ArrangedAPI) { self.api = api }

    func load() async {
        isLoading = events.isEmpty && upcomingDinner == nil
        defer { isLoading = false }
        error = nil
        do {
            async let dinner = api.upcomingDinner()
            async let list = api.events(cityId: nil)
            upcomingDinner = try await dinner
            events = try await list
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// The event the home screen should promote: the user's booked one, else the next bookable one.
    var featuredEvent: DinnerEvent? {
        events.first { $0.myBooking?.isLive == true } ?? events.first { $0.isBookable } ?? events.first
    }
}

struct HomeView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var model: HomeViewModel?

    var body: some View {
        NavigationStack {
            Group {
                if let model {
                    content(model)
                } else {
                    LoadingView()
                }
            }
            .screenBackground()
            .navigationTitle("Hi, \(env.session.currentUser?.displayName ?? "there")")
        }
        .task {
            if model == nil { model = HomeViewModel(api: env.api) }
            await model?.load()
        }
    }

    @ViewBuilder
    private func content(_ model: HomeViewModel) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                if let error = model.error {
                    ErrorBanner(message: error) { Task { await model.load() } }
                }
                if let group = model.upcomingDinner {
                    NavigationLink(value: group.id) {
                        UpcomingDinnerCard(group: group)
                    }
                    .buttonStyle(.plain)
                } else if let event = model.featuredEvent {
                    FeaturedEventCard(event: event)
                } else if !model.isLoading {
                    EmptyStateView(icon: "calendar", title: "No dinners scheduled yet", message: "We're setting up dinners in your city. Check back soon.")
                }

                if model.events.count > 1 || model.upcomingDinner != nil {
                    SectionHeader(title: "Upcoming Wednesdays")
                    ForEach(model.events) { event in
                        NavigationLink(value: event) {
                            EventRow(event: event)
                        }
                        .buttonStyle(.plain)
                    }
                }

                HowItWorksCard()
            }
            .padding(Theme.Spacing.md)
        }
        .refreshable { await model.load() }
        .navigationDestination(for: DinnerEvent.self) { event in
            EventDetailView(event: event) { Task { await model.load() } }
        }
        .navigationDestination(for: String.self) { groupId in
            DinnerView(groupId: groupId)
        }
    }
}

struct UpcomingDinnerCard: View {
    let group: DinnerGroup

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack {
                Pill(text: group.isRevealed ? "Table revealed" : "You're in", tint: group.isRevealed ? Theme.Colors.success : Theme.Colors.accent)
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Theme.Colors.textTertiary)
            }
            Text(group.startsAt.dinnerDayString).font(Theme.Typography.title).foregroundStyle(Theme.Colors.textPrimary)
            Text(group.startsAt.dinnerTimeString).font(Theme.Typography.body).foregroundStyle(Theme.Colors.textSecondary)
            if group.isRevealed, let restaurant = group.restaurant {
                Divider().padding(.vertical, Theme.Spacing.xs)
                Label(restaurant.name, systemImage: "mappin.and.ellipse").font(Theme.Typography.headline)
                Text("\(group.tablemates.count) people are joining you").font(Theme.Typography.callout).foregroundStyle(Theme.Colors.textSecondary)
            } else {
                CountdownView(target: group.revealAt)
                Text("We'll reveal the restaurant and your table the day before.").font(Theme.Typography.caption).foregroundStyle(Theme.Colors.textTertiary)
            }
        }
        .cardStyle()
    }
}

struct FeaturedEventCard: View {
    let event: DinnerEvent

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Pill(text: "Next dinner")
            Text(event.startsAt.dinnerDayString).font(Theme.Typography.title).foregroundStyle(Theme.Colors.textPrimary)
            Text("\(event.startsAt.dinnerTimeString) · \(event.priceCents.priceString(currency: event.currency)) per seat")
                .font(Theme.Typography.body).foregroundStyle(Theme.Colors.textSecondary)
            if let booking = event.myBooking, booking.isLive {
                Pill(text: booking.status == .pendingPayment ? "Finish payment" : booking.status == .waitlisted ? "On the waitlist" : "Seat booked", tint: Theme.Colors.success)
            } else if event.isFull {
                Pill(text: "Full – join the waitlist", tint: Theme.Colors.warning)
            }
            NavigationLink(value: event) {
                Text(event.myBooking?.isLive == true ? "View booking" : "Book my seat")
                    .font(Theme.Typography.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Theme.Colors.primary)
                    .foregroundStyle(Theme.Colors.primaryText)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
            }
            .padding(.top, Theme.Spacing.xs)
        }
        .cardStyle()
    }
}

struct EventRow: View {
    let event: DinnerEvent
    var body: some View {
        HStack(spacing: Theme.Spacing.md) {
            VStack(alignment: .leading, spacing: 2) {
                Text(event.startsAt.dinnerDayString).font(Theme.Typography.headline).foregroundStyle(Theme.Colors.textPrimary)
                Text(statusText).font(Theme.Typography.caption).foregroundStyle(Theme.Colors.textSecondary)
            }
            Spacer()
            Text(event.priceCents.priceString(currency: event.currency)).font(Theme.Typography.callout).foregroundStyle(Theme.Colors.textSecondary)
            Image(systemName: "chevron.right").foregroundStyle(Theme.Colors.textTertiary)
        }
        .cardStyle()
    }

    private var statusText: String {
        if let booking = event.myBooking, booking.isLive { return "Booked" }
        if event.isBookable { return event.isFull ? "Waitlist open" : "Bookings open" }
        if Date() < event.bookingOpensAt { return "Opens \(event.bookingOpensAt.shortDateString)" }
        return "Bookings closed"
    }
}

struct HowItWorksCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            Text("How it works").font(Theme.Typography.title2)
            step("1", "Book a seat", "Pick a Wednesday. Bookings close the day before.")
            step("2", "Get matched", "Our algorithm builds a table of five or six people who'll get along.")
            step("3", "Meet for dinner", "We reveal the restaurant and your tablemates 24 hours before.")
            step("4", "Stay in touch", "After dinner, choose who you'd like to keep talking to. If it's mutual, you can chat.")
        }
        .cardStyle()
    }

    private func step(_ number: String, _ title: String, _ body: String) -> some View {
        HStack(alignment: .top, spacing: Theme.Spacing.md) {
            Text(number)
                .font(Theme.Typography.captionBold)
                .frame(width: 26, height: 26)
                .background(Theme.Colors.primary.opacity(0.12))
                .foregroundStyle(Theme.Colors.primary)
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(Theme.Typography.headline)
                Text(body).font(Theme.Typography.callout).foregroundStyle(Theme.Colors.textSecondary)
            }
        }
    }
}

#Preview("With upcoming dinner") {
    HomeView().environment(AppEnvironment.preview())
}

#Preview("No booking") {
    let env = AppEnvironment.preview()
    (env.api as? MockArrangedAPI)?.upcoming = nil
    return HomeView().environment(env)
}

import SwiftUI

/// Event details plus the booking flow: preferences → payment → confirmation.
struct EventDetailView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State var event: DinnerEvent
    let onChanged: () -> Void

    @State private var preferences = BookingPreferences()
    @State private var isWorking = false
    @State private var error: String?
    @State private var confirmedBooking: Booking?
    @State private var showCancelConfirm = false

    init(event: DinnerEvent, onChanged: @escaping () -> Void) {
        _event = State(initialValue: event)
        self.onChanged = onChanged
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                header
                if let booking = event.myBooking, booking.isLive {
                    existingBooking(booking)
                } else if event.isBookable {
                    preferencesForm
                } else {
                    EmptyStateView(icon: "clock", title: "Bookings closed", message: "Bookings for this dinner are closed. Pick another Wednesday.")
                }
                if let error { ErrorBanner(message: error) }
            }
            .padding(Theme.Spacing.md)
        }
        .screenBackground()
        .navigationTitle(event.startsAt.shortDateString)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $confirmedBooking) { booking in
            BookingConfirmationView(booking: booking, event: event) {
                confirmedBooking = nil
                dismiss()
            }
        }
        .confirmationDialog("Cancel your seat?", isPresented: $showCancelConfirm, titleVisibility: .visible) {
            Button("Cancel seat", role: .destructive) { Task { await cancel() } }
            Button("Keep it", role: .cancel) {}
        } message: {
            Text(Date() < event.bookingClosesAt ? "You'll get a full refund." : "Bookings have closed, so this seat can't be refunded.")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text(event.startsAt.dinnerDayString).font(Theme.Typography.title)
            Text("\(event.startsAt.dinnerTimeString) · a restaurant in your city").font(Theme.Typography.body).foregroundStyle(Theme.Colors.textSecondary)
            HStack(spacing: Theme.Spacing.sm) {
                Pill(text: event.priceCents.priceString(currency: event.currency) + " per seat")
                if let spots = event.spotsLeft { Pill(text: spots > 0 ? "\(spots) seats left" : "Waitlist", tint: spots > 0 ? Theme.Colors.success : Theme.Colors.warning) }
            }
            Text("Bookings close \(event.bookingClosesAt.formatted(.dateTime.weekday(.wide).hour().minute())). The table is revealed \(event.revealAt.formatted(.dateTime.weekday(.wide).hour().minute())).")
                .font(Theme.Typography.caption).foregroundStyle(Theme.Colors.textTertiary)
        }
        .cardStyle()
    }

    private var preferencesForm: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            SectionHeader(title: "Your preferences", subtitle: "We use these to pick the restaurant and your table.")
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                Text("Budget").font(Theme.Typography.headline)
                Picker("Budget", selection: $preferences.budget) {
                    ForEach(Budget.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
            }
            Toggle(isOn: $preferences.sameAgeGroup) {
                VStack(alignment: .leading) {
                    Text("Keep my table close in age").font(Theme.Typography.headline)
                    Text("Within about five years of you.").font(Theme.Typography.caption).foregroundStyle(Theme.Colors.textSecondary)
                }
            }
            .tint(Theme.Colors.primary)
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                Text("Dietary").font(Theme.Typography.headline)
                DietaryChips(selected: $preferences.dietary)
            }
            PrimaryButton(title: event.isFull ? "Join waitlist" : "Book my seat · \(event.priceCents.priceString(currency: event.currency))", isLoading: isWorking) {
                Task { await book() }
            }
            if env.session.currentUser?.hasActiveMembership == true {
                Text("Included in your membership.").font(Theme.Typography.caption).foregroundStyle(Theme.Colors.success)
            }
        }
        .cardStyle()
    }

    private func existingBooking(_ booking: Booking) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            switch booking.status {
            case .pendingPayment:
                SectionHeader(title: "Finish your booking", subtitle: "Your seat is held until payment completes.")
                PrimaryButton(title: "Pay \(event.priceCents.priceString(currency: event.currency))", isLoading: isWorking) { Task { await pay(booking) } }
            case .waitlisted:
                SectionHeader(title: "You're on the waitlist", subtitle: "We'll notify you if a seat opens up.")
            default:
                SectionHeader(title: "Your seat is booked", subtitle: "We'll reveal your table and restaurant the day before.")
                CountdownView(target: event.revealAt)
            }
            SecondaryButton(title: "Cancel booking", isLoading: isWorking) { showCancelConfirm = true }
        }
        .cardStyle()
    }

    private func book() async {
        isWorking = true
        defer { isWorking = false }
        error = nil
        do {
            let response = try await env.api.createBooking(eventId: event.id, preferences: preferences)
            if response.requiresPayment {
                await pay(response.booking)
            } else {
                confirmedBooking = response.booking
                await reload()
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func pay(_ booking: Booking) async {
        guard let payment = booking.payment else {
            error = "No payment attached to this booking."
            return
        }
        isWorking = true
        defer { isWorking = false }
        switch await env.paymentSheet.present(payment: payment) {
        case .completed:
            do {
                confirmedBooking = try await env.api.confirmBooking(id: booking.id)
                await reload()
            } catch {
                self.error = error.localizedDescription
            }
        case .cancelled:
            await reload()
        case .failed(let message):
            error = message
            await reload()
        }
    }

    private func cancel() async {
        guard let booking = event.myBooking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            _ = try await env.api.cancelBooking(id: booking.id)
            await reload()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func reload() async {
        if let fresh = try? await env.api.event(id: event.id) { event = fresh }
        onChanged()
    }
}

struct DietaryChips: View {
    @Binding var selected: [String]
    private let options = ["vegetarian", "vegan", "gluten-free", "halal", "kosher", "no alcohol"]

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: Theme.Spacing.sm)], alignment: .leading, spacing: Theme.Spacing.sm) {
            ForEach(options, id: \.self) { option in
                let isOn = selected.contains(option)
                Button {
                    if isOn { selected.removeAll { $0 == option } } else { selected.append(option) }
                } label: {
                    Text(option.capitalized)
                        .font(Theme.Typography.callout)
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .frame(maxWidth: .infinity)
                        .background(isOn ? Theme.Colors.accent : Theme.Colors.surface)
                        .foregroundStyle(isOn ? Color.white : Theme.Colors.textPrimary)
                        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.pill).stroke(isOn ? Theme.Colors.accent : Theme.Colors.border, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.pill))
                }
            }
        }
    }
}

struct BookingConfirmationView: View {
    let booking: Booking
    let event: DinnerEvent
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: Theme.Spacing.lg) {
            Spacer()
            Image(systemName: booking.status == .waitlisted ? "hourglass" : "checkmark.seal.fill")
                .font(.system(size: 64)).foregroundStyle(Theme.Colors.success)
            Text(booking.status == .waitlisted ? "You're on the list" : "See you \(event.startsAt.formatted(.dateTime.weekday(.wide)))!")
                .font(Theme.Typography.title).multilineTextAlignment(.center)
            Text(booking.status == .waitlisted
                 ? "We'll let you know the moment a seat opens up."
                 : "We'll reveal your restaurant and tablemates on \(event.revealAt.formatted(.dateTime.weekday(.wide))) at \(event.revealAt.dinnerTimeString).")
                .font(Theme.Typography.body).foregroundStyle(Theme.Colors.textSecondary).multilineTextAlignment(.center)
            Spacer()
            PrimaryButton(title: "Done", action: onDone)
        }
        .padding(Theme.Spacing.lg)
        .screenBackground()
    }
}

#Preview {
    NavigationStack { EventDetailView(event: MockData.event) {} }.environment(AppEnvironment.preview())
}

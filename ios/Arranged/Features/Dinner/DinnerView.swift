import SwiftUI
import MapKit

/// A single dinner: hidden until reveal, then restaurant, tablemates, check-in, icebreakers, after-party and feedback.
struct DinnerView: View {
    @Environment(AppEnvironment.self) private var env
    let groupId: String

    @State private var group: DinnerGroup?
    @State private var error: String?
    @State private var isCheckingIn = false
    @State private var showIcebreakers = false
    @State private var showFeedback = false

    var body: some View {
        Group {
            if let group {
                content(group)
            } else if let error {
                ErrorBanner(message: error) { Task { await load() } }.padding()
            } else {
                LoadingView()
            }
        }
        .screenBackground()
        .navigationTitle(group?.startsAt.shortDateString ?? "Your dinner")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showIcebreakers) {
            if let group { IcebreakersView(groupId: group.id) }
        }
        .sheet(isPresented: $showFeedback) {
            if let group {
                FeedbackView(group: group) { showFeedback = false; Task { await load() } }
            }
        }
    }

    @ViewBuilder
    private func content(_ group: DinnerGroup) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                if !group.isRevealed {
                    hiddenCard(group)
                } else {
                    if group.status == .completed && !group.feedbackSubmitted {
                        feedbackPrompt
                    }
                    if let restaurant = group.restaurant { RestaurantCard(restaurant: restaurant, group: group) }
                    checkInCard(group)
                    tablematesSection(group)
                    if let afterParty = group.afterParty { AfterPartyCard(afterParty: afterParty) }
                    actions(group)
                }
            }
            .padding(Theme.Spacing.md)
        }
    }

    private func hiddenCard(_ group: DinnerGroup) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            Pill(text: "Seat confirmed", tint: Theme.Colors.success)
            Text(group.startsAt.dinnerDayString).font(Theme.Typography.title)
            Text(group.startsAt.dinnerTimeString).font(Theme.Typography.body).foregroundStyle(Theme.Colors.textSecondary)
            Divider()
            HStack(spacing: Theme.Spacing.md) {
                Image(systemName: "lock.fill").font(.title2).foregroundStyle(Theme.Colors.primary)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Table reveal").font(Theme.Typography.headline)
                    CountdownView(target: group.revealAt)
                }
            }
            Text("On \(group.revealAt.formatted(.dateTime.weekday(.wide))) at \(group.revealAt.dinnerTimeString) you'll see the restaurant and a little about each tablemate.")
                .font(Theme.Typography.callout).foregroundStyle(Theme.Colors.textSecondary)
        }
        .cardStyle()
    }

    private var feedbackPrompt: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text("How was dinner?").font(Theme.Typography.title2)
            Text("Rate the evening and pick who you'd like to stay in touch with. Connections are only made when it's mutual.")
                .font(Theme.Typography.callout).foregroundStyle(Theme.Colors.textSecondary)
            PrimaryButton(title: "Leave feedback") { showFeedback = true }
        }
        .cardStyle()
    }

    private func checkInCard(_ group: DinnerGroup) -> some View {
        Group {
            if let checkedIn = group.myCheckedInAt {
                Label("Checked in at \(checkedIn.dinnerTimeString)", systemImage: "checkmark.circle.fill")
                    .font(Theme.Typography.headline).foregroundStyle(Theme.Colors.success)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .cardStyle()
            } else if group.status == .revealed {
                VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                    Text("At the restaurant?").font(Theme.Typography.headline)
                    Text("Check in so your table knows you've arrived. Opens 90 minutes before.").font(Theme.Typography.caption).foregroundStyle(Theme.Colors.textSecondary)
                    PrimaryButton(title: "I'm here", isLoading: isCheckingIn, isEnabled: group.checkInWindowOpen) { Task { await checkIn() } }
                }
                .cardStyle()
            }
        }
    }

    private func tablematesSection(_ group: DinnerGroup) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            SectionHeader(title: "Your table", subtitle: "\(group.tableLabel) · \(group.tablemates.count + 1) people")
            ForEach(group.tablemates) { mate in
                TablemateRow(mate: mate)
            }
        }
    }

    private func actions(_ group: DinnerGroup) -> some View {
        VStack(spacing: Theme.Spacing.sm) {
            if let conversationId = group.conversationId {
                NavigationLink {
                    ChatView(conversationId: conversationId, title: group.tableLabel)
                } label: {
                    actionRow(icon: "bubble.left.and.bubble.right.fill", title: "Table chat", subtitle: "Coordinate with your tablemates")
                }
                .buttonStyle(.plain)
            }
            Button { showIcebreakers = true } label: {
                actionRow(icon: "questionmark.bubble.fill", title: "Icebreakers", subtitle: "Conversation starters for the table")
            }
            .buttonStyle(.plain)
            if let restaurant = group.restaurant, let url = URL(string: "maps://?q=\(restaurant.address.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")") {
                Link(destination: url) {
                    actionRow(icon: "map.fill", title: "Directions", subtitle: restaurant.address)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func actionRow(icon: String, title: String, subtitle: String) -> some View {
        HStack(spacing: Theme.Spacing.md) {
            Image(systemName: icon).font(.title3).foregroundStyle(Theme.Colors.primary).frame(width: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(Theme.Typography.headline).foregroundStyle(Theme.Colors.textPrimary)
                Text(subtitle).font(Theme.Typography.caption).foregroundStyle(Theme.Colors.textSecondary).lineLimit(1)
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(Theme.Colors.textTertiary)
        }
        .cardStyle()
    }

    private func load() async {
        do {
            group = try await env.api.dinner(id: groupId)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func checkIn() async {
        isCheckingIn = true
        defer { isCheckingIn = false }
        do {
            group = try await env.api.checkIn(groupId: groupId)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct RestaurantCard: View {
    let restaurant: Restaurant
    let group: DinnerGroup

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            if let lat = restaurant.latitude, let lng = restaurant.longitude {
                Map(initialPosition: .region(MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: lat, longitude: lng), span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)))) {
                    Marker(restaurant.name, coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lng))
                }
                .frame(height: 140)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
                .allowsHitTesting(false)
            }
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(restaurant.name).font(Theme.Typography.title2)
                    Text([restaurant.cuisine, restaurant.neighborhood].compactMap { $0 }.joined(separator: " · ")).font(Theme.Typography.callout).foregroundStyle(Theme.Colors.textSecondary)
                }
                Spacer()
                Pill(text: restaurant.priceLabel)
            }
            Text(restaurant.address).font(Theme.Typography.callout).foregroundStyle(Theme.Colors.textSecondary)
            Divider()
            HStack {
                Label("\(group.startsAt.dinnerDayString), \(group.startsAt.dinnerTimeString)", systemImage: "calendar").font(Theme.Typography.callout)
            }
            if let name = group.reservationName {
                Label("Reservation under \"\(name)\"", systemImage: "person.text.rectangle").font(Theme.Typography.callout)
            }
        }
        .cardStyle()
    }
}

struct TablemateRow: View {
    let mate: Tablemate
    var trailing: AnyView? = nil

    var body: some View {
        HStack(spacing: Theme.Spacing.md) {
            AvatarView(name: mate.firstName, photoUrl: mate.photoUrl)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(mate.firstName).font(Theme.Typography.headline)
                    if let age = mate.age { Text("\(age)").font(Theme.Typography.callout).foregroundStyle(Theme.Colors.textSecondary) }
                    if mate.checkedIn { Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.Colors.success).font(.caption) }
                }
                if let job = mate.jobTitle { Text(job).font(Theme.Typography.caption).foregroundStyle(Theme.Colors.textSecondary) }
                if !mate.personalityLabels.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(mate.personalityLabels.prefix(2), id: \.self) { Pill(text: $0) }
                    }
                }
            }
            Spacer()
            if let trailing { trailing }
        }
        .cardStyle(padding: 12)
    }
}

struct AfterPartyCard: View {
    let afterParty: AfterParty
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Pill(text: "Last drink", tint: Theme.Colors.warning)
            Text(afterParty.name).font(Theme.Typography.title2)
            Text("\(afterParty.startsAt.dinnerTimeString) · \(afterParty.address)").font(Theme.Typography.callout).foregroundStyle(Theme.Colors.textSecondary)
            if let notes = afterParty.notes { Text(notes).font(Theme.Typography.caption).foregroundStyle(Theme.Colors.textTertiary) }
            Text("Everyone from tonight's dinners is invited.").font(Theme.Typography.caption).foregroundStyle(Theme.Colors.textTertiary)
        }
        .cardStyle()
    }
}

struct IcebreakersView: View {
    @Environment(AppEnvironment.self) private var env
    let groupId: String
    @State private var items: [Icebreaker] = []
    @State private var index = 0

    var body: some View {
        NavigationStack {
            VStack(spacing: Theme.Spacing.lg) {
                if items.isEmpty {
                    LoadingView()
                } else {
                    let item = items[index % items.count]
                    Spacer()
                    Pill(text: item.category.capitalized, tint: item.intensity >= 3 ? Theme.Colors.primary : Theme.Colors.accent)
                    Text(item.text).font(Theme.Typography.title).multilineTextAlignment(.center).padding(.horizontal)
                    Spacer()
                    PrimaryButton(title: "Next question") { withAnimation { index += 1 } }
                }
            }
            .padding(Theme.Spacing.lg)
            .screenBackground()
            .navigationTitle("Icebreakers")
            .navigationBarTitleDisplayMode(.inline)
            .task { items = (try? await env.api.icebreakers(groupId: groupId)) ?? [] }
        }
    }
}

#Preview("Revealed") {
    NavigationStack { DinnerView(groupId: "g-1") }.environment(AppEnvironment.preview())
}

#Preview("Hidden") {
    let env = AppEnvironment.preview()
    (env.api as? MockArrangedAPI)?.upcoming = MockData.hiddenGroup
    return NavigationStack { DinnerView(groupId: "g-1") }.environment(env)
}

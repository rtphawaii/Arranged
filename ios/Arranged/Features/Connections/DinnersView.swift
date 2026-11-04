import SwiftUI

/// "Dinners" tab: upcoming table, people you've connected with, and past dinners.
struct DinnersView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var upcoming: DinnerGroup?
    @State private var history: [DinnerGroup] = []
    @State private var connections: [Connection] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                    if let error { ErrorBanner(message: error) { Task { await load() } } }
                    if let upcoming {
                        SectionHeader(title: "Next up")
                        NavigationLink(value: upcoming.id) { UpcomingDinnerCard(group: upcoming) }.buttonStyle(.plain)
                    }
                    SectionHeader(title: "Your people", subtitle: connections.isEmpty ? "Mutual connections from past dinners show up here." : nil)
                    if connections.isEmpty && !isLoading {
                        EmptyStateView(icon: "person.2", title: "No connections yet", message: "After each dinner you can choose who to stay in touch with.")
                    }
                    ForEach(connections) { connection in
                        NavigationLink {
                            ChatView(conversationId: connection.conversationId, title: connection.user.firstName)
                        } label: {
                            TablemateRow(mate: connection.user, trailing: AnyView(Image(systemName: "bubble.right").foregroundStyle(Theme.Colors.accent)))
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            Button(role: .destructive) { Task { await remove(connection) } } label: { Label("Remove connection", systemImage: "person.badge.minus") }
                            Button(role: .destructive) { Task { await block(connection) } } label: { Label("Block", systemImage: "hand.raised") }
                        }
                    }
                    if !history.isEmpty {
                        SectionHeader(title: "Past dinners")
                        ForEach(history) { group in
                            NavigationLink(value: group.id) { PastDinnerRow(group: group) }.buttonStyle(.plain)
                        }
                    }
                }
                .padding(Theme.Spacing.md)
            }
            .screenBackground()
            .navigationTitle("Dinners")
            .navigationDestination(for: String.self) { DinnerView(groupId: $0) }
            .refreshable { await load() }
        }
        .task { await load() }
    }

    private func load() async {
        defer { isLoading = false }
        do {
            async let a = env.api.upcomingDinner()
            async let b = env.api.dinnerHistory()
            async let c = env.api.connections()
            upcoming = try await a
            history = try await b
            connections = try await c
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func remove(_ connection: Connection) async {
        try? await env.api.removeConnection(id: connection.id)
        await load()
    }

    private func block(_ connection: Connection) async {
        try? await env.api.block(userId: connection.user.userId, reason: nil)
        try? await env.api.removeConnection(id: connection.id)
        await load()
    }
}

struct PastDinnerRow: View {
    let group: DinnerGroup
    var body: some View {
        HStack(spacing: Theme.Spacing.md) {
            VStack(alignment: .leading, spacing: 2) {
                Text(group.restaurant?.name ?? group.tableLabel).font(Theme.Typography.headline)
                Text(group.startsAt.dinnerDayString).font(Theme.Typography.caption).foregroundStyle(Theme.Colors.textSecondary)
            }
            Spacer()
            if !group.feedbackSubmitted { Pill(text: "Rate", tint: Theme.Colors.warning) }
            Image(systemName: "chevron.right").foregroundStyle(Theme.Colors.textTertiary)
        }
        .cardStyle(padding: 12)
    }
}

#Preview {
    DinnersView().environment(AppEnvironment.preview())
}

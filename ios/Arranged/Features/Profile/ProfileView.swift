import SwiftUI

struct ProfileView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var membership: Membership?
    @State private var isWorking = false
    @State private var error: String?
    @State private var showDeleteConfirm = false
    @State private var showEdit = false

    private var user: User? { env.session.currentUser }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                    if let user {
                        header(user)
                        membershipCard(user)
                        referralCard(user)
                    }
                    if let error { ErrorBanner(message: error) }
                    settings
                }
                .padding(Theme.Spacing.md)
            }
            .screenBackground()
            .navigationTitle("Profile")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Edit") { showEdit = true } } }
            .sheet(isPresented: $showEdit) {
                if let user { EditProfileView(user: user) { showEdit = false } }
            }
            .confirmationDialog("Delete your account?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
                Button("Delete account", role: .destructive) { Task { await deleteAccount() } }
                Button("Keep my account", role: .cancel) {}
            } message: {
                Text("This cancels any upcoming bookings and removes your profile. It can't be undone.")
            }
            .task { membership = try? await env.api.membership() }
        }
    }

    private func header(_ user: User) -> some View {
        HStack(spacing: Theme.Spacing.md) {
            AvatarView(name: user.displayName, photoUrl: user.photoUrl, size: 72)
            VStack(alignment: .leading, spacing: 4) {
                Text([user.firstName, user.lastName].compactMap { $0 }.joined(separator: " ")).font(Theme.Typography.title2)
                if let job = user.jobTitle { Text(job).font(Theme.Typography.callout).foregroundStyle(Theme.Colors.textSecondary) }
                HStack(spacing: 4) { ForEach(user.personalityLabels.prefix(2), id: \.self) { Pill(text: $0) } }
            }
            Spacer()
        }
        .cardStyle()
    }

    private func membershipCard(_ user: User) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack {
                Text("Membership").font(Theme.Typography.headline)
                Spacer()
                if let membership, membership.status == .active {
                    Pill(text: membership.cancelAtPeriodEnd ? "Ends \(membership.currentPeriodEnd.shortDateString)" : "Active", tint: Theme.Colors.success)
                }
            }
            Text("Unlimited dinners every week for one monthly price. Seats are included and you skip checkout.")
                .font(Theme.Typography.callout).foregroundStyle(Theme.Colors.textSecondary)
            if let membership, membership.status == .active, !membership.cancelAtPeriodEnd {
                SecondaryButton(title: "Cancel membership", isLoading: isWorking) { Task { await cancelMembership() } }
            } else {
                PrimaryButton(title: "Become a member", isLoading: isWorking) { Task { await subscribe() } }
            }
        }
        .cardStyle()
    }

    private func referralCard(_ user: User) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text("Invite a friend").font(Theme.Typography.headline)
            Text("Share your code. They'll never be seated at your table, so you both meet new people.").font(Theme.Typography.caption).foregroundStyle(Theme.Colors.textSecondary)
            HStack {
                Text(user.referralCode).font(Theme.Typography.mono)
                Spacer()
                ShareLink(item: "Join me on Arranged – dinner with strangers every Wednesday. Use my code \(user.referralCode).") {
                    Image(systemName: "square.and.arrow.up")
                }
            }
        }
        .cardStyle()
    }

    private var settings: some View {
        VStack(spacing: Theme.Spacing.sm) {
            SecondaryButton(title: "Sign out") { Task { await env.session.signOut() } }
            Button("Delete account") { showDeleteConfirm = true }
                .font(Theme.Typography.callout).foregroundStyle(Theme.Colors.danger)
            Text("Arranged \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "") · API \(AppConfig.apiBaseURL.host() ?? "")")
                .font(Theme.Typography.caption).foregroundStyle(Theme.Colors.textTertiary)
        }
        .padding(.top, Theme.Spacing.lg)
    }

    private func subscribe() async {
        isWorking = true
        defer { isWorking = false }
        do {
            let result = try await env.api.subscribe()
            // With Stripe, `clientSecret` must be confirmed through the payment sheet before the membership activates.
            if let secret = result.clientSecret, !AppConfig.usesFakePayments {
                _ = await env.paymentSheet.present(payment: Payment(id: result.id, provider: "stripe", status: .requiresPayment, amountCents: 0, currency: "USD", clientSecret: secret))
            }
            membership = (try? await env.api.membership()) ?? result
            await env.session.refreshUser()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func cancelMembership() async {
        isWorking = true
        defer { isWorking = false }
        do {
            membership = try await env.api.cancelMembership()
            await env.session.refreshUser()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func deleteAccount() async {
        do {
            try await env.api.deleteAccount()
            await env.session.signOut()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct EditProfileView: View {
    @Environment(AppEnvironment.self) private var env
    let user: User
    let onDone: () -> Void

    @State private var firstName: String
    @State private var lastName: String
    @State private var jobTitle: String
    @State private var bio: String
    @State private var dietary: [String]
    @State private var isSaving = false
    @State private var error: String?

    init(user: User, onDone: @escaping () -> Void) {
        self.user = user
        self.onDone = onDone
        _firstName = State(initialValue: user.firstName ?? "")
        _lastName = State(initialValue: user.lastName ?? "")
        _jobTitle = State(initialValue: user.jobTitle ?? "")
        _bio = State(initialValue: user.bio ?? "")
        _dietary = State(initialValue: user.dietary)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    TextField("First name", text: $firstName).inputFieldStyle()
                    TextField("Last name", text: $lastName).inputFieldStyle()
                    TextField("What do you do?", text: $jobTitle).inputFieldStyle()
                    TextField("A line about you (optional)", text: $bio, axis: .vertical).lineLimit(2...5).inputFieldStyle()
                    Text("Dietary").font(Theme.Typography.headline)
                    DietaryChips(selected: $dietary)
                    if let error { ErrorBanner(message: error) }
                    PrimaryButton(title: "Save", isLoading: isSaving) { Task { await save() } }
                }
                .padding(Theme.Spacing.md)
            }
            .screenBackground()
            .navigationTitle("Edit profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onDone) } }
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        var request = UpdateProfileRequest()
        request.firstName = firstName
        request.lastName = lastName.isEmpty ? nil : lastName
        request.jobTitle = jobTitle.isEmpty ? nil : jobTitle
        request.bio = bio.isEmpty ? nil : bio
        request.dietary = dietary
        do {
            env.session.apply(user: try await env.api.updateProfile(request))
            onDone()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview {
    ProfileView().environment(AppEnvironment.preview())
}

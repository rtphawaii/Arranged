import SwiftUI

/// Post-dinner rating plus the double-blind "stay in touch" picks.
struct FeedbackView: View {
    @Environment(AppEnvironment.self) private var env
    let group: DinnerGroup
    let onDone: () -> Void

    @State private var rating = 0
    @State private var restaurantRating = 0
    @State private var comment = ""
    @State private var attended = true
    @State private var picks: Set<String> = []
    @State private var isSubmitting = false
    @State private var error: String?
    @State private var matched: [String]?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                    if let matched {
                        result(matched)
                    } else {
                        form
                    }
                }
                .padding(Theme.Spacing.md)
            }
            .screenBackground()
            .navigationTitle("How was it?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close", action: onDone) } }
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
            Toggle("I went to the dinner", isOn: $attended).tint(Theme.Colors.primary).cardStyle()
            if attended {
                VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                    Text("The evening").font(Theme.Typography.headline)
                    StarRating(rating: $rating)
                }
                .cardStyle()
                VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                    Text(group.restaurant.map { "The food at \($0.name)" } ?? "The restaurant").font(Theme.Typography.headline)
                    StarRating(rating: $restaurantRating)
                }
                .cardStyle()
                VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                    SectionHeader(title: "Stay in touch?", subtitle: "Pick anyone you'd like to keep talking to. They'll only find out if they pick you too.")
                    ForEach(group.tablemates) { mate in
                        Button { toggle(mate.userId) } label: {
                            TablemateRow(mate: mate, trailing: AnyView(
                                Image(systemName: picks.contains(mate.userId) ? "heart.fill" : "heart")
                                    .font(.title2)
                                    .foregroundStyle(picks.contains(mate.userId) ? Theme.Colors.primary : Theme.Colors.textTertiary)
                            ))
                        }
                        .buttonStyle(.plain)
                    }
                }
                TextField("Anything else? (optional)", text: $comment, axis: .vertical).lineLimit(3...6).inputFieldStyle()
            }
            if let error { ErrorBanner(message: error) }
            PrimaryButton(title: "Submit", isLoading: isSubmitting, isEnabled: !attended || rating > 0) { Task { await submit() } }
        }
    }

    private func result(_ matched: [String]) -> some View {
        VStack(spacing: Theme.Spacing.lg) {
            Spacer(minLength: Theme.Spacing.xl)
            Image(systemName: matched.isEmpty ? "hand.thumbsup.fill" : "heart.circle.fill").font(.system(size: 64)).foregroundStyle(Theme.Colors.primary)
            Text(matched.isEmpty ? "Thanks for the feedback" : "It's mutual!").font(Theme.Typography.title)
            Text(matched.isEmpty
                 ? "If anyone you picked also picks you, we'll open a chat for you both."
                 : "\(names(matched)) also wanted to stay in touch. Say hi in Messages.")
                .font(Theme.Typography.body).foregroundStyle(Theme.Colors.textSecondary).multilineTextAlignment(.center)
            PrimaryButton(title: "Done", action: onDone)
        }
        .frame(maxWidth: .infinity)
    }

    private func names(_ ids: [String]) -> String {
        group.tablemates.filter { ids.contains($0.userId) }.map(\.firstName).joined(separator: ", ")
    }

    private func toggle(_ id: String) {
        if picks.contains(id) { picks.remove(id) } else { picks.insert(id) }
    }

    private func submit() async {
        isSubmitting = true
        defer { isSubmitting = false }
        error = nil
        let request = FeedbackRequest(
            rating: attended ? rating : 1,
            restaurantRating: attended && restaurantRating > 0 ? restaurantRating : nil,
            comment: comment.isEmpty ? nil : comment,
            attended: attended,
            connectWith: attended ? Array(picks) : []
        )
        do {
            matched = try await env.api.submitFeedback(groupId: group.id, feedback: request).matched
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview {
    FeedbackView(group: MockData.completedGroup) {}.environment(AppEnvironment.preview())
}

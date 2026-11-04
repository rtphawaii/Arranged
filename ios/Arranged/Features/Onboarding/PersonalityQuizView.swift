import SwiftUI

/// One question per card, 1–5 agreement scale. Answers are submitted in one batch at the end.
struct PersonalityQuizView: View {
    @Environment(AppEnvironment.self) private var env
    let onFinished: () async -> Void

    @State private var questions: [PersonalityQuestion] = []
    @State private var scale: PersonalityQuestionsResponse.Scale?
    @State private var answers: [String: Int] = [:]
    @State private var index = 0
    @State private var isSubmitting = false
    @State private var error: String?

    private var progress: Double { questions.isEmpty ? 0 : Double(index) / Double(questions.count) }

    var body: some View {
        VStack(spacing: Theme.Spacing.lg) {
            if questions.isEmpty {
                LoadingView(message: "Loading questions…")
            } else if index >= questions.count {
                finished
            } else {
                question(questions[index])
            }
        }
        .screenBackground()
        .navigationTitle("Your vibe")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(index > 0)
        .toolbar {
            if index > 0 && index < questions.count {
                ToolbarItem(placement: .topBarLeading) {
                    Button { index -= 1 } label: { Image(systemName: "chevron.left") }
                }
            }
        }
        .task { await load() }
    }

    private func question(_ q: PersonalityQuestion) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
            ProgressView(value: progress).tint(Theme.Colors.primary)
            Text("\(index + 1) of \(questions.count)").font(Theme.Typography.caption).foregroundStyle(Theme.Colors.textTertiary)
            Spacer()
            Text(q.text)
                .font(Theme.Typography.title)
                .foregroundStyle(Theme.Colors.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .id(q.key)
                .transition(.opacity.combined(with: .move(edge: .trailing)))
            Spacer()
            HStack(spacing: Theme.Spacing.sm) {
                ForEach((scale?.min ?? 1)...(scale?.max ?? 5), id: \.self) { value in
                    Button {
                        answers[q.key] = value
                        withAnimation(.easeInOut(duration: 0.2)) { index += 1 }
                    } label: {
                        Text("\(value)")
                            .font(Theme.Typography.headline)
                            .frame(maxWidth: .infinity)
                            .frame(height: 56)
                            .background(answers[q.key] == value ? Theme.Colors.primary : Theme.Colors.surface)
                            .foregroundStyle(answers[q.key] == value ? Theme.Colors.primaryText : Theme.Colors.textPrimary)
                            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md).stroke(Theme.Colors.border, lineWidth: 1))
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                    }
                }
            }
            HStack {
                Text(scale?.minLabel ?? "").font(Theme.Typography.caption).foregroundStyle(Theme.Colors.textTertiary)
                Spacer()
                Text(scale?.maxLabel ?? "").font(Theme.Typography.caption).foregroundStyle(Theme.Colors.textTertiary)
            }
        }
        .padding(Theme.Spacing.lg)
    }

    private var finished: some View {
        VStack(spacing: Theme.Spacing.lg) {
            Spacer()
            Image(systemName: "sparkles").font(.system(size: 56)).foregroundStyle(Theme.Colors.primary)
            Text("That's everything").font(Theme.Typography.title)
            Text("We use your answers to seat you with people you'll click with. You can retake this any time from your profile.")
                .font(Theme.Typography.body).foregroundStyle(Theme.Colors.textSecondary).multilineTextAlignment(.center)
            if let error { ErrorBanner(message: error) }
            Spacer()
            PrimaryButton(title: "Find my table", isLoading: isSubmitting) { Task { await submit() } }
        }
        .padding(Theme.Spacing.lg)
    }

    private func load() async {
        do {
            let response = try await env.api.personalityQuestions()
            questions = response.questions
            scale = response.scale
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func submit() async {
        isSubmitting = true
        defer { isSubmitting = false }
        error = nil
        do {
            _ = try await env.api.submitPersonality(answers: answers)
            await onFinished()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview {
    NavigationStack { PersonalityQuizView { } }.environment(AppEnvironment.preview())
}

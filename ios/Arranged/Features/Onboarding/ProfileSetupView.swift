import SwiftUI

/// Collects the basics the matcher needs: name, birthdate, gender, city, languages.
struct ProfileSetupView: View {
    @Environment(AppEnvironment.self) private var env
    let onDone: () -> Void

    @State private var firstName = ""
    @State private var lastName = ""
    @State private var birthdate = Calendar.current.date(byAdding: .year, value: -28, to: Date()) ?? Date()
    @State private var gender: Gender?
    @State private var cities: [City] = []
    @State private var selectedCity: City?
    @State private var jobTitle = ""
    @State private var isLoading = false
    @State private var error: String?

    private var isValid: Bool { !firstName.trimmingCharacters(in: .whitespaces).isEmpty && gender != nil && selectedCity != nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                SectionHeader(title: "Tell us about you", subtitle: "Only your first name and age range are shared with your table.")

                VStack(spacing: Theme.Spacing.sm) {
                    TextField("First name", text: $firstName).textContentType(.givenName).inputFieldStyle()
                    TextField("Last name", text: $lastName).textContentType(.familyName).inputFieldStyle()
                    TextField("What do you do? (optional)", text: $jobTitle).inputFieldStyle()
                }

                VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                    Text("Birthday").font(Theme.Typography.headline)
                    DatePicker("Birthday", selection: $birthdate, in: ...Calendar.current.date(byAdding: .year, value: -18, to: Date())!, displayedComponents: .date)
                        .datePickerStyle(.compact)
                        .labelsHidden()
                }

                VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                    Text("I am a…").font(Theme.Typography.headline)
                    FlowChips(items: Gender.allCases, selected: gender, label: { $0.label }) { gender = $0 }
                }

                VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                    Text("City").font(Theme.Typography.headline)
                    if cities.isEmpty {
                        ProgressView()
                    } else {
                        FlowChips(items: cities, selected: selectedCity, label: { $0.name }) { selectedCity = $0 }
                    }
                }

                if let error { ErrorBanner(message: error) }
                PrimaryButton(title: "Continue", isLoading: isLoading, isEnabled: isValid) { Task { await save() } }
            }
            .padding(Theme.Spacing.lg)
        }
        .screenBackground()
        .navigationTitle("Your profile")
        .navigationBarTitleDisplayMode(.inline)
        .task { cities = (try? await env.api.cities()) ?? [] }
    }

    private func save() async {
        guard let selectedCity, let gender else { return }
        isLoading = true
        defer { isLoading = false }
        error = nil
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "UTC")
        var request = UpdateProfileRequest()
        request.firstName = firstName.trimmingCharacters(in: .whitespaces)
        request.lastName = lastName.isEmpty ? nil : lastName
        request.birthdate = formatter.string(from: birthdate)
        request.gender = gender
        request.cityId = selectedCity.id
        request.jobTitle = jobTitle.isEmpty ? nil : jobTitle
        request.languages = [Locale.current.language.languageCode?.identifier ?? "en"]
        do {
            let user = try await env.api.updateProfile(request)
            env.session.apply(user: user)
            onDone()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Wrapping row of selectable chips.
struct FlowChips<Item: Identifiable & Equatable>: View {
    let items: [Item]
    let selected: Item?
    let label: (Item) -> String
    let onSelect: (Item) -> Void

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: Theme.Spacing.sm)], alignment: .leading, spacing: Theme.Spacing.sm) {
            ForEach(items) { item in
                let isSelected = item == selected
                Button { onSelect(item) } label: {
                    Text(label(item))
                        .font(Theme.Typography.callout)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity)
                        .background(isSelected ? Theme.Colors.primary : Theme.Colors.surface)
                        .foregroundStyle(isSelected ? Theme.Colors.primaryText : Theme.Colors.textPrimary)
                        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.pill).stroke(isSelected ? Theme.Colors.primary : Theme.Colors.border, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.pill))
                }
            }
        }
    }
}

#Preview {
    NavigationStack { ProfileSetupView {} }.environment(AppEnvironment.preview(state: .onboarding(MockData.onboardingUser)))
}

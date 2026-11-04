import SwiftUI

struct PrimaryButton: View {
    let title: String
    var isLoading = false
    var isEnabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Text(title)
                    .font(Theme.Typography.headline)
                    .opacity(isLoading ? 0 : 1)
                if isLoading {
                    ProgressView().tint(Theme.Colors.primaryText)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(isEnabled ? Theme.Colors.primary : Theme.Colors.primary.opacity(0.4))
            .foregroundStyle(Theme.Colors.primaryText)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
        }
        .disabled(!isEnabled || isLoading)
    }
}

struct SecondaryButton: View {
    let title: String
    var isLoading = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Text(title).font(Theme.Typography.headline).opacity(isLoading ? 0 : 1)
                if isLoading { ProgressView() }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Theme.Colors.surface)
            .foregroundStyle(Theme.Colors.textPrimary)
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous).stroke(Theme.Colors.border, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
        }
        .disabled(isLoading)
    }
}

struct TextLinkButton: View {
    let title: String
    let action: () -> Void
    var body: some View {
        Button(title, action: action)
            .font(Theme.Typography.callout)
            .foregroundStyle(Theme.Colors.accent)
    }
}

import SwiftUI

struct Pill: View {
    let text: String
    var tint: Color = Theme.Colors.accent
    var body: some View {
        Text(text)
            .font(Theme.Typography.captionBold)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(tint.opacity(0.12))
            .foregroundStyle(tint)
            .clipShape(Capsule())
    }
}

struct AvatarView: View {
    let name: String
    var photoUrl: String? = nil
    var size: CGFloat = 48

    private var initials: String { String(name.prefix(1)).uppercased() }

    var body: some View {
        Group {
            if let photoUrl, let url = URL(string: photoUrl) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    placeholder
                }
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var placeholder: some View {
        ZStack {
            Circle().fill(Theme.Colors.accent.opacity(0.15))
            Text(initials)
                .font(.system(size: size * 0.4, weight: .semibold, design: .serif))
                .foregroundStyle(Theme.Colors.accent)
        }
    }
}

struct SectionHeader: View {
    let title: String
    var subtitle: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text(title).font(Theme.Typography.title2).foregroundStyle(Theme.Colors.textPrimary)
            if let subtitle {
                Text(subtitle).font(Theme.Typography.callout).foregroundStyle(Theme.Colors.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct LoadingView: View {
    var message: String = "Loading…"
    var body: some View {
        VStack(spacing: Theme.Spacing.md) {
            ProgressView()
            Text(message).font(Theme.Typography.callout).foregroundStyle(Theme.Colors.textSecondary)
        }
        .screenBackground()
    }
}

struct ErrorBanner: View {
    let message: String
    var retry: (() -> Void)? = nil
    var body: some View {
        HStack(spacing: Theme.Spacing.sm) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Theme.Colors.danger)
            Text(message).font(Theme.Typography.callout).foregroundStyle(Theme.Colors.textPrimary)
            Spacer()
            if let retry {
                Button("Retry", action: retry).font(Theme.Typography.captionBold)
            }
        }
        .padding(Theme.Spacing.md)
        .background(Theme.Colors.danger.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
    }
}

struct EmptyStateView: View {
    let icon: String
    let title: String
    let message: String
    var body: some View {
        VStack(spacing: Theme.Spacing.sm) {
            Image(systemName: icon).font(.system(size: 40)).foregroundStyle(Theme.Colors.textTertiary)
            Text(title).font(Theme.Typography.title2).foregroundStyle(Theme.Colors.textPrimary)
            Text(message).font(Theme.Typography.callout).foregroundStyle(Theme.Colors.textSecondary).multilineTextAlignment(.center)
        }
        .padding(Theme.Spacing.xl)
        .frame(maxWidth: .infinity)
    }
}

/// Live countdown to a date, e.g. "2d 4h 12m".
struct CountdownView: View {
    let target: Date
    var prefix: String = "Reveal in"

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            Text("\(prefix) \(Self.format(from: context.date, to: target))")
                .font(Theme.Typography.captionBold)
                .foregroundStyle(Theme.Colors.textSecondary)
        }
    }

    static func format(from: Date, to: Date) -> String {
        let seconds = max(0, Int(to.timeIntervalSince(from)))
        let days = seconds / 86400
        let hours = (seconds % 86400) / 3600
        let minutes = (seconds % 3600) / 60
        if days > 0 { return "\(days)d \(hours)h" }
        if hours > 0 { return "\(hours)h \(minutes)m" }
        return "\(minutes)m"
    }
}

/// Six-digit code entry with one hidden text field driving the boxes.
struct OTPCodeField: View {
    @Binding var code: String
    var length: Int = 6
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            TextField("", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .focused($focused)
                .opacity(0.01)
                .onChange(of: code) { _, newValue in
                    code = String(newValue.filter(\.isNumber).prefix(length))
                }
            HStack(spacing: Theme.Spacing.sm) {
                ForEach(0..<length, id: \.self) { index in
                    let digit = index < code.count ? String(code[code.index(code.startIndex, offsetBy: index)]) : ""
                    Text(digit)
                        .font(Theme.Typography.mono)
                        .frame(width: 44, height: 56)
                        .background(Theme.Colors.surface)
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
                                .stroke(index == code.count && focused ? Theme.Colors.primary : Theme.Colors.border, lineWidth: 1.5)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous))
                }
            }
            .contentShape(Rectangle())
            .onTapGesture { focused = true }
        }
        .onAppear { focused = true }
    }
}

struct StarRating: View {
    @Binding var rating: Int
    var max: Int = 5
    var body: some View {
        HStack(spacing: Theme.Spacing.sm) {
            ForEach(1...max, id: \.self) { star in
                Image(systemName: star <= rating ? "star.fill" : "star")
                    .font(.system(size: 30))
                    .foregroundStyle(star <= rating ? Theme.Colors.warning : Theme.Colors.textTertiary)
                    .onTapGesture { rating = star }
            }
        }
    }
}

extension Date {
    var dinnerDayString: String {
        formatted(.dateTime.weekday(.wide).month(.wide).day())
    }
    var dinnerTimeString: String {
        formatted(.dateTime.hour().minute())
    }
    var shortDateString: String {
        formatted(.dateTime.month(.abbreviated).day())
    }
}

extension Int {
    /// Formats cents as a localised price, e.g. 1800 -> "$18".
    func priceString(currency: String) -> String {
        let amount = Decimal(self) / 100
        return amount.formatted(.currency(code: currency).precision(.fractionLength(self % 100 == 0 ? 0 : 2)))
    }
}

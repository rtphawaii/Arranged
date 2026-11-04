import SwiftUI

/// TEMPORARY design tokens.
///
/// Everything visual in the app routes through this file so the look can be swapped wholesale once
/// the real design (video + website reference) is provided. Change colours, fonts, spacing and radii
/// here; views only reference `Theme.*`.
enum Theme {
    enum Colors {
        static let background = Color(hex: 0xFAF7F2)
        static let surface = Color.white
        static let surfaceElevated = Color(hex: 0xFFFDF9)
        static let primary = Color(hex: 0xDE5A44)       // warm terracotta
        static let primaryText = Color.white
        static let accent = Color(hex: 0x2F6F5E)        // deep green
        static let textPrimary = Color(hex: 0x1E1B18)
        static let textSecondary = Color(hex: 0x6F6A64)
        static let textTertiary = Color(hex: 0xA39E97)
        static let border = Color(hex: 0xE8E2DA)
        static let success = Color(hex: 0x2E8B57)
        static let warning = Color(hex: 0xD98E04)
        static let danger = Color(hex: 0xC62828)
        static let overlay = Color.black.opacity(0.4)
    }

    enum Typography {
        static let largeTitle = Font.system(size: 34, weight: .bold, design: .serif)
        static let title = Font.system(size: 26, weight: .bold, design: .serif)
        static let title2 = Font.system(size: 20, weight: .semibold, design: .serif)
        static let headline = Font.system(size: 17, weight: .semibold)
        static let body = Font.system(size: 17, weight: .regular)
        static let callout = Font.system(size: 15, weight: .regular)
        static let caption = Font.system(size: 13, weight: .regular)
        static let captionBold = Font.system(size: 13, weight: .semibold)
        static let mono = Font.system(size: 28, weight: .semibold, design: .monospaced)
    }

    enum Spacing {
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 16
        static let lg: CGFloat = 24
        static let xl: CGFloat = 32
        static let xxl: CGFloat = 48
    }

    enum Radius {
        static let sm: CGFloat = 8
        static let md: CGFloat = 14
        static let lg: CGFloat = 22
        static let pill: CGFloat = 999
    }

    enum Shadow {
        static let card = ShadowStyle(color: Color.black.opacity(0.06), radius: 12, y: 4)
    }

    struct ShadowStyle {
        let color: Color
        let radius: CGFloat
        let y: CGFloat
    }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}

extension View {
    func cardStyle(padding: CGFloat = Theme.Spacing.md) -> some View {
        self
            .padding(padding)
            .background(Theme.Colors.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .shadow(color: Theme.Shadow.card.color, radius: Theme.Shadow.card.radius, y: Theme.Shadow.card.y)
    }

    func screenBackground() -> some View {
        self
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.Colors.background.ignoresSafeArea())
    }
}

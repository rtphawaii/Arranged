import SwiftUI
import Observation

struct ConversationsListView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var conversations: [Conversation] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && conversations.isEmpty {
                    LoadingView()
                } else if conversations.isEmpty {
                    EmptyStateView(icon: "bubble.left.and.bubble.right", title: "No messages yet", message: "Table chats open when your dinner is revealed. Direct chats open when a connection is mutual.")
                        .screenBackground()
                } else {
                    List(conversations) { conversation in
                        NavigationLink {
                            ChatView(conversationId: conversation.id, title: conversation.title)
                        } label: {
                            ConversationRow(conversation: conversation)
                        }
                        .listRowBackground(Theme.Colors.background)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .background(Theme.Colors.background)
                }
            }
            .navigationTitle("Messages")
            .refreshable { await load() }
        }
        .task { await load() }
    }

    private func load() async {
        defer { isLoading = false }
        do {
            conversations = try await env.api.conversations()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct ConversationRow: View {
    let conversation: Conversation
    var body: some View {
        HStack(spacing: Theme.Spacing.md) {
            AvatarView(name: conversation.participants.first?.firstName ?? "?", photoUrl: conversation.participants.first?.photoUrl)
            VStack(alignment: .leading, spacing: 2) {
                Text(conversation.title).font(Theme.Typography.headline).lineLimit(1)
                Text(conversation.lastMessage?.body ?? "Say hello").font(Theme.Typography.callout).foregroundStyle(Theme.Colors.textSecondary).lineLimit(1)
            }
            Spacer()
            if conversation.unreadCount > 0 {
                Text("\(conversation.unreadCount)")
                    .font(Theme.Typography.captionBold)
                    .padding(6)
                    .background(Theme.Colors.primary)
                    .foregroundStyle(.white)
                    .clipShape(Circle())
            }
        }
        .padding(.vertical, 4)
    }
}

@MainActor
@Observable
final class ChatViewModel {
    var messages: [Message] = []
    var draft = ""
    var isSending = false
    var error: String?

    private let api: ArrangedAPI
    private let conversationId: String
    private var pollTask: Task<Void, Never>?

    init(api: ArrangedAPI, conversationId: String) {
        self.api = api
        self.conversationId = conversationId
    }

    func start() async {
        await loadInitial()
        try? await api.markRead(conversationId: conversationId)
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(5))
                await self?.loadNew()
            }
        }
    }

    func stop() {
        pollTask?.cancel()
        pollTask = nil
    }

    func loadInitial() async {
        do {
            messages = try await api.messages(conversationId: conversationId, after: nil, before: nil)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func loadNew() async {
        guard let last = messages.last else { return await loadInitial() }
        if let fresh = try? await api.messages(conversationId: conversationId, after: last.id, before: nil), !fresh.isEmpty {
            messages.append(contentsOf: fresh.filter { m in !messages.contains { $0.id == m.id } })
            try? await api.markRead(conversationId: conversationId)
        }
    }

    func send() async {
        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, !isSending else { return }
        isSending = true
        defer { isSending = false }
        do {
            let message = try await api.sendMessage(conversationId: conversationId, body: body)
            messages.append(message)
            draft = ""
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Simple polling chat. Swap `ChatViewModel` polling for a WebSocket when the backend adds one.
struct ChatView: View {
    @Environment(AppEnvironment.self) private var env
    let conversationId: String
    let title: String
    @State private var model: ChatViewModel?

    var body: some View {
        Group {
            if let model { content(model) } else { LoadingView() }
        }
        .screenBackground()
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if model == nil { model = ChatViewModel(api: env.api, conversationId: conversationId) }
            await model?.start()
        }
        .onDisappear { model?.stop() }
    }

    @ViewBuilder
    private func content(_ model: ChatViewModel) -> some View {
        @Bindable var model = model
        let myId = env.session.currentUser?.id
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: Theme.Spacing.sm) {
                        ForEach(model.messages) { message in
                            MessageBubble(message: message, isMine: message.senderId == myId).id(message.id)
                        }
                    }
                    .padding(Theme.Spacing.md)
                }
                .onChange(of: model.messages.count) { _, _ in
                    if let last = model.messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                }
                .onAppear {
                    if let last = model.messages.last { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
            if let error = model.error { ErrorBanner(message: error).padding(.horizontal) }
            HStack(spacing: Theme.Spacing.sm) {
                TextField("Message", text: $model.draft, axis: .vertical).lineLimit(1...4).inputFieldStyle()
                Button { Task { await model.send() } } label: {
                    Image(systemName: "arrow.up.circle.fill").font(.system(size: 32)).foregroundStyle(Theme.Colors.primary)
                }
                .disabled(model.draft.trimmingCharacters(in: .whitespaces).isEmpty || model.isSending)
            }
            .padding(Theme.Spacing.md)
            .background(Theme.Colors.surface)
        }
    }
}

struct MessageBubble: View {
    let message: Message
    let isMine: Bool

    var body: some View {
        HStack {
            if isMine { Spacer(minLength: 60) }
            VStack(alignment: isMine ? .trailing : .leading, spacing: 2) {
                Text(message.body)
                    .font(Theme.Typography.body)
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .background(isMine ? Theme.Colors.primary : Theme.Colors.surface)
                    .foregroundStyle(isMine ? Theme.Colors.primaryText : Theme.Colors.textPrimary)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
                Text(message.createdAt.dinnerTimeString).font(Theme.Typography.caption).foregroundStyle(Theme.Colors.textTertiary)
            }
            if !isMine { Spacer(minLength: 60) }
        }
    }
}

#Preview("List") {
    ConversationsListView().environment(AppEnvironment.preview())
}

#Preview("Chat") {
    NavigationStack { ChatView(conversationId: "conv-1", title: "Leo") }.environment(AppEnvironment.preview())
}

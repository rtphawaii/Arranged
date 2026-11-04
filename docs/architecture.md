# Architecture

## Overview

```
 iPhone (SwiftUI)  ──HTTPS/JSON──▶  Fastify API (/v1)  ──▶  PostgreSQL
        ▲                               │     │
        │ APNs push                     │     └─▶ Stripe (payments, memberships, webhook)
        └───────────────────────────────┘     └─▶ Twilio (OTP SMS)
                                        └─▶ In-process scheduler (or external cron) → jobs
```

The backend is a single Node process. Horizontal scaling only needs `SCHEDULER_ENABLED=false` on all but
one instance (or running `npm run jobs -- all` from an external cron), because jobs are idempotent.

## Backend layout

```
backend/src
├── app.ts                  Fastify app: plugins, error handler, route registration (/v1)
├── index.ts                Entry point: migrate, listen, start scheduler, graceful shutdown
├── config.ts               Typed environment (zod)
├── context.ts              Dependency wiring: db, clock, jwt, auth, payments, push, notifications
├── auth/                   OTP flow, JWT access tokens, refresh-token rotation, Fastify auth plugin
├── db/                     Kysely schema types, migrations (static registry), client, seed
├── lib/                    errors, ids/hashing, time helpers (fixed clock for tests), phone normalisation
├── modules/
│   ├── dto.ts              zod request/response schemas (source of the OpenAPI document)
│   ├── users/              profile, devices, blocking, account deletion
│   ├── personality/        questionnaire + 6-dimension vector
│   ├── cities/             public city list
│   ├── events/             dinner events: service (create/generate weekly), lifecycle state machine
│   ├── bookings/           seat booking, payment confirmation, cancellation/refund, waitlist promotion
│   ├── payments/           PaymentProvider interface, fake + Stripe implementations, webhook, membership
│   ├── matching/           pure algorithm + service that persists tables and picks restaurants
│   ├── groups/             what a member sees: hidden/revealed table, check-in, icebreakers
│   ├── feedback+connections/ post-dinner rating, double-blind connection requests
│   ├── chat/               conversations (group + direct), messages, read cursors
│   ├── notifications/      in-app notification log + PushProvider (log / APNs)
│   └── admin/              back-office: cities, restaurants, events, lifecycle actions, groups, icebreakers
└── jobs/                   lifecycle tick, weekly event generation, reminders, cleanup; scheduler + CLI
```

Services take an `AppContext` and are plain classes; routes are thin and declare zod schemas so validation,
serialisation and docs come from one definition.

## Data model

Core tables (see `backend/src/db/migrations/0001_initial.ts` for columns):

- `users`, `personality_answers`, `otp_codes`, `refresh_tokens`, `device_tokens`, `user_blocks`
- `cities` (weekly dinner slot, timezone, currency, price), `restaurants` (price level, tables available)
- `dinner_events` (one per city per week; status + timeline), `bookings`, `payments`, `subscriptions`
- `dinner_groups` (a table at a restaurant), `group_members`, `after_party_venues`, `icebreakers`
- `feedback`, `connection_requests`, `connections`, `conversations`, `conversation_members`, `messages`
- `notifications`

Rules enforced in the schema: one live booking per user per event (partial unique index), one feedback
per member per table, one connection per pair, one request per (table, from, to).

## Event lifecycle

```
scheduled ─▶ booking_open ─▶ booking_closed ─▶ matched ─▶ revealed ─▶ completed
     └──────────────┴──────────────┴─────────────┴──────▶ cancelled
```

Default timeline relative to the dinner start (`EVENT_DEFAULTS` in `modules/events/service.ts`):
bookings open 14 days before, close 30 hours before, reveal 24 hours before, complete 4 hours after.
`EventLifecycle.tick()` runs every minute and performs due transitions: closing bookings also drops
abandoned `pending_payment` bookings and runs matching; reveal publishes tables, opens a group chat per
table and pushes "Your table is ready"; complete marks bookings attended and asks for feedback.

Admins can trigger any transition manually (`POST /v1/admin/events/:id/{open,close,match,reveal,complete,cancel}`),
re-run matching with a different seed while the event is `matched`, assign restaurants and reservation
names per table, and attach an after-party venue.

## Booking & payment flow

1. `POST /v1/events/:id/bookings` with preferences.
   - Active membership or free event → `confirmed` immediately.
   - Event at capacity → `waitlisted` (promoted automatically when a seat frees up before close).
   - Otherwise → `pending_payment` plus a `payments` row holding the provider's client secret.
2. The app completes payment with the provider's sheet (Stripe PaymentSheet in production,
   `POST /v1/payments/:id/dev-complete` in development).
3. `POST /v1/bookings/:id/confirm` verifies with the provider and marks the booking `confirmed`.
   The Stripe webhook (`payment_intent.succeeded`) does the same, so either path works.
4. Cancellation (`DELETE /v1/bookings/:id`): full refund before bookings close; after that the seat is
   forfeited (configurable in `BookingService.cancel`). Event cancellation refunds everyone.

## Reveal & privacy

Before `reveal_at`, `GET /v1/dinners/upcoming` returns the table id, dinner time and reveal time only.
After reveal, members see the restaurant, reservation name, after-party, and for each tablemate: first
name, age, job title, photo, languages, personality labels, check-in status. Phone numbers and last
names are never exposed to other members.

Connection requests are double-blind: a request is stored silently and only when the other person also
requests does a `connections` row and a direct conversation get created (both are notified).

## Auth

- `POST /v1/auth/otp/request` → 6-digit code (hashed in `otp_codes`, 10-minute expiry, 5 attempts, 5 codes / 10 minutes per phone).
- `POST /v1/auth/otp/verify` → creates the user on first sign-in; returns a 15-minute JWT access token and a 60-day refresh token.
- `POST /v1/auth/refresh` rotates the refresh token (old one is revoked). Suspending a user revokes all tokens.
- The iOS `APIClient` retries once with a refreshed token on 401 and signs the user out if refresh fails.

## iOS layout

```
ios/Arranged
├── App/             ArrangedApp (entry), RootView (flow switch), AppEnvironment (DI container)
├── Config/          AppConfig (base URL from build settings)
├── Core/
│   ├── Networking/  APIClient (actor, bearer auth, refresh), Endpoint, APIError, TokenStore (Keychain)
│   ├── Models/      Codable structs mirroring docs/openapi.json
│   ├── Services/    ArrangedAPI protocol + LiveArrangedAPI, PaymentSheetPresenting, PushService
│   └── Session/     SessionStore (@Observable): loading / signedOut / onboarding / active
├── DesignSystem/    Theme (placeholder tokens), Buttons, Primitives (pills, avatar, countdown, OTP field…)
├── Features/        Onboarding, Main (tabs), Home, Booking, Dinner, Feedback, Connections, Chat, Profile
└── Preview/         MockData + MockArrangedAPI for previews and tests
```

Screens read `AppEnvironment` from the SwiftUI environment and talk to the API through the
`ArrangedAPI` protocol, so every screen has a working `#Preview` and can be tested with the mock.

## Extending

- New endpoint: add zod schemas to `modules/dto.ts`, a service method, a route; run `npm run openapi`;
  add the Codable model and `ArrangedAPI` method on iOS.
- New migration: create `db/migrations/000N_name.ts` and register it in `db/migrations/index.ts`.
- Real-time chat: add `@fastify/websocket` and push new messages; `ChatViewModel` currently polls every 5s.
- Photos: add an upload endpoint (S3 pre-signed URL) and set `photo_url`; the UI already renders it.

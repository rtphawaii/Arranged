# Arranged

Infrastructure for an iPhone app where strangers meet over a weekly dinner reservation (in the spirit of
Timeleft): sign up, answer a personality questionnaire, book a seat for Wednesday, get matched into a table
of five or six, see the restaurant and your tablemates the day before, check in, and afterwards choose who
you'd like to stay in touch with.

The visual design is a deliberate placeholder (see `ios/Arranged/DesignSystem/Theme.swift`); it will be
replaced once the reference video and website are supplied.

```
Arranged/
├── backend/   Node 22 + TypeScript + Fastify + PostgreSQL (Kysely). API, matching engine, jobs.
├── ios/       SwiftUI app (iOS 17+), generated with XcodeGen. Networking, session, all screens.
└── docs/      Architecture, matching algorithm, generated OpenAPI spec.
```

## Backend

### Run locally

```bash
cd backend
cp .env.example .env            # defaults work with the docker-compose database
docker compose up -d db         # PostgreSQL 16 on localhost:5432
npm install
npm run migrate                 # create the schema
npm run seed                    # 2 cities, 6 restaurants, 13 users, next 4 weekly dinners
npm run dev                     # http://localhost:3000, Swagger UI at /docs
```

Sign in from the app with any seeded phone such as `+14155550001`; in `OTP_PROVIDER=dev` mode every phone
accepts the code `000000` and real codes are printed to the server log. `+10000000000` is an admin.

### Test

```bash
npm test          # 34 tests: matching engine, questionnaire, time helpers, full API flows
npm run typecheck
```

Tests run against an in-process PostgreSQL (PGlite), so no database or Docker is needed.

### Useful commands

| Command | What it does |
| --- | --- |
| `npm run jobs -- tick` | Advance event states (open / close + match / reveal / complete) |
| `npm run jobs -- events` | Make sure the next 4 weekly dinners exist for each active city |
| `npm run jobs -- reminders` | Send "dinner tomorrow / tonight" notifications |
| `npm run jobs -- all` | Everything above plus cleanup (what the in-process scheduler runs every minute) |
| `npm run openapi` | Regenerate `docs/openapi.json` from the route schemas |
| `npm run migrate -- down` | Roll back the last migration |

### Providers

Every external integration sits behind an interface with a development implementation, selected by
environment variables (see `backend/.env.example`):

| Concern | Dev | Production |
| --- | --- | --- |
| SMS one-time codes | `OTP_PROVIDER=dev` (fixed code, logged) | `OTP_PROVIDER=twilio` |
| Payments | `PAYMENT_PROVIDER=fake` (+ `POST /payments/:id/dev-complete`) | `PAYMENT_PROVIDER=stripe` (PaymentIntents, subscriptions, webhook at `POST /v1/payments/webhook`) |
| Push notifications | `PUSH_PROVIDER=log` | `PUSH_PROVIDER=apns` (token-based auth over HTTP/2) |
| Admin access | `ADMIN_API_TOKEN` bearer token or a user with `role=admin` | same |

## iOS app

Requirements: Xcode 15+, iOS 17 simulator, [XcodeGen](https://github.com/yonaskolb/XcodeGen).

```bash
cd ios
brew install xcodegen
xcodegen generate
open Arranged.xcodeproj
```

The Debug configuration points at `http://localhost:3000/v1` (set `API_BASE_URL` in `ios/project.yml`; use
your Mac's LAN IP for a physical device). There are no third-party dependencies, so the project builds out
of the box. Unit tests live in `ios/ArrangedTests`.

What's wired up:

- Phone + OTP sign-in with Keychain-stored tokens and automatic refresh-token rotation.
- Onboarding: profile basics, city, 24-question personality quiz.
- Home: next dinner with reveal countdown, bookable Wednesdays, how-it-works.
- Booking: preferences (budget, dietary, age band), payment hand-off, waitlist, cancellation/refund rules.
- Dinner: hidden state → reveal (restaurant map, tablemates with personality labels), check-in, icebreakers, table chat, after-party.
- Feedback with double-blind "stay in touch" picks; mutual picks open a direct chat.
- Messages (polling), connections, profile, membership subscription, referral sharing, account deletion.
- Push notification registration and deep-link routing by notification type.

To go live with payments, add the `stripe-ios` package and implement `PaymentSheetPresenting`
(`ios/Arranged/Core/Services/PaymentSheet.swift`) with `PaymentSheet`; the backend already returns the
client secret. Push requires enabling the Push Notifications capability and the `aps-environment`
entitlement on the target.

## Where to read next

- `docs/architecture.md`: data model, event lifecycle, request flows, how to extend.
- `docs/matching.md`: how tables are built and how to tune it.
- `docs/openapi.json`: every endpoint with request/response schemas (also served at `/docs` in dev).

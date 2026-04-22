# Redeemo — Project Context for Claude

This file is read automatically by Claude Code at the start of every session.
It contains everything needed to resume work without losing context.

---

## What Redeemo Is

Redeemo is a UK-based, location-first digital marketplace connecting consumers with local businesses through exclusive digital vouchers. Consumers pay a subscription to unlock redemption rights. Merchants join free but pay for featured placement and campaigns. It is a multi-sided marketplace — not a basic coupon app.

---

## Product Surfaces (4 total)

| Surface | Description |
|---|---|
| Customer App | iOS + Android (Flutter or React Native). Discovery, voucher browsing, redemption, savings, favourites, account. |
| Customer Website | Fully functional Next.js site. Same features as app except NO redemption (mobile only). Subscription purchase, merchant discovery, voucher preview, account management. |
| Merchant Web Portal | Full management: vouchers, branches, campaigns, analytics, settings, onboarding. |
| Merchant Mobile App | Branch staff only: scan QR / validate redemption codes. Lean app. |
| Admin Panel | Full operations: approvals, user/merchant management, campaigns, CMS, reporting, comms. |

---

## Confirmed Tech Stack

| Layer | Technology |
|---|---|
| Customer Website + Admin + Merchant Web Portal | Next.js (TypeScript) |
| Mobile Apps | React Native (Expo) |
| Backend API | Node.js 24 + TypeScript (Fastify or Express) |
| Database | PostgreSQL 16 via Neon (serverless) |
| ORM | Prisma 7.7.0 |
| Payments | Stripe |
| SMS / OTP | Twilio |
| Push Notifications | Firebase Cloud Messaging (FCM) |
| Email | Resend (transactional + marketing) |
| Cache / Sessions | Redis |
| File Storage | AWS S3 or Cloudflare R2 |
| Hosting | Vercel (Next.js) + Railway or Render (API + Redis) |

**Prisma 7 specifics:**
- Datasource URL lives in `prisma.config.ts`, NOT in `schema.prisma`
- Generated client is at `generated/prisma/client`
- Import: `import { PrismaClient } from '../generated/prisma/client'`
- Requires driver adapter: `@prisma/adapter-pg` + `pg`
- Seed config is in `prisma.config.ts` under `migrations.seed`

---

## Database

- **Provider:** Neon (serverless PostgreSQL 16)
- **Connection string:** in `.env` as `DATABASE_URL` (never committed)
- **Schema file:** `prisma/schema.prisma`
- **Migrations:** `prisma/migrations/`
- **Seed:** `npx prisma db seed` (runs `prisma/seed.ts`)

### Dev login credentials (seed data)
| Role | Email | Password |
|---|---|---|
| Admin | admin@redeemo.com | Admin1234! |
| Customer | customer@redeemo.com | Customer1234! |
| Merchant Admin | merchant@redeemo.com | Merchant1234! |
| Branch Staff | staff@redeemo.com | Staff1234! |

---

## Key Business Rules (must be preserved in all code)

1. **Subscription gates redemption.** Free tier can browse and view vouchers but cannot redeem. Attempting to redeem redirects to subscription screen.
2. **Monthly voucher cycle is subscription-anchored, not calendar-based.** Each user's cycle resets on the same day-of-month as their `cycleAnchorDate` (set once at subscription creation, immutable). `getCurrentCycleWindow(cycleAnchorDate, now)` is the single source of truth. Independent of billing interval (monthly/annual) and payment source (Stripe, Apple IAP, Google Play, admin-grant). Day clamping handles short months (e.g. anchor day 31 → 28 in Feb). Cycle state check is time-based at redemption time — no dependency on Stripe webhooks for correctness.
3. **Voucher redeemed once per user per cycle across ALL branches.** When redeemed at any branch, it becomes inactive for that user for the whole cycle.
4. **Redemption flow:** Customer taps Redeem → backend creates `VoucherRedemption` record with a generated `redemptionCode` (alphanumeric + QR) → customer shows code to merchant in-store → merchant scans QR or manually enters code in merchant app → merchant validates → `isValidated = true`. The code persists (not time-limited) so customer can view it in "My Redeemed Vouchers" throughout the cycle.
5. **In-store validation only.** Redemption requires merchant-side validation (QR scan, manual code entry, or merchant admin Quick Validate). Not self-serve.
6. **Two mandatory vouchers per merchant.** Required before admin approval. Cannot be edited or deleted by merchant. IDs: RMV-001, RMV-002. Custom vouchers: RCV-XXX.
7. **Merchant approval is gated.** Admin approves after: mandatory fields filled + docs uploaded + 2 mandatory vouchers created + main branch added + branch user assigned.
8. **Merchant suspension = immediate.** All vouchers immediately inactive. Historical data preserved.
9. **12-month merchant contract.** Signed digitally (click-to-agree or Zoho Sign) during onboarding.
10. **Trending merchants** = merchants with redemptions in current month, within admin-configured geolocation radius.
11. **Featured merchants** = paid placement, admin-set duration and radius, shown on home page.
12. **Website does NOT support redemption.** Fraud prevention — redemption is mobile app only.
13. **One unified merchant account.** Web portal = management. Mobile app = branch staff scan/validate. Same credentials.

---

## Subscription Pricing

| Plan | Price | Billing |
|---|---|---|
| Free | £0 | None — browse only, no redemption |
| Monthly | £6.99 | Monthly auto-renew |
| Annual | £69.99 | Annual auto-renew (~2 months free) |

- Cancel anytime, access until end of billing period
- Free trials via promo codes only (not open — prevents abuse)
- Stripe handles billing for standard subscriptions
- Complimentary/admin-granted subscriptions: planned for Phase 5. Subscription model already supports nullable Stripe fields. When built, will also add a `source` enum (STRIPE / APPLE / GOOGLE / ADMIN) for clarity

---

## Voucher Types
BOGO, Spend & Save, Discount (fixed £ or %), Freebie, Package Deal, Time-Limited, Reusable

---

## Data Model Summary

All models live in `prisma/schema.prisma`. Key relationships:

- `User` → `Subscription` (1:1) → `SubscriptionPlan` — has `cycleAnchorDate` (immutable), `stripeSubscriptionId?`, `stripeCustomerId?`
- `User` → `UserVoucherCycleState` (1:many) ← **monthly cycle enforcement table** — `cycleStartDate` compared against `getCurrentCycleWindow()` at redemption time
- `User` → `VoucherRedemption` (1:many) ← **redemption event + code**
- `Merchant` → `Branch` (1:many) → `BranchUser` (merchant mobile app logins)
- `Merchant` → `Voucher` (1:many, merchant-wide not per-branch)
- `VoucherRedemption` has: `redemptionCode` (unique, shown to customer), `isValidated`, `validatedAt`, `validationMethod?`
- `AdminApproval` — queue for merchant onboarding + voucher approvals
- `Campaign` → `CampaignMerchant` → `Merchant` (location-targeted banner campaigns)
- `FeaturedMerchant` → `Merchant` (paid placement, proximity radius)

---

## Build Progress

### ✅ Phase 1 — Data Model (COMPLETE)
- Project initialised: Node.js 24, TypeScript, Prisma 7, Neon PostgreSQL
- All 30+ models defined, migrated, and applied to Neon database
- Seed script working (`npx prisma db seed`)
- All migrations in `prisma/migrations/`
- Plan: `docs/superpowers/plans/2026-04-07-data-model.md`

### ✅ Phase 2A — Auth System (COMPLETE)
- Customer auth: register, login (password + OTP), refresh, logout, device sessions
- Merchant auth: login, refresh, logout; branch-user management (create, list, deactivate)
- Branch staff auth: login, refresh, logout
- Admin auth: login, refresh, logout
- JWT (customer/merchant/branch/admin tokens), Redis session store, OTP via shared utility
- Plan: `docs/superpowers/plans/2026-04-08-auth-api-structure.md`

### ✅ Phase 2B — Merchant, Branch & Voucher CRUD (COMPLETE)
- Merchant onboarding: profile setup, document upload, contract acceptance, admin approval queue
- Branch management: create, list, update branches
- Voucher management: create (RMV mandatory + RCV custom), list, update, delete (with guards)
- Merchant profile: read and update
- Plan: `docs/superpowers/plans/2026-04-09-merchant-branch-voucher.md`

### ✅ Phase 2C — Subscription System (COMPLETE)
- Stripe SetupIntent-based payment flow (card collection via Stripe SDK)
- stripeCustomerId stored server-side in Redis — never exposed to client
- Subscription creation with confirmed payment method
- Cancel at period end (access continues until currentPeriodEnd)
- Webhook handler: renewal, cancellation, payment failure, voucher cycle reset
- stripeCouponId on PromoCode for explicit Stripe coupon mapping
- User.stripeCustomerId persisted — reused on repeat setup-intent calls (no orphaned customers)
- Webhook idempotency via StripeWebhookEvent table (unique stripeEventId; P2002 → 200)
- Webhook status mapped via SubscriptionStatus enum values (no string casts)
- Stripe v22: period dates read from items.data[0] (not top-level Subscription)
- **Subscription-anchored monthly voucher cycles:** `cycleAnchorDate` (immutable, set once at creation) is the single source of truth for monthly cycle windows. `getCurrentCycleWindow()` does pure date math with day-of-month clamping. Independent of billing interval and payment source.
- **Nullable Stripe fields:** `stripeSubscriptionId` and `stripeCustomerId` are nullable — structural preparation for admin-grant, Apple IAP, Google Play subscriptions. `cancelSubscription()` guards Stripe API calls with null check.
- 255 tests passing, TypeScript clean
- Plans: `docs/superpowers/plans/2026-04-09-subscription-system.md`, `docs/superpowers/plans/2026-04-09-subscription-hardening.md`

### ✅ Phase 2D — Redemption System (COMPLETE)
- Customer redemption flow: PIN entry → guard checks → `VoucherRedemption` created with `redemptionCode` (nanoid) + `UserVoucherCycleState` updated atomically
- All guards enforced: subscription (ACTIVE/TRIALLING), voucher (ACTIVE+APPROVED), merchant (ACTIVE), branch-merchant coherence, one-per-cycle, rate limit (5 attempts / 15 min per userId+branchId)
- Branch PINs stored AES-256-GCM encrypted (`Branch.redemptionPin`)
- Staff verification: `POST /api/v1/redemption/verify` accepts branch staff OR merchant admin; sets `isValidated=true`, records `validationMethod` (QR_SCAN / MANUAL)
- Branch reconciliation list scoped to own branch (staff) or own merchant (admin)
- PIN management routes: GET / PUT / POST send — SMS via Twilio (live), email via Resend (deferred to Phase 6)
- Plan: `docs/superpowers/plans/2026-04-10-redemption-system.md`

**Deferred to Phase 6:** Email PIN delivery (Resend not yet integrated — logs placeholder when `branch.email` is set)

**Redemption codes:** `redemptionCode` uses `crypto.randomBytes` — alphanumeric only (A-Za-z0-9), 10 characters. Database `@unique` constraint prevents collisions. Safe for manual staff entry.

### ✅ Phase 3A — Customer UX Foundations Spec (COMPLETE)
- Full UX spec covering both customer app (React Native) and customer website (Next.js)
- Defines: user flows, screen inventory, state definitions, edge cases, backend dependencies, shared UX rules, web vs mobile distinction
- Redemption is mobile-only by product design (not phase scope) — website shows "Redeem in the app"
- Key backend gaps identified: customer-facing merchant/voucher/search APIs, branch selector route, favourites routes, customer profile/change-password routes, savings aggregation
- Spec: `docs/superpowers/specs/2026-04-10-customer-ux-foundations-design.md`

### ✅ Phase 3B — Customer-Facing API Gaps (backend) (COMPLETE)
- Two-scope plugin: open (discovery, no auth) + authenticated (profile, favourites)
- Discovery: home feed (featured merchants), merchant profile + branch list, voucher detail, search, categories
- Profile: GET + PATCH (name, dob, gender, address, postcode, profileImageUrl, newsletterConsent) + interests read/update + change-password
- Favourites: merchant + voucher add/remove/list
- Savings: lifetime + monthly summary, redemption history with pagination
- Plan: `docs/superpowers/plans/2026-04-10-customer-api-gaps.md`

### ✅ Phase 3C.1a — Customer App Foundations + Auth (COMPLETE — branch feature/customer-app)
- Expo SDK 54 scaffold with expo-router v4, TypeScript strict, design tokens, motion primitives
- Auth flows: register, login, forgot/reset password, email verification polling, phone OTP verification
- Four-step profile completion wizard (About / Address / Interests / Avatar) with dismiss semantics
- Subscribe wall stub (subscribe-prompt + subscribe-soon); subscription purchase deferred
- Tab bar: Home enabled; Discover/Savings/Profile truly disabled (no onPress, no haptic, accessibilityState.disabled)
- WCAG 2.1 AA contrast + VoiceOver/TalkBack audit documented
- Maestro E2E: auth + login flows
- 68+ tests passing; tsc/eslint clean
- Plan: `docs/superpowers/plans/2026-04-15-customer-app-foundations-auth.md`

### ✅ Phase 3C.1b — Customer App Home + Discovery + Map (COMPLETE — branch feature/customer-app)
- Home feed: featured merchants, trending merchants, nearby merchants
- Map tab: interactive map with merchant pins, bottom sheet merchant cards
- Search: full-text search with filters, categories, recent searches
- Category browsing: category grid, filtered merchant list
- All using customer discovery backend APIs
- Plan: `docs/superpowers/plans/2026-04-16-home-discovery-map.md`

### ✅ Phase 3C.1c — Voucher Detail + Redemption (COMPLETE — branch feature/customer-app)
- Full coupon card design: header, perforation lines, body, terms
- 12-state screen: free user, can redeem, redeemed, expired, time-limited variants
- PIN entry sheet with error handling and lockout timer
- Success popup with animated checkmark, auto-dismiss
- Show to Staff screen with live clock, QR placeholder, LIVE badge
- Redemption details card with persisted data (fresh redeem + return visit)
- Branch picker for multi-branch merchants (auto-selects single-branch)
- Time-limited voucher support: countdown, urgency banners, schedule labels
- Favourite toggle with optimistic updates + prop sync
- Code-reviewed and all fixes applied
- Plan: `docs/superpowers/plans/2026-04-16-voucher-detail-redemption.md`

### ✅ Phase 3C.1d — Merchant Profile (COMPLETE — branch feature/customer-app)
- Hero section with banner, logo, featured/trending badges, favourite toggle
- Meta section: name, category, rating, distance, open status, action buttons
- Sticky tab bar: Vouchers / About / Branches / Reviews
- Vouchers tab: sorted cards with redeemed-last ordering
- About tab: description, photos carousel, amenities grid, opening hours
- Branches tab: nearest-first sort, pulsing status dot, action buttons
- Reviews tab: summary histogram, sort control, review cards, write review sheet
- Contact sheet, directions sheet, free user gate modal
- Code-reviewed and all fixes applied
- Plan: `docs/superpowers/plans/2026-04-17-merchant-profile.md`

### ✅ Phase 3C.1e — Subscription Status Integration (COMPLETE — branch feature/customer-app)
- `useSubscription()` hook with React Query calling `GET /api/v1/subscription/me`
- Zod safeParse for graceful null handling (free users)
- `isSubLoading` flag prevents CTA flash during fetch
- Wired into MerchantProfileScreen + VoucherDetailScreen
- ACTIVE/TRIALLING = subscribed; PAST_DUE excluded (backend rejects, user sees subscribe CTA)

### ✅ Phase 3C.1f — Savings Tab (COMPLETE — branch feature/customer-app)
- Backend: `validatedAt` added to savings redemptions response + new `GET /api/v1/customer/savings/monthly-detail?month=YYYY-MM` endpoint
- API client (`src/lib/api/savings.ts`): full typed client with 3 endpoints (summary, redemptions with pagination, monthly-detail)
- Hooks: `useSavingsSummary`, `useSavingsRedemptions` (infinite query), `useMonthlyDetail`, `useCountUp` (reanimated)
- Hero: 5-stop gradient, 3-state header (free/subscriber-empty/populated), animated pound count-up
- Benefit cards: 4 cards (free) / 3 cards (subscriber-empty), FadeInDown entrance
- Insight cards: 6-month trend bar chart (tappable), top 2 places, category breakdown (animated bars)
- Month drill-down: 4 states (default/loading/loaded/£0), ViewingChip with spring entrance, InsightSkeleton
- ROI callout: 4 variants (below-breakeven, monthly multiplier, annual multiplier, promo) with shimmer sweep
- Redemption history: RedemptionRow with 24h badge logic (show-to-staff/validated/plain), infinite scroll, "You're all caught up" end label
- SavingsScreen: FlatList + ListHeaderComponent composition, 5 user states (loading/error/free/subscriber-empty/populated), pull-to-refresh
- Subscription schema: `promoCodeId` added to Zod schema for ROI callout promo detection
- 261 backend tests passing (vitest). Frontend tests written; only `useCountUp.test.ts` executed and passing (4/4). Remaining 6 test files unconfirmed — jest-expo runs but is impractically slow (~28 min/file, see Known Issues).
- Spec: `docs/superpowers/specs/2026-04-18-savings-tab-design.md`
- Plan: `docs/superpowers/plans/2026-04-18-savings-tab.md`

### 🔲 Phase 3C (remaining) — Profile, Favourites, Subscribe, QR
**Remaining work (each needs brainstorming → spec → plan → implementation):**
1. Profile tab — user profile view/edit, subscription management (backend APIs exist)
2. Favourites screen — merchant + voucher lists (backend APIs exist)
3. Subscribe flow — Stripe SetupIntent in-app (stub exists at `subscribe-prompt`). NOTE: iOS requires Apple IAP for digital subscriptions — Stripe cannot be used inside the app
4. QR code rendering — add `react-native-qrcode-svg` for ShowToStaff and RedemptionDetailsCard
5. **Fix customer-app test performance** — Jest runs but is impractically slow (~28 min/file) in worktree. Needs investigation to reach practical speed (<60s/file). See Known Issues.

### ✅ Phase 3D — Customer Website (Next.js) (COMPLETE — PR #3, branch feature/customer-web)
- Full Next.js 15 App Router site at `apps/customer-web/`
- Pages: home, discover, merchant profile, voucher detail, search, subscribe, account, savings, favourites, profile, forgot/reset password, delete account
- Auth: register, login (OTP flow), logout — tokens in localStorage, flag cookie for middleware
- Subscribe: Stripe SetupIntent flow, plan selector, promo code support, animated success state
- Account: profile edit, subscription management (cancel), savings dashboard (chart + redemption history), favourites (merchants + vouchers), delete account (OTP-gated)
- Fonts: Mustica Pro SemiBold (display/headings) + Lato (body) — self-hosted from branding package
- Key decisions: account pages are client components (getAccessToken() is localStorage-only); 401s redirect to /login?next=<page>
- PR: MSC23-bot/Redeemo#3
### 🔲 Phase 4 — Merchant Portal + Mobile App
### 🔲 Phase 5 — Admin Panel
### 🔲 Phase 6 — Comms + Marketing Layer (Resend, FCM, Twilio — includes email PIN delivery)

---

## Open Decisions / Things to Confirm Before Building

- SMS OTP gateway: Twilio (recommended, owner agreed to evaluate)
- Zoho One: use for CRM + contracts + helpdesk alongside the custom platform (not instead of it)
- GDPR: ICO registration required; DSAR + deletion flows must be built into customer account
- Website scope: fully defined above — no redemption, subscription purchase supported
- White-label: not in scope for now, possible future expansion
- **Apple IAP requirement:** iOS App Store requires Apple In-App Purchase for digital subscriptions — Stripe cannot be used inside iOS app. Subscription model already supports this (nullable Stripe fields, payment-agnostic cycle logic). Implementation deferred.
- **Subscription source enum:** When admin-grant flow is built (Phase 5), add `source` field to Subscription (STRIPE / APPLE / GOOGLE / ADMIN) for clarity

---

## How to Resume Work

1. Read this file to get full context
2. Check `git log --oneline` to see current state
3. Check `docs/superpowers/plans/` for implementation plans
4. Run `npx prisma db seed` to reset dev data if needed
5. Ask Claude to continue from the current phase

## Running Locally

Two terminal tabs required simultaneously:

**Tab 1 — Backend API (port 3000):**
```bash
cd /Users/shebinchaliyath/Developer/Redeemo
npm run dev
```

**Tab 2 — Customer Website (port 3001):**
```bash
cd /Users/shebinchaliyath/Developer/Redeemo/apps/customer-web
npm run dev
```

Then open http://localhost:3001. Seed credentials: `customer@redeemo.com` / `Customer1234!`

Customer website env file: `apps/customer-web/.env.local` — requires `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` for subscribe flow.

## Running Tests

**Backend tests (vitest) — safe to run via Claude Code Bash tool:**
```bash
npx vitest run
```

**Customer-app tests (jest-expo) — MUST be run in a real terminal, NOT via Claude Code:**
```bash
cd /Users/shebinchaliyath/Developer/Redeemo/.worktrees/customer-app/apps/customer-app
npm test
```
Claude Code's Bash tool harness passes monitoring file descriptors (fd 4/5) to every child process. jest-expo reads from fd 4 and blocks indefinitely — tests appear to hang with 0% CPU. Running in a real terminal avoids this entirely. First cold run takes ~28 min to build the Babel cache; subsequent runs are much faster (cache at `/tmp/jest-redeemo-customer-app`).

---

## Key Files

| File | Purpose |
|---|---|
| `prisma/schema.prisma` | Complete database schema — source of truth |
| `prisma/seed.ts` | Dev seed script |
| `prisma.config.ts` | Prisma 7 config (datasource URL, seed command) |
| `.env` | Local environment variables (not committed) |
| `docs/superpowers/plans/2026-04-07-data-model.md` | Phase 1: Data model plan |
| `docs/superpowers/plans/2026-04-08-auth-api-structure.md` | Phase 2A: Auth system plan |
| `docs/superpowers/plans/2026-04-09-merchant-branch-voucher.md` | Phase 2B: Merchant/branch/voucher plan |
| `docs/superpowers/plans/2026-04-09-subscription-system.md` | Phase 2C: Subscription system plan |
| `docs/superpowers/plans/2026-04-09-subscription-hardening.md` | Phase 2C: Subscription hardening plan |
| `src/api/subscription/cycle.ts` | Subscription-anchored cycle logic: `getCurrentCycleWindow()`, `toMidnightUTC()`, `resetVoucherCycleForUser()` |
| `src/api/redemption/service.ts` | Redemption flow with all guards (subscription, voucher, cycle, PIN, rate limit) |
| `docs/superpowers/specs/2026-04-18-savings-tab-design.md` | Savings tab UX spec |
| `docs/superpowers/plans/2026-04-18-savings-tab.md` | Savings tab implementation plan (13 tasks) |

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)

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

### ✅ Phase 3C.1a — Customer App Foundations + Auth (COMPLETE on main, with v7 polish rebaseline 2026-05-01)
- Expo SDK 54 scaffold with expo-router v4, TypeScript strict, design tokens, motion primitives
- Auth flows: Welcome / register / login / forgot+reset password / email verification (polling) / phone OTP verification (with country picker, masked entry, resend timer) — **all v7 polish landed on main 2026-05-01 via the auth/onboarding rebaseline PR.** Apple/Google SSO buttons present but stubbed (`Alert.alert("Coming soon", …)`, no network).
- Four-step profile completion wizard (PC1 About / PC2 Address with UK postcode lookup / PC3 Interests / PC4 Avatar) with dismiss semantics
- Subscribe wall: SubscribePromptScreen with the locked CTA contract — premium = alert-only (no stamp, no nav); free = stamp `subscriptionPromptSeenAt` + nav to `/(app)/`. Subscription purchase deferred (Apple IAP / Google Play / Stripe).
- Tab bar: Home + Map enabled (PRs #20 + #22). Favourites/Savings/Profile pending — each lands a visible tab with its own rebaseline PR.
- Password validation now requires special character on both client and backend (closes a real client-vs-backend mismatch bug fixed by rebaseline schemas.ts swap).
- 215 customer-app tests (1 pre-existing baseline failure on `tests/lib/api/profile.test.ts`); tsc clean.
- Plan: `docs/superpowers/plans/2026-04-15-customer-app-foundations-auth.md` (original Phase 3C.1a baseline)
- Rebaseline plan (2026-05-01): `docs/superpowers/plans/2026-05-01-auth-onboarding-rebaseline.md` — Tier 2 with M1 + M2 amendments; full traceability of each salvaged file from cefaf45.

### Phase 3C.1b — Customer App Home + Discovery + Map (IMPLEMENTED, awaiting page-review lock — branch feature/customer-app)
- Home feed: featured merchants, trending merchants, nearby merchants
- Map tab: interactive map with merchant pins, bottom sheet merchant cards
- Search: full-text search with filters, categories, recent searches
- Category browsing: category grid, filtered merchant list
- All using customer discovery backend APIs
- Plan: `docs/superpowers/plans/2026-04-16-home-discovery-map.md`

### Phase 3C.1c — Voucher Detail + Redemption (IMPLEMENTED, awaiting page-review lock — branch feature/customer-app)
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

### Phase 3C.1d — Merchant Profile (IMPLEMENTED, awaiting page-review lock — branch feature/customer-app)
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

### Phase 3C.1e — Subscription Status Integration (IMPLEMENTED, awaiting page-review lock — branch feature/customer-app)
- `useSubscription()` hook with React Query calling `GET /api/v1/subscription/me`
- Zod safeParse for graceful null handling (free users)
- `isSubLoading` flag prevents CTA flash during fetch
- Wired into MerchantProfileScreen + VoucherDetailScreen
- ACTIVE/TRIALLING = subscribed; PAST_DUE excluded (backend rejects, user sees subscribe CTA)

### Phase 3C.1f — Savings Tab (IMPLEMENTED, awaiting page-review lock — branch feature/customer-app)
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
- 264 backend tests passing (vitest). 268 frontend tests passing (jest-expo, 8–10s from Claude Code after environment fix).
- Spec: `docs/superpowers/specs/2026-04-18-savings-tab-design.md`
- Plan: `docs/superpowers/plans/2026-04-18-savings-tab.md`

### Phase 3C.1g — Favourites Screen (IMPLEMENTED, awaiting page-review lock — branch feature/customer-app)
- Backend: `listFavouriteMerchants` and `listFavouriteVouchers` enriched with pagination, isOpen, avgRating, reviewCount, voucherCount, maxEstimatedSaving, isRedeemedInCurrentCycle; unavailable items included with status flag; sorted (open-first / suspended-last)
- API client (`src/lib/api/favourites.ts`): typed client with getMerchants, getVouchers, addMerchant, removeMerchant, addVoucher, removeVoucher
- Hooks: `useFavouriteMerchants`, `useFavouriteVouchers` (infinite queries), `useRemoveFavourite` (optimistic removal + undo)
- Components: FavouritesHeader (gradient, tab switcher with counts), MerchantFavCard, VoucherFavCard (pastel gradient per type), SwipeToRemove, NudgeBanner (free user subscribe prompt), FavouritesEmptyState (floating heart + discover CTA), FavouritesSkeleton
- FavouritesScreen: FlatList + swipe-to-remove, undo toast, pull-to-refresh, infinite scroll, tab persistence
- 23 component tests; 268 total frontend tests passing
- Plan: `docs/superpowers/plans/2026-04-19-favourites-screen.md`

### Phase 3C.1h — Profile Tab (IMPLEMENTED, awaiting page-review lock — branch feature/customer-app)
- ProfileHeader: completeness bar, initials avatar, subscription badge
- PersonalInfoSheet: read-only email/phone, editable name/DOB/gender
- AddressSheet, InterestsSheet, ChangePasswordSheet
- SubscriptionManagementSheet with cancel flow
- NotificationsSection: live email toggle + push stub
- AppSettingsSection: haptics, reduce motion, location access
- RedeemoSection: become merchant, request merchant, rate app, share
- GetHelpModal: ticket list, ticket detail, new ticket form
- SupportLegalSection, DeleteAccountFlow (2-stage OTP-gated deletion)
- EAS build config added (eas.json, app.config.ts, expo-build-properties, ITSAppUsesNonExemptEncryption)
- Pending: device review via EAS build

### Phase 3C.1i — QR Code Rendering (IMPLEMENTED, awaiting page-review lock — branch feature/customer-app)
- Backend: `GET /api/v1/redemption/me/:code` (customer self-lookup) + `POST /api/v1/redemption/:code/screenshot-flag` (dedup, pre-validation gate)
- `react-native-qrcode-svg`, `expo-brightness`, `expo-screen-capture`, `expo-blur` installed
- `formatCode()` + `codeAccessibilityLabel()` helpers (3+3 grouping for 6-char codes)
- `QRCodeBlock` shared component: Redeemo logo overlay, blur state, hero/compact sizes, a11y label
- `useRedemptionPolling`: 5s poll, stops on validated or 15min timeout
- `useBrightnessBoost`: captures and restores brightness, best-effort
- `useScreenshotGuard`: iOS screenshot listener + debounced flag API call; Android FLAG_SECURE
- `useAutoHideTimer`: dims QR after 2min inactivity, 10s warning, frozen when validated
- `ShowToStaff` rewritten: all 4 hooks, live QR, validated state, screenshot banner, auto-dismiss
- `RedemptionDetailsCard` rewritten: live poll via useQuery + useFocusEffect, QR pre-validation, validated timestamp post-validation
- `PulsingDot` design-system primitive (withRepeat stays inside design-system/motion/)
- `src/design-system/icons.ts` re-export barrel (satisfies no-barrel-lucide ESLint rule)
- 85 frontend tests passing; 264 backend tests passing; ESLint clean
- Spec: `docs/superpowers/specs/2026-04-22-qr-code-rendering-design.md`
- Plan: `docs/superpowers/plans/2026-04-22-qr-code-rendering.md`

### 🚀 v1.0 Customer Auth + Onboarding Baseline — LIVE on origin/main (2026-04-26)

The locked v1.0 customer auth + onboarding baseline (described in the section below) is now **on `origin/main`**. Local `main` and `origin/main` are aligned at merge commit `42f9768`. New feature branches must be created from updated `main` (not from the merged baseline branch).

**PR sequence that landed v1.0:**

1. **PR #6 (`chore/main-catchup`) — merged first** at `628d1e7`. Published a 34-commit pre-existing local-main backlog covering Phase 2C/2D/3B/3C backbone work that PR #5 depended on: 4 Prisma migrations (review-helpful, cycle-anchor-date, nullable-stripe-fields, onboarding-completion-flags), subscription-anchored cycles, alphanumeric redemption codes, savings/favourites/reviews endpoints, and 24 docs/specs.
2. **PR #5 (`feature/customer-auth-baseline`) — merged second** at `4932633`. Established the locked v1.0 baseline: 5 commits including B1–B8 customer-app baseline, W1–W3 customer-web mirror, raw-token cleanup, and two Critical fixes from code review (account-collision auto-delete removal + server-flag onboarding contract wiring).
3. **PR #7 (`chore/workspace-hygiene`) — merged third** at `42f9768`. `.gitignore` adds (`.claude/`, `.superpowers/`, `graphify-out/`, `docs/branding/`), 6 future-phase docs/specs published, 8 approved Prisma dev scripts published.

**Test baselines as of merge:** backend 285/285 (vitest), customer-app jest-expo 27+ on the modified suites passing in worktree (full suite still subject to the install-tree mismatch — see follow-ups). TypeScript clean across backend, customer-app, customer-web.

**Safety tags pushed to origin:** `baseline-v1.0-rc1` (= PR #5 head `7c3964d`), `main-pre-catchup` (= local main tip pre-publish `56d6903`), `main-pre-publish`. Merged branches retained on origin: `feature/customer-auth-baseline`, `chore/main-catchup`, `chore/workspace-hygiene`.

**PR scope verification rule (mandatory going forward):** before merging any PR, verify GitHub's *live* `compare` endpoint diff (commit count + file list) against expectation. PR-level cached fields (`gh pr view N --json commits/additions/changed_files`) are stale snapshots. Local `main` and `origin/main` can drift; that gap will be included in any PR off a head branch built on local `main`. See `feedback_pr_scope_verification.md` for the full pre-merge checklist.

### 🔒 Customer Flow — Locked Baseline v1.0 (locked 2026-04-25 → live on origin/main 2026-04-26)
The customer onboarding + auth + subscription flow is now locked **and live on `origin/main`**. Single source of truth for the as-built behaviour:

- **Current spec:** `docs/customer-flow-current.md` — versioned, status `Locked`, covers login, registration, email/phone verification, profile completion (PC1–PC4), onboarding success, subscription prompt, `resolveRedirect` rules, and free vs premium placeholder behaviour.
- **Change log:** `docs/customer-flow-changelog.md` — dated entries for every behaviour/logic/routing change. Visual styling iterations are NOT tracked here.

**Rules going forward:**
- Any change to the flows above MUST bump the version number at the top of `customer-flow-current.md` and add a dated entry in `customer-flow-changelog.md`.
- The §11 "Deviations from Initial Spec" table in the current spec is the canonical list of deltas against `docs/superpowers/specs/2026-04-10-customer-ux-foundations-design.md`. Update it when a deviation closes or a new one opens.
- Subscription prompt placeholder behaviour is locked: "Explore full access" → `Alert.alert('Coming soon', …)`, NO `markSubscriptionPromptSeen`, NO navigation. "Start with free access" is the only path that stamps the flag and routes to `/(app)/`. Do not collapse the two CTAs without a new design review.

### ✅ Phase 3C — Device Review / Reconciliation (COMPLETE — 2026-04-24)
Four-phase reconciliation pass against the approved specs after on-device review. Single ground-truth document captures every change, rationale, and file touched:
**Plan: `docs/superpowers/plans/2026-04-24-reconciliation-phases-1-4.md`** — finalised baseline, do not revert without new design review. (Now superseded as the forward-facing reference by `docs/customer-flow-current.md`; the reconciliation plan remains the historical record of Phases 1–4.)

Headline outcomes (full detail in the plan):
- **Phase 1 (app).** Routing now driven entirely by server `/profile`; `(auth)/_layout` re-evaluates `resolveRedirect` on every render; subscribe-prompt stamps `subscriptionPromptSeenAt`.
- **Phase 2 (web).** Register split into auth + profile + interests; login no longer blocks on unverified flags; `/verify` token flow added; `hydrateFromProfile` exposed in `AuthContext`.
- **Phase 3 (web).** `VerificationBanners` — soft amber (email, with Resend) + blue (phone) banners, sessionStorage dismissal, pathname-scoped.
- **Phase 4 (app + web).** Step auto-skipping via `firstIncompleteRequiredStep()`; canonical gender values (`female | male | non_binary | prefer_not_to_say`); retry-once + partial-save banner on web profile persistence; `SubscriptionNudge` component for non-subscribed web users.

**Locked intentional asymmetry (do not collapse):** DOB/gender/postcode optional on web, mandatory on app (PC1 + PC2). Phone required at web register but verified only in app. Email verification hard-blocks in app, soft banner on web. `onboardingCompletedAt` + `subscriptionPromptSeenAt` are app-driven only.

**Operating rule (historical, retained for future reconciliations):** no ad-hoc fixes — classify against spec → baseline → device behaviour, confirm priorities, implement in controlled batches. Per-issue template in the reconciliation plan.

Test baselines after Phase 4: backend 282/282, app 350/350 (jest-expo), web tsc clean.

### Customer app post-completion fixes (2026-04-23) — finalised baseline
These fixes were applied after Phase 3C.1i and are part of the working baseline. They are not provisional.

**Backend — Prisma Decimal serialization (impl bug, P1)**
- `src/api/customer/discovery/service.ts` — coerce `estimatedSaving` → `Number` on voucher detail (line ~550) and merchant profile vouchers (line ~430).
- `src/api/redemption/service.ts` — coerce `estimatedSaving` → `Number` on `redeem`, `listMyRedemptions`, `getMyRedemption`.
- Root cause: Prisma Decimal serializes as string in JSON; client types declare `number`; `.toFixed` crashed.

**Backend — Categories endpoint (impl bug, P1)**
- `src/api/customer/discovery/routes.ts` — `GET /api/v1/customer/categories` returns `{ categories }` wrapper (not bare array).
- `src/api/customer/discovery/service.ts` — `listActiveCategories` Prisma select includes `parentId` and `pinColour`.

**Frontend — Auth rebuild to v7 brainstorm (spec alignment)**
- `apps/customer-app/src/features/auth/screens/LoginScreen.tsx` — full rewrite: cream bg, small Redeemo logo, Apple/Google stubs, email + password (eye toggle), forgot-password link, gradient "Sign in" pill.
- `apps/customer-app/src/features/auth/screens/RegisterScreen.tsx` — full rewrite: name row, email, password with 4-segment strength bar, phone, marketing consent, terms.

**Frontend — Home CategoryGrid rebuild (spec alignment)**
- `apps/customer-app/src/features/home/components/CategoryGrid.tsx` — 3-col liquid-glass grid; `LinearGradient` tiles; inline SVG icons; palette + `pinColour` fallback; purple "More" tile; `FadeInDown` stagger.

**Frontend — Search rebuild (spec alignment)**
- `apps/customer-app/src/features/search/components/SearchBar.tsx` — red SVG search icon, subtle red border, stronger shadow, circular grey clear button.
- `apps/customer-app/src/features/search/components/TrendingSearches.tsx` — uppercase "TRENDING" + amber bolt; wrapping pill tags.
- `apps/customer-app/src/features/search/components/SearchResultItem.tsx` — white card 12r, gradient fallback avatar, 12px name, 10px meta, save pill + open dot.
- `apps/customer-app/src/features/search/screens/SearchScreen.tsx` — "Results for X" header with red `PulsingDot` + Loading text; card-style skeletons; empty state.

**Frontend — Subscription recognition (impl bug, P1)**
- `apps/customer-app/src/lib/api/subscription.ts` — `priceGbp: z.coerce.number()`. Prisma Decimal string was failing `z.number()` safeParse silently.
- `apps/customer-app/src/features/voucher/components/CouponHeader.tsx` — defensive `Number(estimatedSaving).toFixed(2)`.

**Frontend — Voucher detail + keyboard handling (impl bug, P1/P2)**
- `apps/customer-app/app/(app)/_layout.tsx` — `tabBarStyle: { display: 'none' }` on `voucher/[id]` and `merchant/[id]` so the sticky Redeem CTA is not hidden behind the 80px tab bar.
- `apps/customer-app/src/design-system/motion/BottomSheet.tsx` — listens to `keyboardWillShow/keyboardDidShow` and shifts `bottom: keyboardHeight`; sheet `zIndex: layer.overlay + 1` so the scrim (z=50) does not paint over the sheet when the keyboard lifts.
- `apps/customer-app/src/features/voucher/components/PinEntrySheet.tsx` — auto-submits on 4th digit; `submittedRef` dedup guard prevents duplicate fire; clears `digits` on sheet hide.

**Dev tooling scripts**
- `prisma/grant-dev-subscription.ts` — grants 1-year ACTIVE monthly subscription to `customer@redeemo.com`. Stripe-free (uses nullable Stripe fields). Run: `npx tsx prisma/grant-dev-subscription.ts`.
- `prisma/get-branch-pin.ts` — decrypts and prints branch PINs by merchant-name search. Run: `npx tsx prisma/get-branch-pin.ts "old foundry"`. Note: seed default PIN for all branches is `1234`.
- `prisma/set-auth-state.ts` — flips a user's verification flags + status to exercise login auth-error UX without real email/SMS/admin. Modes: `verified` (restore), `email-unverified`, `phone-unverified`, `inactive`, `suspended`. Run: `npx tsx prisma/set-auth-state.ts <email> <mode>`. Always restore with `verified` before moving on.
- `prisma/issue-reset-token.ts` — writes a real password-reset token into Redis (`pwd-reset:customer:<token>`) with configurable TTL so the reset-password flow can be tested without live email. Run: `npx tsx prisma/issue-reset-token.ts <email> [ttlSeconds=3600]`. Prints web + app deep links. For the expired/invalid path use any bogus token — Redis miss → `RESET_TOKEN_EXPIRED`.
- UI-only auth cases (no script needed): `EMAIL_ALREADY_EXISTS` → register with a seeded email; `PASSWORD_POLICY_VIOLATION` → register with a weak password; `RESET_TOKEN_EXPIRED` → open reset link with `?token=nope`.

### Pending local-only artefacts (2026-04-26) — not on main, not deleted

The following 5 artefacts intentionally stayed off `origin/main` during the v1.0 publish. They remain on disk in the working tree. Do not commit without refactor/review. Do not delete without owner approval.

**Untracked Prisma scripts** (will keep showing as `??` in `git status` until committed or deleted):
- `prisma/check-user.ts` — hardcoded to a personal email; refactor to take `<email>` as argv before publishing.
- `prisma/reset-user-password.ts` — hardcoded to a personal email + plaintext password (`Redeemo1!`). **Caught in PR #7 code review.** Functionality is already covered by `issue-reset-token.ts` + `set-auth-state.ts` — most likely action is delete with approval rather than refactor.
- `prisma/test-login.ts`, `prisma/test-session.ts` — one-off auth/session probes from earlier scaffolding. No documentation, no clear ongoing utility. Decision pending: refactor + document, or delete.

**Git stash — discovery merchant phone/email privacy review**

On the project owner's local clone there is a stash labelled `discovery: drop merchant phone/email from customer-facing select — pending privacy review`. It contains a 1-line removal from the Prisma `select` in `getCustomerMerchant` (`src/api/customer/discovery/service.ts` ~line 331). Treat as **pending merchant/API privacy review, NOT part of the v1.0 baseline.** Three viable interpretations: (a) intentional privacy fix → small follow-up PR with a test pinning the new behaviour; (b) accidental deletion → drop the stash; (c) in-progress refactor → keep stashed. Do not auto-classify — ask the owner before acting. (Two older unrelated stashes also exist on the owner's clone from prior sessions — leave them alone.) Note: stashes are local-only and don't replicate to origin, so any specific stash index is owner-machine-specific; identify the stash by its label, not by `stash@{N}`.

**Workspace hygiene gitignored dirs** (still on disk, just not in `git status`): `.claude/`, `.superpowers/`, `graphify-out/`, `docs/branding/`. The last one is 556 MB of brand assets and remains gitignored pending a decision on whether to move to S3/R2 or use Git LFS.

### 🔲 Next planned work (post-v1.0 baseline)

1. **Claude Code workflow hooks for scope discipline** — first deliverable. Set up before any feature work to prevent the kind of PR scope drift hit during PR #5 prep (initially showed 42 commits because origin/main was 34 commits behind local main). See `feedback_pr_scope_verification.md` in memory.
2. **Phase 3C.1b — Home / Discovery / Map.** Plan: `docs/superpowers/plans/2026-04-17-customer-app-home-discovery-map.md`. Implementation already exists on `feature/customer-app` (the source branch with all 3C.1b–3C.1i work) — but a fresh branch must be created off updated `main` and the screens re-baselined surface-by-surface, the same way Phase 3C.1a was. **Do NOT continue work on the merged `feature/customer-auth-baseline` branch.**

### 🔲 Phase 3C — explicitly deferred items
- **Subscribe purchase flow** — iOS requires Apple IAP (Stripe cannot be used inside iOS app). Android could use Stripe or Google Play Billing. Deferred pending IAP decision. Placeholder screen exists at `subscription-prompt` (renamed from `subscribe-prompt` in PR #5; the locked CTA contract — alert-only premium, stamp+nav free — is preserved).

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

## Worktree CLAUDE.md Rule

**Single source of truth:** Root `CLAUDE.md` only. Every worktree must symlink to it — never copy.

`.worktrees/` is gitignored, so symlinks are local-only. Recreate after any worktree teardown:
```bash
rm -f .worktrees/customer-app/CLAUDE.md && ln -s ../../CLAUDE.md .worktrees/customer-app/CLAUDE.md
```

For any new worktree at `.worktrees/<name>/`:
```bash
rm -f .worktrees/<name>/CLAUDE.md && ln -s ../../CLAUDE.md .worktrees/<name>/CLAUDE.md
```

## Workflow Hooks (v1 — high-risk Git rules only)

Project-level Claude Code hooks at `.claude/settings.json` + `.claude/hooks/pre-bash/01-git-safety.sh` enforce a small set of high-risk Git rules inside the Bash tool. The hook runs as a `PreToolUse` step on every Bash invocation; it inspects the command, then either blocks (exit 2 with an instructive message) or allows (exit 0, optionally with a stderr warning).

**Blocked commands:**

| Pattern | Override |
|---|---|
| `git add . / -A / --all / *` | (no override — use explicit paths) |
| `git push origin main` (any refspec where destination is `main`) | (no override — open a PR via `gh pr create`) |
| `git push --force` / `-f` (without `--force-with-lease`) | (no override — use `--force-with-lease`) |
| `git reset --hard` | `REDEEMO_CONFIRM_HARD_RESET=1` |
| `git clean -f / -d / -x / --force` | `REDEEMO_CONFIRM_GIT_CLEAN=1` |
| `git checkout … -- <paths>` / `git restore <paths>` against a dirty working tree | `REDEEMO_CONFIRM_DISCARD=1` (added 2026-04-26 after the v7 UI loss incident — see "Incident" below) |
| `gh pr merge` without scope verification | `REDEEMO_PR_SCOPE_VERIFIED=<head-sha>` (run `gh api compare` first; the env var binds to the PR's current head SHA so the gate re-blocks if a new commit lands between verification and merge) |

**Warned (printed to stderr, not blocked):**

- `npm install` — `package-lock.json` may change; verify diff before staging
- `git commit` with > 30 files staged — confirm scope before committing
- `git push` when local `main` is ahead of `origin/main` — those commits will ride along on a feature branch built off local main; verify scope via `git log --oneline origin/main..HEAD`

**Override usage:**

Set the named env var on the same command line as the blocked command, never as a session-level export:
```bash
REDEEMO_CONFIRM_HARD_RESET=1 git reset --hard origin/main
REDEEMO_PR_SCOPE_VERIFIED=$(gh pr view 5 --json headRefOid --jq .headRefOid) gh pr merge 5 --merge
```

For per-user persistent overrides (rare), edit `.claude/settings.local.json` (gitignored) — never disable the shared `.claude/settings.json` without owner approval.

**Dependencies:** the hook script requires `jq` (macOS Homebrew default) plus `git` and `gh` (already required for project workflow). If `jq` is missing the hook prints a one-line warning and no-ops.

**Updating hooks:** changes to `.claude/settings.json` or `.claude/hooks/**` go via PR like any other code. v1 covers only the high-risk rules above; pre-commit / pre-push / pre-merge full checklists and session-start checks are deferred to future PR B and PR C.

### Incident: v7 UI loss + recovery (2026-04-26)

The v7 auth/onboarding/subscription redesign was developed iteratively in `.worktrees/customer-app/` and existed only as uncommitted changes. A later cleanup (`git checkout HEAD -- src tests app`) intended to revert unrelated test-overlay residue also wiped that uncommitted v7 work. Recovered via deterministic transcript replay (PR #10 + PR #11 into `feature/customer-app`); owner-verified on-device.

**Root causes:**
- Significant work existed only as uncommitted changes — no checkpoint commit, no stash.
- Conversation compaction summary referenced the work in past tense as if completed; subsequent agents trusted that framing without verifying against `git status`.
- The destructive `git checkout HEAD -- <paths>` was not blocked by hooks at the time, despite having equivalent destructive power to `git reset --hard` on a dirty working tree.

**Hard rules going forward (also apply to humans, not just AI):**
1. **Before ANY destructive command** (`reset --hard`, `checkout … -- <paths>`, `restore <paths>`, `clean -f`, `stash drop`, branch switch with dirty tree), run `git status --short` in the target directory and classify every entry. Do not run the command until each entry is either intended-to-discard or preserved (commit / stash / copy).
2. **Compaction summaries are hypotheses, not facts.** "We did X" describes the conversation, not the repository. Verify with `git log --all -- <path>` before assuming X is in a commit.
3. **Worktree state is per-worktree.** `git status` in the main checkout says nothing about `.worktrees/<name>/`. Always check the right working tree.
4. **Work is "done" only when it's in a commit or PR** — never when it's only on disk.

The `git checkout … -- <paths>` / `git restore <paths>` block (with `REDEEMO_CONFIRM_DISCARD=1` override) was added to the workflow hooks specifically to catch this class of incident.

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

**Customer-app tests (jest-expo) — run from within the worktree app directory:**
```bash
cd /Users/shebinchaliyath/Developer/Redeemo/.worktrees/customer-app/apps/customer-app
npx jest --forceExit
```
After moving off iCloud and switching to Node 20.19.4, jest-expo runs normally from Claude Code's Bash tool (~8–10s for full suite). Use `--forceExit` to avoid open-handle hangs from React Query + fake timer combinations. Babel cache at `/tmp/jest-redeemo-customer-app` (cold build is fast now). Node version: use `fnm use` or ensure Node 20.19.4 is active (`.nvmrc` is pinned at worktree root).

---

## Key Files

| File | Purpose |
|---|---|
| `docs/customer-flow-current.md` | 🔒 Customer flow locked baseline (v1.0) — login, register, verification, PC1–PC4, onboarding success, subscription prompt, `resolveRedirect`, free vs premium placeholder |
| `docs/customer-flow-changelog.md` | Customer flow change log — dated behaviour/logic/routing changes |
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
| `docs/superpowers/specs/2026-04-22-qr-code-rendering-design.md` | QR code rendering UX spec |
| `docs/superpowers/plans/2026-04-22-qr-code-rendering.md` | QR code rendering implementation plan |
| `docs/superpowers/plans/2026-04-24-reconciliation-phases-1-4.md` | Phase 3C reconciliation (Phases 1–4) — finalised baseline: routing, verification, gender normalisation, subscription nudge |
| `apps/customer-web/components/layout/VerificationBanners.tsx` | Soft email + phone verification banners for web (Phase 3) |
| `apps/customer-web/components/layout/SubscriptionNudge.tsx` | Soft subscription nudge for non-subscribed web users (Phase 4) |
| `apps/customer-app/src/lib/routing.ts` | `resolveRedirect` + `firstIncompleteRequiredStep` — single source of routing truth |
| `apps/customer-app/src/features/profile-completion/hooks/useProfileCompletion.ts` | Step auto-skipping via `nextRouteAfter` (Phase 4) |
| `apps/customer-app/src/design-system/icons.ts` | Lucide icon re-export barrel (avoids barrel import ESLint rule in components) |
| `apps/customer-app/src/design-system/motion/PulsingDot.tsx` | Pulsing dot animation primitive (withRepeat lives only in design-system) |
| `apps/customer-app/src/features/voucher/components/QRCodeBlock.tsx` | Shared QR code component (hero + compact, blur state, a11y label) |
| `apps/customer-app/src/features/voucher/hooks/useRedemptionPolling.ts` | Poll for validation status (5s interval, 15min timeout, stops on validated) |
| `apps/customer-app/src/features/voucher/hooks/useAutoHideTimer.ts` | Auto-hide QR after 2min inactivity, 10s warning, frozen when validated |
| `apps/customer-app/eas.json` | EAS build config (development/preview/production profiles) |

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)

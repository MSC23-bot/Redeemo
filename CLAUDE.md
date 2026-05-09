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

### ✅ Phase 3C.1c (M1) — Voucher Detail view-only rebaseline (LIVE on origin/main 2026-05-06, merge `b93ef9c`)

PR #40 ported the M1 view-only Voucher Detail surface from the `feature/customer-app` reference branch onto current `main` (branch-aware, post-merchant-profile-track). 24 implementation rounds + the post-PRODUCT.md cleanup. Locked design baseline matches the v4 mockup at `.superpowers/brainstorm/88554-1776435672/content/voucher-detail-v4.html`.

What shipped:
- Route + screen: `app/(app)/voucher/[id].tsx` registered as `Tabs.Screen` with `href: null` + `tabBarStyle: display:none` (mirrors `merchant/[id]`); `VoucherDetailScreen.tsx` orchestrator (789 lines).
- 10 components: CollapsedHeader, CouponBody, CouponHeader, HowItWorks, MerchantRow, PerforationLine, RedeemCTA, RedeemedBadge, SubscriptionPromptModal, TimeLimitedBanner.
- 2 hooks: `useCustomerVoucher` (voucher fetch — branch-context-free per §11), `useTimeLimited` (M1 stub — see §O1).
- API client + Zod: `lib/api/voucher.ts` with branch-attribution-aware schemas.
- 12-state derivation: loading / error / free-user / can-redeem / redeemed-this-cycle / expired / time-limited × 3 / branch-error variants. `branchReady` gate on active CTAs; `MerchantRow` "Resolving branch…" placeholder for the in-flight window.
- Branch attribution per §11 (locked): voucher merchant-wide; redemption branch-attributed; URL-driven `?branch=<id>` flows merchant-profile → voucher-detail; `useMerchantProfile(voucher.merchant.id, { branchId })` keys cache by branch.
- URL-driven back navigation: `from`, `returnMerchantId`, `branch`, `tab` params; `buildReturnUrl` does NOT depend on voucher/merchant queries having resolved.
- Free-user conversion flow (round 16): `SubscriptionPromptModal` replaces the deleted `FreeUserGateModal`. Sticky free-user CTA "Subscribe to Redeem · £6.99/mo" routes to `/(auth)/subscription-prompt` with full return context. Plan-pre-pick (annual / monthly) carries through.
- Voucher-origin subscription routing (rounds 20–21): `SubscribePromptScreen` honours `source=voucher&plan=<plan>&returnVoucherId&branch&returnMerchantId&tab` — initialises the plan selector, swaps CTA copy ("Continue with Annual" / "Continue with Free Account"), routes the secondary CTA back to the exact voucher detail page rather than dumping the user on Discovery.
- Suppression flag (round 22): `Continue with Free Account` returns to voucher with `?suppressSubscribePrompt=1`; voucher-detail reads it and skips the auto-modal so the user isn't nag-looped after a deliberate free-pick.
- Delayed auto-modal (round 22 part 5): `SUBSCRIPTION_PROMPT_DELAY_MS = 800ms` setTimeout inside an effect with full cancellation paths (blur, dismiss, sub state change, suppression). Two-layer gate: `modalReady` (timer fired) AND every scheduling guard still holds.
- How It Works section (rounds 17–19): 5 steps both subscribed + free variants; tappable card; default expanded (free) vs default collapsed (subscribed).
- Round-13 impeccable critique pass: em dashes out of UI text (period or comma instead), tinted-warm whites for nested cards, banner empty-state, spacing rhythm.
- §O7 branch-race fix (round 23): `MerchantProfileScreen.handleVoucherPress` reads branch id from URL via `useBranchSelection().branchId`, falling back to `merchant.selectedBranch?.id` only on cold-open. Removes the `keepPreviousData` stale-branch race when a user taps a voucher within ~1s of switching branches. Pre-existing bug (since PR #33), shipped inside PR #40 because PR #40 makes the voucher URL branch param load-bearing for redemption attribution.
- Round 24 hygiene: `PRODUCT.md` (impeccable design-skill local context file) untracked + added to `.gitignore` alongside `DESIGN.md`. Same category as `.claude/`, `.superpowers/`, `graphify-out/`, `docs/branding/`.
- Post-merge symmetric fix (PR #41, merge `234e9e8`, 2026-05-06): `VoucherDetailScreen.buildSubscriptionUrl` now sources the return-URL `branch` from URL `branchIdParam` first, falling back to `selectedBranch?.id` only on cold-open. Closes the symmetric race to §O7 — the free-user sticky CTA + modal plan buttons can fire while merchantQuery is still in flight, and without this fix the URL would omit `branch=` entirely, breaking the `Continue with Free Account` round-trip + the `suppressSubscribePrompt=1` contract.

Test counts at merge: customer-app jest **394/394** across 48 suites covering voucher/merchant/subscribe/guards/voucher-api (10s); backend vitest discovery.voucher-detail **10/10** (449ms); `tsc --noEmit` clean.

Deferred from M1 (tracked in `project_deferred_followups_index.md`):
- §N10 + §N8 — native iOS edge-swipe-back: `voucher/[id]` is a `Tabs.Screen`; restoring native swipe-back requires moving both `voucher/[id]` AND `merchant/[id]` into a Stack/native-stack flow together. Tier 2/3 navigation workstream, design-together with future tab-swipe / gesture arbitration.
- §N11 — broader branch-switch perceived-lag UX (`keepPreviousData` shows OLD branch until refetch lands; voucher detail's loading-gate ignores `merchantQuery.isLoading`). Tier 1/2 owner-direction follow-up.
- §O1 — TIME_LIMITED proper availability windows (M1 stub; needs backend `availableFrom`/`availableUntil`).
- §O3 — `Change ▾` Unicode glyph → chevron icon polish.
- §O4 — Voucher favourite toggle wiring (M1 fires `Alert("Coming next milestone")`).
- §O5 — VoucherDetailScreen decomposition only if M2/M3 grow it past ~600 lines.
- §O6 — Already-Redeemed full surface (M2/M3, backend dep on `lastRedeemedAt`, `redemptionCode`, `availableAgainAt`).

PRs landed: #40 (24 implementation rounds + post-PRODUCT.md cleanup, merge `b93ef9c`, 2026-05-06); #41 (post-merge symmetric `buildSubscriptionUrl` branch-source fix, merge `234e9e8`, 2026-05-06).

Plan: `docs/superpowers/plans/2026-05-06-voucher-detail-redemption-rebaseline.md` (M1/M2/M3 milestones; "As shipped" addendum at §M1.1 captures the rounds 13–24 conversion-flow expansion).

Spec reference: `.superpowers/brainstorm/88554-1776435672/content/voucher-detail-v4.html` (locked v4 mockup) + the inline §11 branch-attribution contract in the plan doc.

### ✅ Phase 3C.1c (M2) — Voucher Detail Redemption flow (LIVE on origin/main 2026-05-07, merge `aea73f4`)

PRs #43 → #44 → #45 → #46 closed M2 end-to-end. Four waves:
- **PR #43 (backend, merge `8822458`)** — 12-step safe guard order in `createRedemption` + race-safe atomic claim using `prisma.$transaction` with cross-transaction P2002 retry. Backend now returns `remainingAttempts` / `retryAfter` on PIN failure + lockout payloads.
- **PR #44 (frontend M2 Section B, merge `c233f04`)** — PinEntrySheet → useRedeem → SuccessPopup → state-3 surface, all per the M2 plan. SuccessPopup "Show to Staff" + RedemptionDetailsCard "Show to Staff again" both fire deferral alerts pointing at M3.
- **PR #45 (PIN defensive fixes, merge `40d1f9f`)** — defensive INVALID_PIN fallback when backend doesn't return structured `remainingAttempts` payload; `textContentType="none"` to suppress iOS one-time-code autofill stealing focus; non-PIN backend errors visible to users (PIN_NOT_CONFIGURED, BRANCH_UNAVAILABLE, BRANCH_MERCHANT_MISMATCH, PHONE_NOT_VERIFIED, SUBSCRIPTION_REQUIRED, VOUCHER_NOT_FOUND).
- **PR #46 (device-QA follow-ups, merge `aea73f4`, 2026-05-07)** — eight functional/copy/layout decisions from on-device QA. The functional + product-clarity items closed in this PR; the visual + microcopy redesign is the deferred §S design pass.

What ships on M2 (locked):
- **Already-redeemed safety hard-block** — branch picker / "Change ▾" pill / Redeem CTA all hard-blocked at three layers (MerchantRow `disableChangeBranch` + `handleChangeBranch` early-return + `handlePickerConfirm` defensive twin). Once redeemed, the user cannot reopen the redemption flow until the cycle rolls over.
- **Redemption code format** — 8-char uppercase A–Z + 0–9 minus O,I, displayed 4+4 (e.g. `A7K2 P9X4`). Backend alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ0123456789` (34 chars). 34^8 ≈ 1.79 × 10^12 combinations; `redemptionCode @unique` constraint backstops collisions. Reason: 10-char mixed-case codes were too long, mis-readable when staff transcribe them onto bills, and easily confused (O/0, I/1).
- **URL-first display branch resolver** — `displayBranch = pickerConfirmedBranchId ?? branchIdParam ?? selectedBranch?.id` with an `isActive` gate at all three resolution paths. Closes a stale-branch flash + an alarming "Resolving Branch…" CTA that shipped in PR #44.
- **Branch picker change vs redeem intent** — `BranchPickerSheet` gains an `intent: 'change' | 'redeem'` prop. Title + CTA copy swap. `handlePickerConfirm` branches: change-intent updates branch only; redeem-intent confirms branch then opens PIN sheet.
- **Race-safe back navigation after branch change** — voucher detail tracks `changedBranchOnVoucherId: string | null` (synchronous local state, not URL). `handleBack` reads `changedBranchOnVoucherId ?? params.branch`. Merchant Profile receives `?branchChanged=1`, fires `BranchSwitchToast`, scrubs the param via `router.replace`.
- **Branch picker ordering** — selected/current first, then active branches sorted by distance, then unknown-distance branches last. Inactive branches gated out. `previewId` normalised to null when `currentBranchId` not in passed branches.
- **`availableAgainAt` payload + CycleRulesCard** — backend `getCustomerVoucher` returns `availableAgainAt` (ISO string) for ACTIVE/TRIALLING subs, computed from `getCurrentCycleWindow(cycleAnchorDate, now).cycleEnd` (en-GB / Europe/London). Customer-app: `voucherDetailSchema.availableAgainAt: z.string().nullable()`. CycleRulesCard renders state-aware copy with prominent date in brand-rose tinted block:
  - Pre-redemption: "Use this voucher once during your current cycle. After you redeem it, it will refresh on the renewal date shown below."
  - Post-redemption: "You've used this voucher for your current cycle. It will be ready to use again on the renewal date shown below."
- **VoucherTypeExplainerCard (renamed from `AboutThisOfferCard`)** — collapsible (default collapsed), per-type title ("What is a BOGO voucher?" / "What is a Discount voucher?" / etc.) sourced from `productCopy.voucherTypeExplainerTitle(type)` + `voucherTypeExplainer(type)`.
- **"How redemption works" rename** — was "How It Works". Title only; default-expanded for free users, default-collapsed for subscribed.
- **Auto-scroll on collapsible expand** — both VoucherTypeExplainerCard and HowItWorks call `onExpand(layoutY)`; `VoucherDetailScreen.handleCardExpand` calls `scrollViewRef.scrollTo({ y: cardY - 80, animated: true })` deferred via `requestAnimationFrame` so the body doesn't sit underneath the sticky bottom CTA.
- **Layout reorder by state — locked DOM order:**
  - **Redeemed:** hero → RedemptionDetailsCard → CycleRulesCard → coupon body → MerchantRow (`mode='redeemed-known'` showing "REDEEMED AT <branch>" if known, OR `mode='redeemed-unknown'` neutral wording when not known) → VoucherTypeExplainerCard → HowItWorks.
  - **Non-redeemed:** hero → coupon body → CycleRulesCard → MerchantRow (`mode='redeem'` with "Change ▾" pill if multi-branch) → VoucherTypeExplainerCard → HowItWorks.
- **MerchantRow `mode` prop** — `'redeem' | 'redeemed-known' | 'redeemed-unknown'` driving copy + Change-pill suppression.
- **"Saved up to" past-tense copy + corrected disclaimer** on post-redemption RedemptionDetailsCard.
- **16pt card spacing standardization** — all card-level top margins normalised to 16pt for consistent rhythm.
- **Em-dash sweep** on customer-facing copy (productCopy.ts BOGO + REUSABLE bodies, CycleRulesCard, voucher-detail surfaces). Negative-pin tests in `product-copy.test.ts`.
- **M2 ships immediate-after-redemption RedemptionDetailsCard ONLY** — driven by in-memory `lastRedemption` from the redeem mutation response. Return visits during the active cycle currently see only the RedeemedBadge + disabled CTA. Persisted return-visit RedemptionDetailsCard remains deferred (§P2 — needs `redemptionCode` / `redeemedAt` / `branch` fields on the voucher payload).
- **QA-only reset-cycle dev script** — `prisma/reset-qa-redemption-cycle.ts` (default scope: `customer@redeemo.com` + 3 seeded Covelum/Kovalam vouchers; override via `--email` / `--voucherId`).

Test counts at PR #46 merge: backend vitest 483/483; customer-app jest 792/793 (1 pre-existing baseline failure on `tests/lib/api/profile.test.ts`); `tsc --noEmit` clean.

Plan: `docs/superpowers/plans/2026-05-06-voucher-detail-redemption-rebaseline.md` §M2.1 (full as-shipped contract).
Spec: `docs/superpowers/specs/2026-04-17-voucher-detail-redemption-design.md` §5.5 / §6.7 / §8.9 (shipped-state deltas).

### ✅ Phase 3C.1c (M3) — ShowToStaff + QR + anti-fraud + persisted return-visit (LIVE on `feature/voucher-m3-show-to-staff`, awaiting merge)

22 commits across 5 milestones (M3a backend → M3b building blocks → M3c anti-fraud → M3d wiring → M3e docs/spec consistency). Owner-locked decisions D1-D10 + post-implementation owner clarifications all encoded.

What ships on M3 (locked):

- **ShowToStaff full-screen surface** reachable from BOTH SuccessPopup (just-redeemed) AND RedemptionDetailsCard (return visit during active cycle). M2's `Alert.alert('Show to Staff', '…ships in next milestone')` stub is gone.
- **Backend additive:** `RedemptionScreenshotEvent` Prisma model + migration, `flagRedemptionScreenshot` service with Redis SETNX 5s dedup, `getMyRedemptionByCode` customer self-lookup, two new customer routes (`GET /redemption/me/:code` + `POST /redemption/:code/screenshot-flag`), `getCustomerVoucher` payload extension with cycle-window-gated `lastRedemption` block.
- **QR payload format:** opaque 8-character redemption code only (e.g. `A7K2P9X4`). NO public validation URL. Self-validation loophole NOT possible — customer-side `me/:code` is read-only customer-JWT-scoped; staff `verify` route requires merchant/branch auth that customers cannot reach.
- **Building blocks:** PulsingDot (design-system, additive testID/style props), QRCodeBlock (logo overlay + blurred state with anti-fraud invariant — QR child NOT rendered when blurred), useRedemptionPolling (5s/15min budget + enabled/paused flags), useBrightnessBoost (best-effort capture/restore), useAutoHideTimer (2min idle / 10s warning / freeze-on-validated), **useScreenCaptureProtection** (cross-platform prevent/allow lifecycle — Android FLAG_SECURE + iOS 11+ recording-blur — shared between ShowToStaff, SuccessPopup, and Voucher Detail when the code is visible), **useScreenshotGuard** (iOS post-fact screenshot listener + 5s client dedup + best-effort backend telemetry + ref-pattern callback stability — installed by both ShowToStaff AND Voucher Detail when the code is visible; SuccessPopup intentionally does NOT install the iOS listener since it's a short-lived popup).
- **Screen-capture model — platform asymmetry, locked framing (extended 2026-05-08 to add iOS screen-recording prevention).**
  - **Android**: `preventScreenCaptureAsync()` enables `FLAG_SECURE` system-wide. Blocks BOTH screenshots AND screen recordings; recents previews go black; recordings capture a blank frame.
  - **iOS — TWO complementary paths**:
    - (a) **Screen recording / mirroring**: `preventScreenCaptureAsync()` (iOS 11+) — system observes `UIScreen.isCaptured` and overlays the captured view with a blurred snapshot. Active screen recordings + AirPlay/screen-mirroring sessions capture a blurred view, NOT the QR. Closes the recording-and-replay fraud vector.
    - (b) **Screenshots — DETECT-AND-REACT ONLY**. Apple does not expose any screenshot-prevention API. `addScreenshotListener` fires AFTER the screenshot has been written to Photos. The captured image WILL contain the unblurred QR + 8-char code; the blur paints post-fact. Banner copy: *"Screenshot detected. Staff verify only the live screen. Tap the QR to show again."* The user-visible trust signal on iOS is the **live screen itself** (animated gradient border, pulsing LIVE dot, ticking en-GB London datetime, validated chip transition) — a static screenshot freezes all of these and trained staff can spot it.
  - **Never describe iOS screenshots as "prevention"** in spec, plan, PR description, marketing, or in-app copy. The screenshot path is post-fact mitigation, not prevention. iOS recording IS prevention via system blur. Locked at deferred-followups §AB / §AE.
- **SuccessPopup anti-fraud parity (added 2026-05-08).** Show-to-Staff has live trust signals; the SuccessPopup ALSO displays the redemption code, so it now has parity:
  - Live ticking timestamp ("Live: 08 May 2026 · 14:24:38") in the proof area, RIGHT NEXT TO the code (so a screenshot can't crop one without the other). Updates every 1s, including under reduced motion (it's a trust signal, not decorative motion).
  - Static "Redeemed on" receipt-style row replaces the previous separate Date + Time rows.
  - Header subtitle: *"Staff verify on the live Show to Staff screen"* (replaces *"Show this to staff to claim your discount"* — old framing read like the popup itself was the proof).
  - **Screen-capture protection while visible** via the shared `useScreenCaptureProtection` hook. Android FLAG_SECURE blocks screenshots + recordings; iOS 11+ overlays a blurred snapshot during active recording / mirroring. SuccessPopup intentionally does NOT install the iOS post-fact screenshot listener — it's a short-lived popup. (The iOS listener IS installed on both Show-to-Staff AND Voucher Detail when the code is visible — see §AE6.2 below for the Voucher Detail wiring added in wave 2.) Locked 2026-05-08, PR #49 final wave.
  - Cross-ref deferred-followups §AE: stronger anti-fraud options (QR hidden by default, tap-to-reveal, rotating QR, merchant policy) deferred to v2 product brainstorm.
- **AppState backgrounding contract (locked plan §Backgrounding):** surface stays mounted across background → foreground; polling/timer/brightness all pause/resume cleanly. Polling 15-min budget DOES count backgrounded time; auto-hide 2-min idle does NOT.
- **Validated transition:** `successHaptic()` + green-tinted "Verified by staff at <branch>" badge + 2s auto-dismiss → onDone. Reduced motion routes through onDone instantly.
- **Two kill-switches** (post-implementation owner clarifications): `BRIGHTNESS_BOOST_ENABLED` and `SCREENSHOT_GUARD_ENABLED` consts at the top of `ShowToStaff.tsx`. Default `true`. Flip to `false` to ship a build that disables the respective hook entirely without affecting QR/manual code/polling/auto-hide/AppState wiring. Owner-approved fast-remediation paths if device QA surfaces instability.
- **Persisted return-visit RedemptionDetailsCard** (closes §P2 for current cycle): `voucher.lastRedemption` payload (cycle-window gated) drives the card on app relaunches and React Query cold-cache opens. Dual-source `displayRedemption`: in-memory `lastRedemption` PRIMARY (just-redeemed); `voucher.lastRedemption` FALLBACK (return visits). RedemptionDetailsCard's "Show to Staff" button is now LIVE (no longer stubbed) — testID `redemption-details-show-to-staff` (was `…-stub`); accessibility label drops the next-milestone suffix.
- **§Q6 cycle-rollover invariant pinned:** the load-bearing gate is `stateKey === 'redeemed-this-cycle'` (driven by `voucher.isRedeemedThisCycle`), NOT `lastRedemption` data presence. Pinned by 4 phases in `voucher-detail-redeem-flow.test.tsx` (current cycle / rolled-over / defensive drift / negative defense). Defensive drift is the critical pin.
- **Validated pill** (`Validated by staff` green): renders on RedemptionDetailsCard when `voucher.lastRedemption.isValidated === true`. Surfaces on return visits so the user doesn't need to reopen Show-to-Staff for status.
- **customerName="" §U1 lock:** ShowToStaff suppresses the "Customer" info-row when name is empty. Forward-compat: passing a real first-name + last-initial renders the row. Tracked as §U1 deferred follow-up — pick up after merchant-portal validation surfaces (§R4) lock.
- **§AE Presentation-window gate (locked 2026-05-08, refined wave 8 2026-05-09 — final shipped state).** The redemption code + QR + Show-to-Staff CTA on Voucher Detail are LIVE for **2 hours** after `redeemedAt`. After the window closes — OR once staff has validated — Voucher Detail FULLY HIDES the code surface (no QR, no manual code, no "for your records" text) and the inner notice card (§AE5 below) takes its place. The hero seal + washed-out treatment now appear IMMEDIATELY on redemption (not only after the window expires) so the user gets instant visual confirmation. Hook design is **setTimeout-at-expiry** (single timer fires once at the boundary), NOT polling — backgrounding-safe, JS-thread-light. Defense-in-depth: handler-side guard (`if (blockShowToStaffMount) return` in `VoucherDetailScreen.onShowToStaff`) refuses to mount ShowToStaff once the code surface has collapsed. The two booleans are intentionally separate — `showRedeemedSeal` (visual, immediate on redemption) vs `blockShowToStaffMount = isRedeemed && (!isPresentationActive || isRedemptionValidated)` (handler guard, only when code surface is hidden) — so the in-window Show-to-Staff button stays clickable while the seal still surfaces. Constant: `PRESENTATION_WINDOW_MS = 2 * 60 * 60 * 1000` in `apps/customer-app/src/features/voucher/utils/presentationWindow.ts`. The full polished SVG circular stamp + washed-out coupon visual treatment + merchant-profile redeemed-card + Profile → Redemption History full surface + backend `presentationExpiresAt` mirror are all DEFERRED to §Q1 / §AF — M3 ships the rustic-stamp seal + inner notice card + opacity treatment as the working stop-gap. Pinned by 16 unit tests on the helper/hook (`presentationWindow.test.ts`) + state-machine tests on the card + screen-level §AE pins. §Q6 cycle-rollover invariant (load-bearing gate is `voucher.isRedeemedThisCycle`, NOT `lastRedemption` data presence) remains intact through the window flip.
- **§AE6 Screen-capture protection on Voucher Detail (locked 2026-05-08, PR #49 review wave 2).** The persisted RedemptionDetailsCard surfaces the redemption code on return visits during the 2-hour window. To enforce the locked rule "any surface that displays the redemption code or QR must have screen-capture protection active", `VoucherDetailScreen` now installs `useScreenCaptureProtection(codeVisibleOnVoucherDetail)` where `codeVisibleOnVoucherDetail = stateKey === 'redeemed-this-cycle' && hasRedemption && isPresentationActive && !isRedemptionValidated`. Mirrors the card's `showCodeSurface` gate so prevention lifts the moment the code surface collapses (boundary expiry OR validation transition). Cleanup releases prevention so other screens record normally afterwards. Pinned by 6 §AE6 cases in `voucher-detail-redeem-flow.test.tsx` (in-window prevent, out-of-window no-prevent, validated no-prevent, non-redeemed no-prevent, unmount-allow, loading no-prevent).
- **§AE6.2 iOS post-fact screenshot detection on Voucher Detail (locked 2026-05-09, PR #49 device QA wave 2).** Apple has no SDK to PREVENT iOS screenshots — `preventScreenCaptureAsync` only blanks recordings, not screenshots. To match Show-to-Staff's behaviour (the locked product expectation), Voucher Detail now also installs `useScreenshotGuard` when the code is visible. On iOS screenshot fire: posts telemetry (`redemptionApi.postScreenshotFlag(code, 'ios')`) and surfaces a screen-level banner *"Screenshot detected. Staff verify only the live screen."* (testID `voucher-detail-screenshot-banner`). Banner auto-dismisses after 4 seconds, OR immediately when the code surface collapses (window expiry / validation / unmount). Listener install gated on the same `codeVisibleOnVoucherDetail` boolean as the prevention hook. Android skips this hook (FLAG_SECURE blocks screenshots before they happen — no after-the-fact event to listen for). 9 new §AE6.2 pins in `voucher-detail-redeem-flow.test.tsx`. Cross-ref §AB locked iOS framing — the captured photo still contains the unblurred code; the banner + telemetry are post-fact mitigations, NOT prevention.
- **§AE5 user-facing helper copy (locked 2026-05-08, refined 2026-05-09 from PR #49 device QA waves 3+4).** Calm copy + visual treatment on the redeemed-state surface so the disappearing code never feels broken:
  - **In-window helper line**, near the Show-to-Staff CTA: *"Available to show staff until \<D Mon, HH:mm\>."* (e.g. *"Available to show staff until 9 May, 00:55."*). **Display timezone: DEVICE-LOCAL** (locked 2026-05-09 wave 4 — was Europe/London; switched to local for consistency with the Date/Time info rows on the same card so a Qatar user sees ONE consistent timezone throughout. Math is absolute milliseconds — `redeemedAt + PRESENTATION_WINDOW_MS` — so calculation correctness is independent of display TZ). Date is always included so cross-midnight expiry can never be confused with the same-clock-time on the redeemed day. Defensive fallback to *"You can show this code to staff for 2 hours after redeeming."* on malformed ISO. testID `redemption-details-availability-helper`. Hermes-robust formatter (`formatExpiryLine`) uses `Intl.DateTimeFormat.formatToParts` numeric extraction + a hardcoded English month-name array; exported for direct unit testing with explicit `timeZone` arg (Qatar / Europe/London / UTC scenarios pinned in tests).
  - **Out-of-window inner notice card** — replaces the previous loose-text-at-bottom-of-card treatment (locked 2026-05-09 wave 4). Sits in the slot where the redemption-code box used to be. Soft warm-tinted card with a Clock icon, a bold 14pt headline ("Staff handoff window ended"), and a 12pt supporting line ("Your code is now saved in Profile → Redemption History for your records."). testID `redemption-details-expired-notice` + `redemption-details-expired-headline` + `redemption-details-expired-support`. Suppressed when validated (the validated pill carries the message). The previous `redemption-details-window-ended` + `redemption-details-history-tip` testIDs are GONE; the notice card consolidates both into one intentional surface.
  - 14 copy/structure pins in `redemption-details-card.test.tsx` covering: helper integration / fallback on malformed / validated suppresses helper / inner notice headline+support copy / inner notice replaces (not duplicates) the old loose-text / inner notice DOM position (between summary and info rows) / inner notice ↔ code-box mutual exclusion / regression pin against partial revert / pure-function `formatExpiryLine` Qatar+London+UTC scenarios for the device-QA reported case (21:55 UTC → "9 May, 00:55" Qatar / "8 May, 22:55" BST / "8 May, 21:55" UTC) / day-numeric format without leading zero / month rollover / null on malformed / production no-arg call.

What stays deferred from M3:
- §Q1-Q5 redeemed-state visual redesign (washed-out coupon, REDEEMED stamp, dimmed merchant card, merchant-profile voucher-card treatment, Settings → Redemption History past-cycle surface). Tier 2 design pass paired with §S1-S3.
- §S2 animated gradient border on the code card (intentional v6 mockup deviation — static gradient ships in M3; the LIVE pulse + live datetime ticker already animate as the alive-signal).
- §S2 SuccessPopup polish (confetti, saving amount, Rate & Review CTA visual treatment, Rate & Review routing) — kept open. M3 ships the ANTI-FRAUD baseline (live timestamp + staff-verify copy); the broader visual redesign is a §S2 follow-up.
- §AE iOS anti-fraud hardening for v2 (QR hidden by default, tap/hold reveal, short-lived rotating QR payload, merchant validation policy formalisation, telemetry dashboards) — deferred until production fraud telemetry exists OR pre-launch threat-modelling escalates.
- TIME_LIMITED window enforcement (§O1, M4).
- REUSABLE multi-redemption (§T1, M5 brainstorm-first).
- §P3 SuccessPopup confetti (folded into §S2 above), §P4 non-PIN error action-button routing, §R1 collision-retry hardening, §R2 dead nanoid mock cleanup — Tier 1 polish batches.

**Pre-merge gate at branch tip (final shipped state):** focused customer-app M3/auth sweep **207/207 ✅**, backend M3 redemption + discovery suite **112/112 ✅**. Wider full-voucher sweep (26 jest suites covering presentationWindow utils, redemption-details-card, voucher-detail-redeem-flow, voucher-detail-states, success-popup, ShowToStaff, useScreenCaptureProtection, useScreenshotGuard, and other voucher suites) is also green at **474/474** ✅ as a defence-in-depth check. `tsc --noEmit` zero new errors in `src/api/` (single pre-existing unrelated `branchName: string | null` error in VoucherDetailScreen.tsx remains; not introduced by PR #49).

- **Hero-overlay seal + removed RedeemedBadge (locked 2026-05-09 PR #49 device QA wave 4, refined wave 8).** Previously redeemed state surfaced TWO indicators on Voucher Detail — a small green "Redeemed this cycle" pill (`RedeemedBadge`) above the coupon AND a tilted brand-rose stamp block (`RedeemedSeal`) between the voucher and the merchant card. Owner direction consolidated both into ONE: the seal moved onto the hero/banner as an absolute overlay (testID `voucher-detail-hero-seal`, anchored at `insets.top + 96`, `pointerEvents='none'` so the hero stays tappable) and the standalone RedeemedBadge mount was deleted entirely. Page now signals "redeemed" with a single visually-stamped voucher rather than two redundant badges. Hero stays dimmed (opacity 0.55) so the seal carries weight. **Wave 8 (locked 2026-05-09):** seal + hero dim now fire IMMEDIATELY on redemption, not only after the 2h window expires. Two booleans split for clarity: `showRedeemedSeal = stateKey === 'redeemed-this-cycle' && !!redemptionRedeemedAt` (visual; immediate) vs `blockShowToStaffMount = isRedeemed && (!isPresentationActive || isRedemptionValidated)` (defense-in-depth handler guard; only when code surface is hidden). The split is critical — without it, blocking ShowToStaff on `showRedeemedSeal` would also block the legitimate in-window "Show to Staff" button press. Pinned by the IN-WINDOW seal-visible test in `voucher-detail-redeem-flow.test.tsx §AE`.
- **Seal prominence + clipping fix (locked 2026-05-09, device QA waves 5+6).** Wave 5 boosted prominence so the seal reads as the dominant element while keeping the rubber-stamp tilt: solid pale-cream fill (`#FFF6EE`) instead of translucent rose tint, border 3px → 4px, shadow opacity 0.2 → 0.35 + larger radius, title 18 → 22pt with weight 900, ink-pressure textShadow. Wave 6 fixed clipped letter ascenders — root cause: the design-system `<Text>` variant's default `lineHeight` was below the bumped `fontSize`, so RN clipped at the line-box top. Fix: explicit `lineHeight: 32` on title (1.45× ratio gives ascenders generous headroom), explicit `lineHeight: 18` on subtitle, `includeFontPadding: true`, `paddingVertical` 16 → 20, explicit `overflow: 'visible'` on the seal container as a regression guard. Rustic feel preserved via opacity/textShadow/tilt — NOT via clipping the actual glyphs.

Plan: `docs/superpowers/plans/2026-05-08-voucher-detail-m3-show-to-staff.md` (forward-looking) + `2026-05-06-voucher-detail-redemption-rebaseline.md` §M3.1 (as-shipped).
Spec: `docs/superpowers/specs/2026-04-17-voucher-detail-redemption-design.md` §7.7 + §8.10 (M3 shipped-state deltas).

### ✅ Phase 3C.1d — Merchant Profile (LIVE on origin/main 2026-05-05)
- Branch-aware: customer API exposes `selectedBranch` block resolved from `?branch=<id>`; cold-open uses nearest-by-GPS or `Branch.isMainBranch`; in-tab switch via `router.replace`. Vouchers stay merchant-wide; redemption is branch-attributed.
- Hero / banner / logo / favourite toggle + meta row (name, rating, distance, open status, contact/website/directions actions)
- Sticky tab bar: Vouchers / About / Branches / Reviews. Tab fade transition with 8pt Y-settle (280ms ease-out-expo) + screen-wide opacity pulse on `selectedBranch.id` change (380ms)
- Vouchers tab: locked voucher card design (pastel-but-alive per-type gradients, official Iconic v3 R watermark via SvgXml, hero-left + title-below layout, dark-translucent type chip, fixed-height descriptionWrap for consistent card heights, side notches, brand-red shadow tinted per type). VoucherContextLabel: `"{n} offers available · Redeem at {branch}"` (multi-branch) / `"{n} offers available"` (single-branch)
- About tab: AboutCard (18pt 700 title + 14pt/22 body) + Photos + Amenities + OpeningHoursCard (with TODAY badge driven by London-local helper)
- Branches tab: nearest-first sort with alphabetical fallback, suspended branches excluded; BranchCard with status pill, address, action buttons (Call/Directions/Hours/Switch)
- Reviews tab: branch-scoped by default, two-state navy toggle (`[<branch-name>] [All branches]`), branch-aware empty state with "See reviews from other branches" cross-link, write/edit-from-card per-branch routing, `clearAllQueries` on auth-state transitions to prevent cross-user cache leak
- All five sheets (Contact / Directions / Hours / BranchPicker / WriteReview) use the shared BottomSheet with close/outside/back/swipe dismiss
- Subscribe-prompt modal animation: 320ms ease-out-expo (springify rejected as too bouncy)
- Opening-hours timezone: `apps/customer-app/src/features/merchant/utils/londonNow.ts` exports `getLondonClock(now) → { dow, minutes }` — Hermes-CLDR-robust via numeric Intl parts + `getUTCDay()`. Both `useOpenStatus` (TODAY badge) and `smartStatus` (status pill / status text) route through this helper. See `reference_london_clock_helper.md` in memory.
- PRs landed: #28 rebaseline → #30 nine bug fixes → #31 PR-A four Tier-1 fixes + 6 QA rounds → #32 P1 backend `selectedBranch` → #33 P2 frontend `selectedBranch` end-to-end → #35 UX refinement (30+ on-device QA rounds + Hermes timezone fix). Final merge `c5a52f2`.
- Test counts at merge: customer-app jest 206/206 on the merchant suite, backend customer tests 115/115, tsc clean.
- Locked design baseline: `~/.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/project_merchant_profile_ux_refinement_complete.md` — read before any change to voucher card, Reviews scope label, opening-hours, or subscribe-prompt animation.
- Plans: `docs/superpowers/plans/2026-04-17-merchant-profile.md` (initial), `docs/superpowers/plans/2026-05-04-merchant-profile-ux-refinement.md` (UX refinement)
- Spec: `docs/superpowers/specs/2026-05-02-branch-aware-merchant-profile-design.md` (branch-aware), `docs/superpowers/specs/2026-05-04-merchant-profile-ux-refinement-design.md` (UX refinement)

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
- `useScreenCaptureProtection`: cross-platform prevent/allow lifecycle — Android FLAG_SECURE + iOS 11+ recording-blur (shared by ShowToStaff, SuccessPopup, and Voucher Detail when the code is visible)
- `useScreenshotGuard`: iOS post-fact screenshot listener + 5s client dedup + best-effort telemetry only (Show-to-Staff + Voucher Detail when the code is visible; SuccessPopup excluded — short-lived popup)
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

### 🔲 Next planned work

1. **Workflow hooks for scope discipline** — DONE (PR #9, PR #12). Hook script at `.claude/hooks/pre-bash/01-git-safety.sh` enforces broad-add / push-to-main / force / hard-reset / clean-fdx / dirty-tree-discard / `gh pr merge` SHA-binding. Kept here as a record.
2. **Customer-app surface rebaselines** — `feature/customer-app` is REFERENCE ONLY (per the locked branch policy in memory). Each surface ports off it via its own dedicated PR onto current `main`. Surfaces still pending after the Merchant Profile track (PR #35), Voucher Detail M1 (PR #40), Voucher Detail M2 (PRs #43-#46), and Voucher Detail M3 (branch `feature/voucher-m3-show-to-staff`, awaiting merge):
   - Phase 3C.1b — Home / Discovery / Map
   - Phase 3C.1f — Savings tab
   - Phase 3C.1g — Favourites screen
   - Phase 3C.1h — Profile tab (full surface; minimal shell shipped via PR #27)
   - **Voucher Detail M4** — TIME_LIMITED availability windows (Tier 2 plan-first; light schema brainstorm). See deferred-followups §O1.
   - **Voucher Detail M5** — REUSABLE multi-redemption (Tier 3 brainstorm-first). See deferred-followups §T1.
   - **Redeemed-state design pass** (Tier 2) — bundles §Q1-Q5 (washed-out coupon, REDEEMED stamp, dimmed merchant card, merchant-profile voucher-card treatment, Settings → Redemption History) + §S1-S3 (PIN sheet + success popup + Show-to-Staff design polish).
   - **Customer name on Show-to-Staff** (§U1) — Tier 1 follow-up, picked up after merchant-portal validation surfaces lock so both sides design together.
   Several worktrees are already cut for these (`customer-app-discovery-map`, `customer-app-discovery-search`, etc.). Cross-check each against current `main` before resuming — main has moved significantly since they were created.
3. **Plan 4 — location model** (Tier 3, brainstorm-first per `project_discovery_sequencing_plan4.md`). Foundational for discovery experience; queued once the post-Plan-1 Home/Discovery QA sequencing wraps.
4. **Open follow-ups** — see `project_merchant_profile_ux_refinement_complete.md` for the merchant-profile open list (tap-target A11y, seed enrichment, `closesAt` device-local removal, discovery card ratings via `contextBranchId`).
5. **Phase 4** — Merchant Portal + Mobile App (queued). See deferred-followups §R4 for the locked architecture (branch-restricted access, per-user capabilities, automated monthly statements). Locked production-resilience standing checklist (memory §W) applies — high-traffic flows + third-party deps need explicit consideration.

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

## Workflow Tier Calibration

Every Redeemo task is classified into one of four tiers BEFORE implementation begins. The tier determines whether a plan/spec doc is required and what process to follow. The tier should be surfaced in the first reply on a task ("This is a Tier 1 — small fix to PC2 postcode display") so scope and process are explicit from the start.

### Tier 0 — Tiny fix
One-line / one-file / obvious fix. No plan doc. Commit message + short PR description sufficient.

### Tier 1 — Small bounded change
Small change inside ONE existing surface. No plan doc required, but the PR description MUST explain scope, risk, and tests covered.

### Tier 2 — Surface rebaseline / multi-file UI work
Examples: auth/onboarding rebaseline (PR #25), merchant profile rebaseline, voucher detail rebaseline, Favourites / Savings / Profile tabs, any customer-app surface moved from `feature/customer-app` to `main`.

Rules:
- MUST have a written plan doc first (`docs/superpowers/plans/YYYY-MM-DD-<topic>.md`).
- Owner decisions surfaced BEFORE implementation.
- Implementation follows milestones; PAUSE at each milestone for review.
- If a contract / dependency gap appears mid-execution, PAUSE and amend the plan — do NOT hack around it. Document amendments in the plan doc itself.
- Docs must be updated in the SAME PR if behaviour changes (`customer-flow-current.md` + `customer-flow-changelog.md` etc.).
- Tests required before PR.
- No merge until review + QA complete.

### Tier 3 — New architecture / backend contract / schema change
Examples: Plan 4 location model, PC3 → category-preference migration, new backend flows, subscription/payment architecture.

Rules:
- Use the full Superpower flow: `superpowers:brainstorming` → spec doc → `superpowers:writing-plans` → implementation → review → lock.

### Standing rules

- **All rebaseline work is Tier 2 by default.**
- **Never start Tier 2 or Tier 3 implementation** without the correct plan/spec process first.
- **If the tier is unclear, PAUSE and ask the owner.** Do not guess.

**Why this exists:** Locked 2026-05-01 after PR #25 (the auth/onboarding rebaseline) demonstrated that Tier 2 work without a plan-first discipline can balloon mid-execution and require multiple in-flight amendments, with each amendment costing a pause-for-review cycle. Plan-first discipline keeps scope honest, surfaces dependency gaps as decisions rather than fait-accomplis, and keeps the final PR diff explainable to reviewers.

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

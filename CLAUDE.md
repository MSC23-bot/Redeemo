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
2. **Monthly voucher cycle is subscription-based, not calendar-based.** Each user's cycle starts from their subscription date. At cycle end (renewal), `UserVoucherCycleState.isRedeemedInCurrentCycle` resets to `false` — only if user still has active subscription AND merchant still has voucher active.
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
- Stripe handles all billing

---

## Voucher Types
BOGO, Spend & Save, Discount (fixed £ or %), Freebie, Package Deal, Time-Limited, Reusable

---

## Data Model Summary

All models live in `prisma/schema.prisma`. Key relationships:

- `User` → `Subscription` (1:1) → `SubscriptionPlan`
- `User` → `UserVoucherCycleState` (1:many) ← **monthly cycle enforcement table**
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
- Plans: `docs/superpowers/plans/2026-04-09-subscription-system.md`, `docs/superpowers/plans/2026-04-09-subscription-hardening.md`

### ✅ Phase 2D — Redemption System (COMPLETE)
- Customer redemption flow: PIN entry → guard checks → `VoucherRedemption` created with `redemptionCode` (nanoid) + `UserVoucherCycleState` updated atomically
- All guards enforced: subscription (ACTIVE/TRIALLING), voucher (ACTIVE+APPROVED), merchant (ACTIVE), branch-merchant coherence, one-per-cycle, rate limit (5 attempts / 15 min per userId+branchId)
- Branch PINs stored AES-256-GCM encrypted (`Branch.redemptionPin`)
- Staff verification: `POST /api/v1/redemption/verify` accepts branch staff OR merchant admin; sets `isValidated=true`, records `validationMethod` (QR_SCAN / MANUAL)
- Branch reconciliation list scoped to own branch (staff) or own merchant (admin)
- PIN management routes: GET / PUT / POST send — SMS via Twilio (live), email via Resend (deferred to Phase 6)
- 145 tests passing, TypeScript clean
- Plan: `docs/superpowers/plans/2026-04-10-redemption-system.md`

**Deferred to Phase 6:** Email PIN delivery (Resend not yet integrated — logs placeholder when `branch.email` is set)

**Pre-Phase 3 note:** `redemptionCode` uses nanoid default alphabet (includes `-`/`_`). If manual staff entry is a primary UX flow, switch to alphanumeric-only before the merchant mobile app is built.

### ✅ Phase 3A — Customer UX Foundations Spec (COMPLETE)
- Full UX spec covering both customer app (React Native) and customer website (Next.js)
- Defines: user flows, screen inventory, state definitions, edge cases, backend dependencies, shared UX rules, web vs mobile distinction
- Redemption is mobile-only by product design (not phase scope) — website shows "Redeem in the app"
- Key backend gaps identified: customer-facing merchant/voucher/search APIs, branch selector route, favourites routes, customer profile/change-password routes, savings aggregation
- Spec: `docs/superpowers/specs/2026-04-10-customer-ux-foundations-design.md`

### 🔲 Phase 3B — Customer-Facing API Gaps (backend)
- Customer-facing merchant profile + voucher detail routes
- Search + category browse routes
- Branch selector route (for redemption flow)
- Customer profile update + change password routes
- Favourites routes (add, remove, list)
- Savings aggregation query

### 🔲 Phase 3C — Customer App (React Native / Expo)
### 🔲 Phase 3D — Customer Website (Next.js)
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

---

## How to Resume Work

1. Read this file to get full context
2. Check `git log --oneline` to see current state
3. Check `docs/superpowers/plans/` for implementation plans
4. Run `npx prisma db seed` to reset dev data if needed
5. Ask Claude to continue from the current phase

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

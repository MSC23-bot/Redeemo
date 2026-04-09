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
- 13 commits on `main`

### 🔲 Phase 2 — Core Backend API (NEXT)
- Auth system (JWT, OTP via Twilio, SSO)
- Merchant + branch + voucher CRUD
- Subscription system (Stripe webhooks, cycle logic)
- Redemption system (code generation, validation flow)

### ✅ Phase 2D — Subscription System (COMPLETE)
- Stripe SetupIntent-based payment flow (card collection via Stripe SDK)
- stripeCustomerId stored server-side in Redis — never exposed to client
- Subscription creation with confirmed payment method
- Cancel at period end (access continues until currentPeriodEnd)
- Webhook handler: renewal, cancellation, payment failure, voucher cycle reset
- stripeCouponId on PromoCode for explicit Stripe coupon mapping

### ✅ Phase 2D Hardening — Subscription System (COMPLETE)
- User.stripeCustomerId persisted after first customer creation — reused on repeat setup-intent calls (no orphaned Stripe customers)
- Webhook idempotency via StripeWebhookEvent table: unique stripeEventId constraint; P2002 on duplicate → 200 immediately
- Webhook status mapped via SubscriptionStatus enum values (no string casts)
- Stripe v22: period dates read from items.data[0] (not top-level Subscription)

### 🔲 Phase 3 — Customer App + Website
### 🔲 Phase 4 — Merchant Portal + Mobile App
### 🔲 Phase 5 — Admin Panel
### 🔲 Phase 6 — Comms + Marketing Layer

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
| `docs/superpowers/plans/2026-04-07-data-model.md` | Completed data model implementation plan |

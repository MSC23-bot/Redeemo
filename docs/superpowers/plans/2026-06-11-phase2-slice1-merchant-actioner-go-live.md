# Phase 2 Slice 1 — Merchant Actioner + Go-Live (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan **one MILESTONE (= one PR) at a time**, pausing for owner review between milestones. Steps use checkbox (`- [ ]`) syntax. Each milestone section lists its concrete test set — build it **TDD** (write the failing test → implement → green → commit), in small commits.

**Goal:** Build the backend/admin **actioner spine + safe go-live** so Redeemo can take a submitted merchant through review → request-changes → reject → approve → go-live → suspend/reactivate, with a correct `MerchantMembership` ownership foundation, transactional audit, and lifecycle notifications — **no UI**.

**Architecture:** Additive backend on the existing Fastify 5 + Prisma 7 + Neon + Redis + BullMQ stack. A **new admin-management surface** (`src/api/admin/**`, registered in `app.ts` after `adminAuthPlugin`, gated by `app.authenticateAdmin` + a new `requireAdminCapability`) hosts the actioner. Merchant ownership moves from the 1:1 `MerchantAdmin.merchantId` to a `MerchantMembership` model (+ `MerchantMembershipBranch` join, franchise-ready). All actioner state changes run in one `prisma.$transaction` with a transactional audit row, and enqueue notifications through the Phase-0 `notify()` outbox.

**Tech Stack:** Fastify 5, Prisma 7.7 (prisma-client generator → `generated/prisma`), Neon Postgres, ioredis, BullMQ (Phase-0 worker), Vitest 4, `tsx`. Migrations: `npx prisma migrate dev --create-only --name <x>` → hand-edit SQL (backfills) → `npx prisma migrate deploy` → `npx prisma generate`.

**Source of truth:** `docs/superpowers/specs/2026-06-11-merchant-actioner-go-live-slice-design.md` (owner decisions D-1..D-7 RESOLVED). This plan covers **Slice 1 only**.

**Plan granularity:** milestone-level. Each milestone (§M1–§M6) is one PR with its own goal, files, schema, contracts, **concrete test list**, safety, and checkpoint. Each milestone PR is implemented TDD against its test list; build it in small commits, not one big diff.

---

## Scope check + cross-check (anchor milestone → verified code reality → this plan)

| §17 anchor | Verified code reality | This plan |
|---|---|---|
| 1. Membership + createMerchantDraft + audit-actor | `resolveAdminMerchant` reads `merchantAdmin.merchantId` (1:1); no `src/api/admin/` surface; `AuditLog` has no actor; no merchant-create endpoint | **Split** → **M1** (**additive** membership foundation + backfill + `resolveAdminMerchant` reroute; **keeps `MerchantAdmin.merchantId`** as a transitional field) and **M2** (admin surface + capability + audit-actor + `createMerchantDraft`). The 1:1 column **drop (D-1 contract step) moves to M6** — verified that the auth/login/OTP/refresh/reactivate + branch-user flows read `admin.merchantId` + the required `admin.merchant` relation **directly** (not via `resolveAdminMerchant`), and M6 already reworks those reads for SEC-M2 |
| 2. Actioner reads + claim + request-changes/reject | `AdminApproval` has **zero readers**; `ApprovalStatus`=PENDING/APPROVED/REJECTED; submit leaves `verificationStatus=NOT_SUBMITTED` | **M3** (+ fix the verificationStatus bug; add `UNDER_REVIEW/REJECTED`, `CHANGES_REQUESTED`, `claimedById/claimedAt`) |
| 3. Approve/go-live + RMV + notify | go-live unreachable (ACTIVE seed-only); voucher activation never happens | **M5** (after M4 — go-live re-uses the location `CONFIRMED_LOCATION_SET`) |
| 4. Suspend + SEC-M1/M2 | verify path + merchant-resolve read **cached** session status (`redemption/routes.ts:140,153,193,207`) | **M6** |
| 5. Branch visibility/location-confidence | discovery branch query (`:338`) gates `isActive+isTestData` only; `hasExactPosition`(`:98`)=`MANUALLY_CONFIRMED` vs ranking=both | **M4** — **moved before go-live** (M5 re-uses `CONFIRMED_LOCATION_SET`) + admin confirm-location pin-drop |

**Deviations from the spec/§17 (and why):** (1) split the membership migration (M1) from the admin-surface bootstrap (M2) — smaller, the riskiest piece isolated; (2) the location-confidence milestone (M4) lands **before** approve/go-live (M5) because go-live re-validates the branch predicate against the same `CONFIRMED_LOCATION_SET` (define once, consume in M5). Net: **6 milestones** instead of 5. Everything in the spec is still covered.

---

## File-structure map (created/modified across the slice)

**New (admin surface):**
- `src/api/admin/plugin.ts` — scoped Fastify plugin (`preHandler: app.authenticateAdmin`), registered in `app.ts`. (M2)
- `src/api/admin/capability.ts` — `requireAdminCapability(cap)` middleware + the role→capability map. (M2)
- `src/api/admin/merchants/{routes,service}.ts` — `createMerchantDraft`, suspend/reactivate, confirm-location. (M2/M4/M6)
- `src/api/admin/approvals/{routes,service}.ts` — the actioner (list/get/claim/release/request-changes/reject/approve). (M3/M5)
- `src/api/shared/merchantMembership.ts` — `resolveOwnerMerchant`, scope helpers. (M1)
- `src/api/shared/auditEvents.ts` — extend the `AuditEvent` union; `writeAuditLogTx(tx, …)`. (M2)
- `src/api/shared/location.ts` — `CONFIRMED_LOCATION_SET` + `isBranchLocationConfirmed()`. (M4)
- `src/api/shared/merchantEmails.ts` (or extend `emailTemplates.ts`) — changes-requested + rejected templates (**M3**); approval / "you're live" template (**M5**).

**Modified:**
- `prisma/schema.prisma` (+ migrations) — every milestone with schema (M1/M2/M3).
- `src/api/app.ts` — register the admin plugin. (M2)
- `src/api/merchant/shared.ts` — `resolveAdminMerchant` → membership. (M1)
- `src/api/merchant/onboarding/service.ts` — `submitForApproval` sets `verificationStatus=PENDING`; resubmit path. (M3)
- `src/api/customer/discovery/service.ts` — the `CONFIRMED_LOCATION_SET` visibility gate + `hasExactPosition` unification. (M4)
- `src/api/redemption/routes.ts` — SEC-M1 live-DB status checks. (M6)
- `src/api/auth/merchant/**` — SEC-M2 live `merchant.status` on resolve/refresh. (M6)
- `prisma/seed.ts` — OWNER membership for seeded merchant(s); a SUBMITTED example. (M1/M2)

**Tests:** new `tests/api/admin/**`; extend `tests/api/merchant/**`, `tests/api/customer/discovery/**`, `tests/api/redemption/**`.

---

## Cross-cutting requirements (apply to every milestone)

- **Transactional audit:** every state-changing actioner/lifecycle write happens in one `prisma.$transaction` that also writes the `AuditLog` (via `writeAuditLogTx(tx, …)`) with `actorId`, `actorType`, `before`, `after`, `reason`. (Low-stakes telemetry keeps the existing fire-and-forget `writeAuditLog`.)
- **Idempotency/concurrency:** each action re-reads the target row inside the transaction and asserts it is still actionable; a duplicate/out-of-order action is a **safe no-op** (mirror the `StripeWebhookEvent` precedent + the redemption advisory-lock pattern). Claim uses a conditional update (`WHERE claimedById IS NULL`).
- **Capability gate:** every admin route is `preHandler: [app.authenticateAdmin, requireAdminCapability('<cap>')]`.
- **Dark notifications:** lifecycle emails go through `notify()` (outbox); they won't actually send until `EMAIL_ENABLED` — expected. The in-app `Notification` row persists regardless.
- **No UI, no upload routes/multipart, no provider/DNS, no customer-web/app.** `AdminCapabilityGrant` is **design-only**.

---

## M1 — `MerchantMembership` foundation (migration + reroute)

**PR scope:** introduce the ownership model + reroute resolution; existing merchant flows keep working. No new behaviour for users.

**Files — Create:** `src/api/shared/merchantMembership.ts`; `tests/api/merchant/membership.test.ts`. **Modify:** `prisma/schema.prisma` (+ migration); `src/api/merchant/shared.ts`; `prisma/seed.ts`.

**Schema (migration `merchant_membership`):**
- new enum `MerchantRole { OWNER, BRANCH_MANAGER, STAFF }`.
- new model `MerchantMembership { id, merchantId, merchantAdminId, role MerchantRole, allBranches Boolean @default(true), status UserStatus @default(ACTIVE), invitedById String?, createdAt, updatedAt, @@unique([merchantId, merchantAdminId]), @@index([merchantId]), @@index([merchantAdminId]) }`.
- new model `MerchantMembershipBranch { id, membershipId, branchId, createdAt, @@unique([membershipId, branchId]), @@index([branchId]) }`.
- **hand-edited backfill SQL** (after the `CREATE TABLE`s): `INSERT INTO "MerchantMembership" (id, "merchantId", "merchantAdminId", role, "allBranches", status, "createdAt", "updatedAt") SELECT gen_random_uuid(), "merchantId", id, 'OWNER', true, 'ACTIVE', now(), now() FROM "MerchantAdmin";`
- **M1 is PURELY ADDITIVE — it does NOT drop `MerchantAdmin.merchantId`.** The column + its `@unique` + the `merchant Merchant @relation` field are **kept as a transitional compatibility field** so the merchant auth (login/OTP/login-complete/refresh/reactivate) + branch-user paths — which read `admin.merchantId` / `include: { merchant: true }` directly — keep working untouched, and the existing auth tests stay green. The **drop is the D-1 contract step, moved to M6** (sequenced after M6 reroutes those auth reads for SEC-M2). End-state is unchanged: the old 1:1 field is removed — just one milestone later.

**Contracts:**
- `resolveAdminMerchant(prisma, adminId)` (in `merchant/shared.ts`) now resolves **admin → OWNER `MerchantMembership` → merchantId** (reads `merchantMembership.findFirst({ where: { merchantAdminId: adminId, role: 'OWNER', status: 'ACTIVE' } })`); throws `INVALID_CREDENTIALS` if none. Signature/return unchanged (callers untouched). **Scope boundary:** M1 reroutes ONLY `resolveAdminMerchant` (the merchant-**management** services — profile/voucher/branch/onboarding — that already go through it). It does **NOT** touch the merchant **auth** flow (`auth/merchant/service.ts` login/OTP/login-complete, `auth/merchant/routes.ts` refresh/reactivate) or `auth/merchant/branch-user.service.ts` — those keep reading the still-live `admin.merchantId` / `admin.merchant` relation. Rerouting them is the M6 contract step.
- `src/api/shared/merchantMembership.ts`: `getOwnerMembership(prisma, adminId)`, `assertNotLastOwner(prisma, merchantId, membershipId)` (refuses to deactivate/remove the last ACTIVE OWNER — `LAST_OWNER_PROTECTED`).

**Tests (TDD):** backfilled OWNER membership resolves the same `merchantId` the old field did; `resolveAdminMerchant` still returns `{adminId, merchantId}` for a seeded merchant; `assertNotLastOwner` throws on the last OWNER, passes with a second OWNER; a merchant's existing onboarding/branch/voucher reads still work post-reroute; **existing merchant AUTH still works (M1 non-regression pin):** a seeded merchant-admin login (`loginMerchant`) still resolves the merchant via the **kept** `admin.merchant` relation, and `admin.merchantId` is still readable (the transitional field is intact). Run the existing `tests/api/merchant/onboarding.test.ts` + `branch.test.ts` + the merchant-auth suite green.

**Safety/rollback:** M1 is **purely additive — expand + backfill only, NO column drop, NO relation removal** — so it cannot break the auth flow, and rollback is trivial: drop the three new tables + the `MerchantRole` enum and revert the `resolveAdminMerchant` reroute (the kept `admin.merchantId` keeps the old resolution path valid). **No expand-contract risk lives in M1.** The contract step (drop `MerchantAdmin.merchantId` + the relation) and its non-additive down-path move to **M6**. **Idempotency/audit:** a `MEMBERSHIP_CREATED` audit at backfill is unnecessary (migration-time); future membership creates audit in M2.

**Checkpoint:** existing merchant test suites green against the membership-resolved path; `tsc` clean.

---

## M2 — Admin surface + capability + audit-actor + `createMerchantDraft`

**PR scope:** stand up the admin-management surface, the audit-actor foundation, and the first admin action (create a merchant draft — D-3).

**Files — Create:** `src/api/admin/plugin.ts`, `src/api/admin/capability.ts`, `src/api/admin/merchants/{routes,service}.ts`, `src/api/shared/auditEvents.ts`; tests `tests/api/admin/capability.test.ts`, `tests/api/admin/create-merchant-draft.test.ts`, `tests/api/shared/audit-actor.test.ts`. **Modify:** `prisma/schema.prisma` (+ migration), `src/api/app.ts`, `src/api/shared/audit.ts`, `src/api/shared/errors.ts`, `prisma/seed.ts`.

**Schema (migration `audit_actor`):** `AuditLog += actorId String?, actorType ActorType?, before Json?, after Json?, reason String?`; new enum `ActorType { ADMIN, MERCHANT_ADMIN, BRANCH_MANAGER, BRANCH_STAFF, CUSTOMER, SYSTEM }`; `AdminRole += ADMIN` (if absent — verify; the enum currently has SUPER_ADMIN/OPERATIONS/FINANCE/CONTENT/SUPPORT). **No `AdminCapabilityGrant` (D-6).**

**Contracts:**
- `src/api/admin/plugin.ts`: scoped plugin, `scoped.addHook('preHandler', app.authenticateAdmin)` (mirror `merchant/plugin.ts`); registered in `app.ts` after `adminAuthRoutes`.
- `src/api/admin/capability.ts`: `requireAdminCapability(cap: AdminCapability)` reads `request.adminRole` (from the JWT — already carried, `auth/admin/service.ts:104`) and checks a `ROLE_CAPABILITIES` map. Slice-1 caps: `'merchant:create-draft' | 'approval:read' | 'approval:action' | 'merchant:suspend' | 'branch:confirm-location'`. Map: `SUPER_ADMIN` = all; `ADMIN` = all; `OPERATIONS` = all 5; others = none. Throws `ADMIN_CAPABILITY_DENIED` (403).
- `src/api/shared/audit.ts`: add `writeAuditLogTx(tx, ctx)` (same shape + `actorId/actorType/before/after/reason`, runs **inside** the passed transaction — not fire-and-forget).
- `createMerchantDraft(prisma, adminId, data, ctx)`: one `$transaction` → `Merchant` (REGISTERED) + `MerchantAdmin` (the OWNER person, `mustChangePassword=true`, **no password set by admin**) + first `OWNER` `MerchantMembership` + `writeAuditLogTx(MERCHANT_DRAFT_CREATED, actor=admin)`. Returns the merchant + a note that the owner must set their password via the existing reset-link flow (admin never sees a token). Route `POST /api/v1/admin/merchants` (cap `merchant:create-draft`).

**Audit events added:** `MERCHANT_DRAFT_CREATED`, `MEMBERSHIP_CREATED`.

**Tests (TDD):** capability map allows OPERATIONS/ADMIN/SUPER_ADMIN, rejects SUPPORT/CONTENT (403); `createMerchantDraft` creates Merchant+MerchantAdmin+OWNER membership atomically and the admin response contains **no password/token**; the audit row records `actorId`=admin, `actorType=ADMIN`; a `writeAuditLogTx` row commits/rolls-back **with** its transaction (write a row in a tx that then throws → no audit row).

**Safety/rollback:** additive schema; the plugin is inert until routes call it; flag-free. **Idempotency:** `createMerchantDraft` is not idempotent by nature (each call = a new draft) — that's acceptable (admin-initiated); a duplicate-email guard reuses the existing `EMAIL_ALREADY_EXISTS`.

**Checkpoint:** an admin can create a draft merchant via the API; audit + capability enforced; `tsc` clean.

---

## M3 — Actioner: queue reads + claim/release + request-changes/reject

**PR scope:** the review side of the actioner (everything except approve/go-live). A merchant can be reviewed, sent back, resubmitted, and rejected through the product.

**Files — Create:** `src/api/admin/approvals/{routes,service}.ts`, `src/api/shared/merchantEmails.ts` (the changes-requested + rejected templates); tests `tests/api/admin/approvals-read.test.ts`, `tests/api/admin/approvals-actions.test.ts`, `tests/api/shared/merchant-emails.test.ts`. **Modify:** `prisma/schema.prisma` (+ migration), `src/api/merchant/onboarding/service.ts`, `src/api/shared/errors.ts`, `src/api/shared/auditEvents.ts`.

**Schema (migration `approval_actioner`):** `OnboardingStep += UNDER_REVIEW, REJECTED`; `ApprovalStatus += CHANGES_REQUESTED`; `AdminApproval += claimedById String?, claimedAt DateTime?` (+ FK `claimedBy AdminUser?`).

**Contracts:**
- **Fix the submit bug** (`onboarding/service.ts` `submitForApproval`): also set `verificationStatus: 'PENDING'` (currently left `NOT_SUBMITTED`).
- `GET /api/v1/admin/approvals` (cap `approval:read`) — filter by `type`,`status`,`claimedById`,age; paginated; the `MERCHANT_ONBOARDING` row includes the merchant summary + the onboarding checklist + the inline RMVs. `GET …/:id` — one approval + target detail.
- `POST …/:id/claim` (cap `approval:action`) — conditional `updateMany WHERE claimedById IS NULL`; sets `claimedById/claimedAt`; merchant `OnboardingStep→UNDER_REVIEW`; transactional audit `MERCHANT_APPROVAL_CLAIMED`. `POST …/:id/release` — inverse.
- `POST …/:id/request-changes` (cap `approval:action`, body `{ reason }`) — one tx: `OnboardingStep→NEEDS_CHANGES`, `AdminApproval.status→CHANGES_REQUESTED` + `comment=reason`, clear `claimedById`; audit `MERCHANT_CHANGES_REQUESTED` (reason); **after commit** `notify()` the merchant the **changes-requested** email (template created here in M3 — `merchantChangesRequestedEmail(reason)`) + in-app `Notification`.
- `POST …/:id/reject` (cap `approval:action`, body `{ reason }`) — one tx: `MerchantStatus→INACTIVE`, `OnboardingStep→REJECTED`, `VerificationStatus→REJECTED`, `AdminApproval.status→REJECTED`+comment+actionedAt+adminUserId; audit `MERCHANT_APPROVAL_REJECTED`; **after commit** `notify()` the merchant the **rejected** email (template created here in M3 — `merchantRejectedEmail(reason)`) + in-app `Notification`; reopenable (a later admin action can move it back — design the reopen as a state transition, audited).
- **Resubmit** (`onboarding/service.ts`): a merchant in `NEEDS_CHANGES` editing + re-submitting reopens the **same** `AdminApproval` (referenceId=merchantId) → `status→PENDING`, `OnboardingStep→SUBMITTED`, clear claim; audit `MERCHANT_RESUBMITTED`.

**Idempotency/concurrency:** claim race → single winner (conditional update). request-changes/reject re-read the approval in-tx + assert `status IN (PENDING, CHANGES_REQUESTED)` and merchant not already ACTIVE → no-op otherwise. Resubmit asserts `status=CHANGES_REQUESTED`.

**Audit/notify:** events above. **M3 owns the changes-requested + rejected lifecycle email templates** (`src/api/shared/merchantEmails.ts`) and their `notify()` enqueue + tests — those actions happen in M3. The approve / "you're live" template lands in **M5** (it owns the action that fires it). No cross-milestone template dependency remains.

**Tests (TDD):** submit sets `verificationStatus=PENDING`; claim → UNDER_REVIEW + single-winner on concurrent claim; request-changes → NEEDS_CHANGES + CHANGES_REQUESTED + reason in audit; resubmit → reopens same approval → PENDING/SUBMITTED; reject → INACTIVE/REJECTED/REJECTED + audit; double-action = no-op; queue list filters + pagination + the onboarding card shape (checklist + RMVs); **request-changes and reject each `notify()` the merchant (mocked) with the correct M3 template + merchant recipient + write the in-app `Notification` row** (`merchant-emails.test.ts` covers the template bodies).

**Safety/rollback:** additive enums; the review loop never makes a merchant public (no ACTIVE transition here). **Checkpoint:** the full review→changes→resubmit→reject loop works via the API; go-live still impossible (M5).

---

## M4 — Location-confidence: shared confirmed-set helper + admin confirm-location (Option-A reconciliation)

> **AS BUILT — Option A (owner-approved 2026-06-11).** Pre-code inspection found that discovery already enforces a branch-level location-confidence model shipped in **PR #81 (Plan 4 M1)** under spec `2026-05-18-discovery-rebaseline-branch-first.md §4.1.1` — a deliberately-tested **list-vs-map asymmetry**, NOT the merchant-level-only gate §8 assumed. The §8 stricter model (hide `POSTCODE_CENTROID` from lists; expose `ADDRESS_GEOCODED` on the map via D-5) directly **reverses** that locked contract and would rewrite ~6 passing PR #81 tests + change customer-visible discovery. The owner chose **Option A**: ship only the genuinely-new, non-conflicting M4 deliverables (the shared helper + the admin pin-drop) and **preserve the PR #81 discovery contract as authoritative**. Tightening discovery visibility or exposing `ADDRESS_GEOCODED` on the map is deferred to a **separate product/spec decision**. The original §8/D-5 plan text is retained below under "Superseded".

**PR scope (as built):** extract the shared confirmed-location constant/helper that ranking + discovery partitions already inline, and add the admin confirm-location pin-drop. **No customer-facing behaviour change.** Lands before M5 go-live consumes the helper.

**Files — Create:** `src/api/shared/location.ts`; `src/api/admin/branches/{routes,service}.ts` (new admin module, mirrors `admin/merchants` + `admin/approvals`); tests `tests/api/shared/location.test.ts`, `tests/api/admin/confirm-location.test.ts` (real-DB) + `tests/api/admin/confirm-location-routes.test.ts` (mock gate). **Modify:** `src/api/lib/ranking.ts`, `src/api/customer/discovery/{service.ts,homeRailBuilders.ts}` (replace the inline `{MC,AG}` literal with the helper), `src/api/shared/audit.ts` (add `BRANCH_LOCATION_CONFIRMED`), `src/api/admin/plugin.ts` (register the new module), `tests/api/lib/classifyRung.test.ts` (parity pin).

**Schema:** **none.** (`Branch` has **no `deletedAt` column** — the §8 predicate's `deletedAt==null` clause is dropped, consistent with the §BRANCHDEL deferral surfaced in M3. `errors.ts` already has `BRANCH_NOT_FOUND`; no new error needed.)

**Contracts (as built):**
- `src/api/shared/location.ts`: `export const CONFIRMED_LOCATION_SET = ['MANUALLY_CONFIRMED','ADDRESS_GEOCODED'] as const;` + `isBranchLocationConfirmed(b)`. This is the **discovery/go-live confidence set only**. `hasExactPosition` / `exposeBranchPosition` (the stricter `MANUALLY_CONFIRMED`-only map-pin/exact-distance rule) are **NOT re-pointed** — the PR #81 list-vs-map asymmetry stays authoritative. The `{MC,AG}` literal is replaced at **8 call sites** (the `classifyRung` discoverability gate + the 6 rail/search rankable partitions — Featured / Trending / Popular / NearbyByCategory-primary / NearbyByCategory-cascade / Search — + the v1.7 filler distance filter); the `{POSTCODE_CENTROID, NEEDS_REVIEW}` non-rankable complement stays an explicit discovery-local literal (zero behaviour change, no complement-semantics risk).
- **Admin confirm-location:** `POST /api/v1/admin/branches/:id/confirm-location` (cap `branch:confirm-location`, body `{ latitude, longitude }`) — sets `branch.latitude/longitude` + `locationConfidence='MANUALLY_CONFIRMED'`; transactional audit `BRANCH_LOCATION_CONFIRMED` (actor + before/after). Idempotent. This is the Q7 fallback so a `POSTCODE_CENTROID` main branch is never a permanent go-live blocker (flipping it to `MANUALLY_CONFIRMED` is exactly how it earns a map pin under the existing PR #81 contract — no separate discovery change needed).

**Tests (as built):** `location.test.ts` pins the helper + the 4-value partition (locks `CONFIRMED_LOCATION_SET` so it can't silently widen/narrow its discovery/ranking consumers); `classifyRung.test.ts` adds a cross-module parity pin (gate ⟺ helper across the full enum); the existing PR #81 `location-confidence-redaction.test.ts` + `classifyRung.test.ts` + `rankBranchesV3.test.ts` staying green is the behaviour-preserving proof; admin tests cover the auth/capability gate (401/403/OPERATIONS+SUPER_ADMIN pass/Zod 400) + real-DB service (PC→MC flip, audit before/after, idempotency, BRANCH_NOT_FOUND).

**Safety/rollback:** **no customer-facing behaviour change** — pure DRY refactor + an admin-only additive route. confirm-location is idempotent. **Checkpoint:** ranking + PR #81 discovery suites green; the constant is shared and M5's go-live gate can consume `isBranchLocationConfirmed`.

<details><summary><b>Superseded — original §8/D-5 stricter-gate plan (NOT built; deferred to a separate product/spec decision)</b></summary>

The original M4 plan added a WHERE-level visibility gate (`locationConfidence: { in: CONFIRMED_LOCATION_SET }` + `localityId: { not: null }`) that hid `POSTCODE_CENTROID` from list views, and re-pointed `hasExactPosition`/`exposeBranchPosition` to the set so `ADDRESS_GEOCODED` branches exposed geocoded coordinates on the map (D-5). Inspection showed both reverse the locked PR #81 §4.1.1 list-vs-map asymmetry. Deferred per Option A.

</details>

---

## M5 — Atomic approve / go-live + RMV activation + lifecycle notifications

> **AS BUILT (2026-06-11) — corrections from code inspection:**
> - **No `src/api/shared/auditEvents.ts`** — the `AuditEvent` union is inline in `src/api/shared/audit.ts` (same correction as M2/M3). Added `MERCHANT_APPROVAL_APPROVED` + `MERCHANT_GO_LIVE` there.
> - **Gate re-validation is inline inside the `$transaction`** (sequential reads, not `computeOnboardingChecklist` — that helper isn't tx-scoped and uses `Promise.all`). The inline reads mirror its conditions exactly (contract `SIGNED`, ≥1 branch, ≥2 `isRmv` vouchers with `status ∈ {PENDING_APPROVAL, ACTIVE}`), then add the **main-branch `isBranchLocationConfirmed`** check (M4 helper) + the `isTestData` guard.
> - **Error codes:** contract/branch/RMV failure → existing **`ONBOARDING_GATES_INCOMPLETE`** carrying a `details.checklist` (per-gate booleans, so the caller sees exactly what's missing — the "distinct error" requirement met via code + details). Main-branch unconfirmed → new **`MAIN_BRANCH_LOCATION_UNCONFIRMED`** (409). A **test-data** merchant → `APPROVAL_NOT_ACTIONABLE` (defence-in-depth; **note:** partly redundant with discovery's existing `isTestData` filter — kept per spec §6; a 1-line removal if owner prefers).
> - **Idempotency** is a **merchant-already-ACTIVE no-op guard placed BEFORE the actionable-status check** — so a double/concurrent approve returns `{ approved: true, alreadyLive: true }` cleanly instead of erroring on the now-`APPROVED` approval.
> - **Draft-owner claim path stays DEFERRED** — M5's notify is the OWNER "you're live" only; the M2 draft owner still claims their account via the existing password-reset flow (separate concern, not in M5).
> - **The "appears in discovery after go-live" assertion is OMITTED** from the automated M5 suite (it's the flaky DB-backed discovery layer; the confidence-visibility model is already pinned by M4's `location-confidence-redaction.test.ts`). M5 deterministically pins the go-live **state transition** + RMV activation + audit + notify.
> - **Route-gate cases** were added to the existing `tests/api/admin/approvals-routes.test.ts` (the approve route lives in the same module) rather than a new file.

**PR scope:** the approve action — the merchant goes live; re-uses M4's `CONFIRMED_LOCATION_SET` / `isBranchLocationConfirmed` for the go-live gate.

**Files — Create/Modify:** `src/api/admin/approvals/{routes,service}.ts` (add `approveApproval` + the approve route); **extend** `src/api/shared/merchantEmails.ts` with `merchantLiveEmail()`; tests `tests/api/admin/approve-go-live.test.ts` (real-DB) + extend `tests/api/shared/merchant-emails.test.ts` + `tests/api/admin/approvals-routes.test.ts`. **Modify:** `src/api/shared/audit.ts` (2 new events) + `src/api/shared/errors.ts` (`MAIN_BRANCH_LOCATION_UNCONFIRMED`).

**Schema:** none.

**Contracts:**
- `POST /api/v1/admin/approvals/:id/approve` (cap `approval:action`) — one `$transaction`:
  1. re-read approval + merchant; assert actionable (status `PENDING`/resubmitted; merchant not already ACTIVE) → idempotent no-op otherwise.
  2. **re-validate go-live gates server-side:** `contractStatus='SIGNED'`, ≥2 `isRmv` vouchers present, ≥1 valid main branch, `isTestData=false`, and **main branch `isBranchLocationConfirmed`** (else throw `MAIN_BRANCH_LOCATION_UNCONFIRMED` → admin uses M4 confirm-location).
  3. `Merchant`: `status→ACTIVE`, `onboardingStep→LIVE`, `verificationStatus→VERIFIED`.
  4. **RMV activation:** the merchant's `isRmv` vouchers `status→ACTIVE`, `approvalStatus→APPROVED`, `approvedBy`=admin, `approvedAt`=now.
  5. `AdminApproval`: `status→APPROVED`, `actionedAt`, `adminUserId`.
  6. `writeAuditLogTx`: `MERCHANT_APPROVAL_APPROVED` + `MERCHANT_GO_LIVE` (actor, before/after).
  7. **after commit:** `notify()` "you're live" (email + in-app `NotificationType.MERCHANT_VERIFICATION_UPDATE`).
- M5 adds **only** the approve / "you're live" template (`merchantLiveEmail()`) + its notify wiring/test. The **changes-requested + rejected templates already shipped in M3** — do not re-create them here.
- **No cache invalidation** (discovery is uncached).

**Tests (TDD):** approve on a fully-prepared SUBMITTED merchant → ACTIVE/LIVE/VERIFIED + the 2 RMVs ACTIVE/APPROVED + audit (approved + go-live, actor, before/after) + a notify() enqueue (mocked) with the right type/recipient; approve blocked when contract unsigned / <2 RMVs / main branch unconfirmed (each a distinct error); double-approve = no-op; the merchant then appears in discovery (DB-integration, with a confirmed main branch).

**Safety/rollback:** the approve only flips ACTIVE for a fully-gated merchant; revert = code revert (the ACTIVE merchant could be suspended via M6 if needed). **Idempotency:** double-fire no-op. **Pairing note:** **M5 (go-live) + M6 (suspend) must both be merged before production go-live is enabled** (the spec calls suspend a hard go-live prerequisite). **Checkpoint:** a real product-shaped merchant goes created (M2) → onboarded (existing) → submitted (M3) → approved → live → visible (M4).

---

## M6 — Suspend/reactivate + SEC-M1/M2 live-DB + session revocation + cycle-refund + the D-1 `MerchantAdmin.merchantId` contract step

**PR scope:** safe takedown — a suspended merchant is non-operational within seconds, not ~1hr. **Plus the D-1 contract step (deferred out of M1):** reroute the merchant **auth** + branch-user reads of `admin.merchantId` / the `admin.merchant` relation through `MerchantMembership`, then **drop** the transitional `MerchantAdmin.merchantId`. This lands here because M6 already reworks the **same** `admin.merchant.status` reads for SEC-M2 — one auth-flow pass does both.

**Files — Create/Modify:** `src/api/admin/merchants/{routes,service}.ts` (suspend/reactivate); tests `tests/api/admin/suspend-reactivate.test.ts`, `tests/api/redemption/suspend-live-status.test.ts`, `tests/api/merchant/suspend-portal-readonly.test.ts`, `tests/api/merchant/merchantid-contract-step.test.ts` (D-1 drop). **Modify:** `src/api/redemption/routes.ts` (SEC-M1), `src/api/auth/merchant/{service,routes,branch-user.service}.ts` (SEC-M2 resolve/refresh **+ the D-1 reroute** of the direct `admin.merchantId` / `include: { merchant: true }` reads), `src/api/shared/auditEvents.ts`, `prisma/schema.prisma` (+ drop migration), `prisma/seed.ts` (drop `merchantId` from the `merchantAdmin` create).

**Schema (migration `drop_merchant_admin_merchantid`):** **after** the auth reroute below, drop `MerchantAdmin.merchantId` (+ its `@unique`) and the `MerchantAdmin.merchant` relation field (+ the reverse `Merchant.admin`). Non-additive; safe only because data is seed/test-only — the migration first asserts every `MerchantAdmin` has an ACTIVE OWNER membership. **Depends on M1 having shipped the backfill** (the membership rows the reroute reads).

**Contracts:**
- `POST /api/v1/admin/merchants/:id/suspend` (cap `merchant:suspend`, body `{ reason }`) — one `$transaction`: `Merchant.status→SUSPENDED`, `onboardingStep→SUSPENDED`; audit `MERCHANT_SUSPENDED` (actor, reason); **after commit:** revoke cached Redis sessions (`RedisKey.authMerchant(merchantId-owner-admin)` + every `authBranch` for the merchant's branch users). `POST …/reactivate` → `status→ACTIVE`, `onboardingStep→LIVE`; audit `MERCHANT_REACTIVATED`.
- **SEC-M1 (`redemption/routes.ts:140,153,193,207`):** on the redeem + verify paths, replace the cached `session.isActive`/`merchantSession.isSuspended` *decision* with a **live-DB read** of `merchant.status===ACTIVE` + `branch.isActive` (the cached session may identify the actor; it must not decide active/suspended). Throw `MERCHANT_SUSPENDED`/`BRANCH_ACCESS_DENIED` from live state.
- **SEC-M2 (`auth/merchant` resolve/refresh):** `resolveAdminMerchant` (or a wrapper used by merchant-portal reads) + token refresh re-check `merchant.status` live → a suspended OWNER gets a read-only `MERCHANT_SUSPENDED` response, not full access until token expiry.
- **Cycle-refund (D-4):** when a merchant is suspended, an **un-validated** in-flight `VoucherRedemption` (code created, not yet validated) does **not** consume the user's cycle-state — on the verify-fail-due-to-suspension path, do not advance/keep the cycle consumption for that redemption (a validated redemption stays historical). Implement in the verify guard (where the suspension now blocks).
- **D-1 contract step (deferred from M1):** reroute the remaining direct consumers of the transitional field to resolve via `MerchantMembership` (OWNER membership → merchantId, then load the merchant) — `auth/merchant/service.ts` (`loginMerchant` / `verifyMerchantOtp` / `completeMerchantLogin`), `auth/merchant/routes.ts` (refresh / reactivate), `auth/merchant/branch-user.service.ts`. This is the **same code SEC-M2 touches** for live `merchant.status`, so do both in one pass. Then **drop `MerchantAdmin.merchantId` + the `merchant` relation (+ reverse `Merchant.admin`)** and remove `merchantId` from the seed `merchantAdmin` create. After this, `MerchantMembership` is the **sole** ownership source of truth (D-1 end-state).

**Tests (TDD):** suspend → merchant + branches vanish from discovery (live DB); the **verify path rejects on live DB even with a still-cached active session** (the SEC-M1 pin — set a cached "active" session, suspend in DB, assert verify fails); `resolveAdminMerchant`/refresh returns read-only SUSPENDED (SEC-M2); sessions revoked in Redis; reactivate restores; cycle-state **not** consumed for an un-validated in-flight redemption when the merchant is suspended pre-validation; **D-1 post-drop:** merchant login / OTP / branch-user management still resolve the merchant via `MerchantMembership` after `MerchantAdmin.merchantId` is dropped (auth non-regression with the column gone), and a grep/build check confirms no code still reads `merchantAdmin.merchantId` or `include: { merchant: true }` on a merchantAdmin.

**Safety/rollback:** suspend is reversible (reactivate); the live-DB reads add one indexed query on the redeem/verify path (acceptable — not a list endpoint). **The D-1 drop is the one non-additive migration in the slice** — its down-path (recreate `merchantId` + the relation, backfill from each admin's OWNER membership) is documented in the M6 PR; safe because no production merchants exist, and M6 must land after M1's backfill. **Idempotency:** suspend/reactivate are state-flips (re-suspending = no-op). **Checkpoint:** the full lifecycle is safe end-to-end; SEC-M1/M2 pinned; `MerchantMembership` is the sole ownership source of truth (D-1 end-state reached).

---

## Tests summary (per milestone) + how to run

- **Backend (vitest):** `npx vitest run tests/api/<area>/...`. Per-milestone areas: M1 `tests/api/merchant/membership.test.ts` (+ existing merchant suites); M2 `tests/api/admin/`; M3 `tests/api/admin/approvals-*.test.ts` + `tests/api/merchant/onboarding.test.ts`; M4 `tests/api/customer/discovery/location-confidence-gate.test.ts` (DB-integration — Neon) + `tests/api/admin/confirm-location.test.ts`; M5 `tests/api/admin/approve-go-live.test.ts`; M6 `tests/api/redemption/suspend-live-status.test.ts` + `tests/api/admin/suspend-reactivate.test.ts`.
- Each milestone PR: focused suite green + `npx tsc --noEmit` clean (accept only the 4 known `tests/api/customer/savings.service.test.ts` baseline errors) + a blast-radius sweep of touched areas. DB-integration tests use the sweep-by-prefix fixture pattern (`tests/api/_shared/fixtureSweep.ts`). PR #209 fixed the prior atomic-limiter↔queue real-Redis db-15 collision (the two files now use separate isolated Redis test DBs) — this is **not** an active flaky issue. **Standing rule:** any real-Redis test file that calls `flushdb()` must claim its own isolated Redis test DB (do not share one with another `flushdb()` file).

---

## Rollback / safety (slice-wide)

- All schema changes are additive **except** the `MerchantAdmin.merchantId` drop, which lives in **M6** (deferred out of M1 — the auth + branch-user flows read the column + the `admin.merchant` relation directly, so the drop pairs with M6's SEC-M2 auth rework). That one non-additive migration is safe only because data is seed/test-only; M6 reroutes the auth reads + verifies every `MerchantAdmin` has an OWNER membership before dropping. Document its down-path in the **M6** PR. **M1 itself is fully additive.**
- The slice ships **dark of customer impact**: no real merchant is ACTIVE until an admin approves one through the new actioner, and discovery already gated on `status=ACTIVE` (M4 only tightens branch visibility, hiding nothing live). Lifecycle email stays dark until `EMAIL_ENABLED`.
- **Production-enablement gate:** M5 (go-live) + M6 (suspend/SEC-M1/M2) must both be merged before any production merchant is taken live.

## Deferred (carried from spec §15 — NOT in this slice)

Self-register / `MerchantLead` / claim-token · verification pre-score (Google Places/FHRS/CH/dup + degraded mode) · curated-terms §20 / type-builder §21 / admin-panel-management §22 · merchant-portal + admin-panel **UI** (Phase 3) · standalone post-launch VOUCHER approval + the submit-enqueue bug fix · day-2 add-branch + edit-tiering/pending-edit applier · full admin role/grant expansion + invite-bootstrap + grant UI · `AdminCapabilityGrant` table · **`BRANCH_MANAGER`/`STAFF` `MerchantRole` enforcement** (the enum + the `MerchantMembershipBranch` join ship in M1, but only `OWNER` is resolved/enforced in Slice 1 — D-7's chain/franchise model is **structural-only** here; per-branch capability scoping is a later slice) · multi-merchant-per-person sessions · ownership transfer · merchant GDPR/DSAR · post-live monitoring · duplicate-business-at-registration.

## Owner decisions still needed before implementation

- **None blocking.** D-1..D-7 are resolved in the spec. Two confirmations to make at the relevant milestone (not blockers): in M3, confirm `reject` sets `MerchantStatus→INACTIVE` (vs leaving `REGISTERED`) — the plan uses `INACTIVE`; in M5, confirm the "you're live" email copy at template time (owner copy review — non-blocking, ships dark).

---

**End of plan.** No code written. Awaiting review before committing/opening a docs PR.

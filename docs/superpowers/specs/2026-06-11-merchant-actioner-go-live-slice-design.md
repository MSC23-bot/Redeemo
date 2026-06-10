# Phase 2 — Slice 1: Merchant Actioner + Go-Live (backend) — Design Spec

**Status:** DRAFT (brainstorming output → spec). Implementation plan NOT written yet.
**Date:** 2026-06-11
**Parent spec:** `docs/superpowers/specs/2026-06-10-merchant-portal-admin-onboarding-design.md` (the full Phase-2 design; this slice implements a bounded part of it).
**Prereqs:** Phase 0 foundations COMPLETE (notify/outbox, BullMQ, §SEC.1 limiter, R2 lib, photo-moderation gate, staging config) — all merged.

---

## 0. Goal, scope, principle

**Goal:** build the **backend/admin actioner spine** so Redeemo can take a *submitted* merchant through **review → request-changes → reject → approve → go-live → suspend/reactivate**, with a correct ownership foundation, transactional audit, and lifecycle notifications. This closes the binding constraint: today `AdminApproval` has writers but **zero readers** — no merchant can reach `ACTIVE` through the product (it is seed-only).

**Governing principle (inherited, locked):** *An admin may act **FOR** a merchant, never **AS** a merchant.* The merchant always owns their credentials, legal acceptance, and commercial offer.

**This slice is backend only** — admin REST routes + services + tests, exercisable end-to-end via the API. **No UI** (the admin-panel actioner inbox and the merchant onboarding-workspace are Phase 3).

**IN:** `MerchantMembership` foundation + first OWNER + last-OWNER guard · a minimal admin/test path to produce a SUBMITTED merchant · the `AdminApproval` actioner (queue reads + claim-to-review + approve / request-changes / reject) · the atomic go-live transition (4-axis + RMV activation) · suspend/reactivate + SEC-M1/M2 live-DB status checks + session revocation · the §19.1 per-branch location-confidence visibility gate · platform-wide audit (`actorId/actorType` + before/after + transactional) · admin capability enforcement for these routes · lifecycle notifications via Phase-0 `notify()` · idempotency/concurrency protections.

**OUT (later slices):** self-register / `MerchantLead` / claim-token · verification pre-score (Google Places/FHRS/CH/dup) · curated-terms §20 / type-builder §21 / admin-panel-management §22 · merchant-portal UI + admin-panel UI (Phase 3) · standalone post-launch VOUCHER approval + the submit-enqueue bug fix · full admin role/grant expansion + invite-bootstrap UI · multi-merchant-per-person sessions · merchant GDPR/DSAR.

---

## 1. Cross-check: anchor → verified code reality → this slice

| Item | Verified code reality | This slice |
|---|---|---|
| **Actioner** | **Absent** — no `adminApproval.findMany/update`; only the submit (write) side exists | Build the queue reads + actions (§5) |
| **`resolveAdminMerchant`** | `src/api/merchant/shared.ts` reads `merchantAdmin.merchantId` (1:1) | Reroute via `MerchantMembership` (§3) |
| **`submitForApproval`** | flips `status→PENDING_APPROVAL`, `onboardingStep→SUBMITTED`; **leaves `verificationStatus=NOT_SUBMITTED`** | Fix: submit also sets `verificationStatus→PENDING` (§2) |
| **`verificationStatus`** | enum exists; **never written (inert)** | Wire it end-to-end (§2, §6) |
| **`onboardingStep`** | only ever written `SUBMITTED`; `APPROVED/LIVE/NEEDS_CHANGES` unreachable | Drive the full transition table (§2) |
| **`AdminApproval`** | `type/status/referenceId/referenceType/adminUserId/comment/submittedAt/actionedAt`; no claim fields; `ApprovalStatus` = `PENDING/APPROVED/REJECTED` | `+= claimedById, claimedAt`; `ApprovalStatus += CHANGES_REQUESTED` (§5, §13) |
| **Go-live** | discovery gates `merchant.status===ACTIVE && !isTestData` (merchant) + branch `isActive && !isTestData` (`discovery/service.ts:338`) | Atomic flip to ACTIVE + per-branch gate (§6, §8) |
| **Branch location gate (§19.1)** | branch query has **no `locationConfidence` gate**; `hasExactPosition` (`:98`) = `MANUALLY_CONFIRMED` only, ranking accepts both | Add the confirmed-set visibility gate + unify the set (§8) |
| **RMV / voucher** | voucher submit does **not** enqueue an `AdminApproval` (post-launch path bug — deferred); 2 RMVs gate submission via `getOnboardingChecklist` | Holistic: approve activates merchant + its 2 RMVs together (§6) |
| **Audit** | `AuditLog` has **no actor** (only `entityId/entityType`); `writeAuditLog` fire-and-forget; no approval/go-live events | `+= actorId/actorType` + before/after; transactional for actioner; new events (§9) |
| **Notifications** | `notify()` used only for password-reset + branch-PIN; `MERCHANT_VERIFICATION_UPDATE`/`VOUCHER_APPROVAL_UPDATE` defined, **never used** | Wire lifecycle notifications (§11) |
| **Admin RBAC** | `AdminRole` enum exists, **never enforced (SEC-M3)** | `requireAdminCapability` on actioner routes (§10) |
| **Suspend safety (SEC-M1/M2)** | verify path + merchant-resolve read **cached** session status (`routes.ts:140,153,193,207`) — ≤1hr stale | Live-DB checks + session revocation (§7) |
| **Merchant creation** | **no self-register/create endpoint** — seed-only | Minimal admin/service path (§4) |

**Corrections/additions beyond the anchor list:**
- The submit step's `verificationStatus` is left inert — a real coherence bug to fix in this slice, not just "wire on approve."
- `ApprovalStatus` needs a `CHANGES_REQUESTED` value (the parent spec put NEEDS_CHANGES only on `OnboardingStep`; the queue needs a status to filter "with merchant" vs "to review").
- `hasExactPosition` vs ranking use **different** confirmed-sets — unify, or branch visibility and position-exposure disagree.

---

## 2. Lifecycle state model for this slice (the transitions wired)

The 4 axes stay; this slice makes the missing transitions reachable through the product (the actioner is the single atomic writer of review/approval transitions).

| Transition | Actor | MerchantStatus | OnboardingStep | VerificationStatus | Side effects |
|---|---|---|---|---|---|
| Submit (exists; fix verif.) | merchant (OWNER) | REGISTERED→PENDING_APPROVAL | →SUBMITTED | NOT_SUBMITTED**→PENDING** | write `AdminApproval(MERCHANT_ONBOARDING)` |
| Claim-to-review | admin | PENDING_APPROVAL | SUBMITTED→**UNDER_REVIEW** | PENDING | `AdminApproval.claimedById/claimedAt` |
| Request changes (reason) | admin | PENDING_APPROVAL | →**NEEDS_CHANGES** | PENDING | `AdminApproval.status→CHANGES_REQUESTED`+comment; merchant edit re-opens |
| Resubmit | merchant | PENDING_APPROVAL | NEEDS_CHANGES→SUBMITTED | PENDING | reopen the same `AdminApproval`→PENDING; clear claim |
| Approve → go-live | admin | →**ACTIVE** | →**LIVE** | →**VERIFIED** | activate 2 RMVs; atomic (§6) |
| Reject (reason) | admin | →INACTIVE | →**REJECTED** (reopenable) | →**REJECTED** | `AdminApproval.status→REJECTED`+comment |
| Suspend (reason) | admin | →SUSPENDED | →SUSPENDED | (unchanged) | revoke sessions; live-DB enforcement (§7) |
| Reactivate | admin | SUSPENDED→ACTIVE | →LIVE | VERIFIED | audit |

Additive enum changes: `OnboardingStep += UNDER_REVIEW, REJECTED`; `ApprovalStatus += CHANGES_REQUESTED`. (No values removed/renamed.)

---

## 3. `MerchantMembership` foundation + first OWNER (E1)

**Decision (E1):** build the membership data model now, correct from the start; do NOT build the full role/grant UI.

- **New model `MerchantMembership`** = `(id, merchantId, merchantAdminId, role MerchantRole, allBranches Boolean @default(true), status UserStatus, invitedById?, createdAt, updatedAt, @@unique([merchantId, merchantAdminId]))` **+ a new join table `MerchantMembershipBranch(id, membershipId, branchId, createdAt, @@unique([membershipId, branchId]))`** for scoped branch assignment (D-2 — franchise-ready now). New enum `MerchantRole { OWNER, BRANCH_MANAGER, STAFF }`. **Effective branch scope** = `allBranches ? every merchant branch : the MerchantMembershipBranch rows`. OWNER memberships use `allBranches=true` (no join rows). The join table is **built now (D-2 + D-7: multi-branch/franchise targeted early) but populated only when a BRANCH_MANAGER is assigned branches (a later slice)** — Slice 1 creates **OWNER memberships only**.
- **Identity vs membership:** `MerchantAdmin` remains the **person/login** (email, passwordHash, name, OTP). `MerchantMembership` carries **(person → merchant, role, branch-scope)**. This lets one person hold multiple memberships later **without a second migration** (the E1 goal).
- **Migration (expand-contract, safe because only seed/test merchants exist):** add `MerchantMembership` + `MerchantRole`; **backfill** one `OWNER` membership (`allBranches=true`, status=ACTIVE) per existing `MerchantAdmin`; switch `resolveAdminMerchant` and all merchant-scoped reads to resolve **admin → OWNER membership → merchantId**; then **drop `MerchantAdmin.merchantId @unique`** (the contract step). (D-1: RESOLVED — drop now.)
- **Session/JWT:** stays admin-id-keyed in this slice (exactly one active membership per admin), so resolution is unambiguous. The membership model is multi-ready; the **merchant-context-in-JWT** for multi-membership is a later slice. (Forward-compatible, not built now.)
- **First OWNER:** created in the same transaction as the `Merchant` (by the §4 creation path); register/claim will reuse this in a later slice.
- **Last-OWNER protection (§18.1 #4):** a guard refuses to remove/deactivate the last `OWNER` membership of a merchant (orphan prevention) — hard error. (Ownership *transfer* itself is a later slice; the guard ships now so nothing can orphan an account.)
- `BRANCH_MANAGER`/`STAFF` are **modelled** (enum + scope shape) but their capability matrix + branch-scope enforcement are designed-not-built here (the actioner doesn't need them).

---

## 4. Minimal merchant-creation / preparation path (E2)

**Decision (E2):** no full self-register/lead/claim in this slice, but a **clean, testable backend path** to produce a SUBMITTED merchant — not "seed-only pretending to be the product path."

**Recommendation (smallest safe):** an **admin-operations service+route** `createMerchantDraft` (capability-gated, audited) that creates, in **one transaction**, a `Merchant` (REGISTERED) + a `MerchantAdmin` (the OWNER person, `mustChangePassword`, no admin-known password — credential set by the merchant via the existing reset-link flow) + the first `OWNER` `MerchantMembership`. The merchant then completes onboarding (existing branch/contract/RMV services) and `submitForApproval` exactly as today. This:
- gives the actioner a **real, product-shaped** SUBMITTED merchant to act on (not a seed fixture),
- reuses the "act FOR not AS" rule (admin never sets/knows the password),
- is the seed for the later self-register/claim slice (same Merchant+OWNER-membership transaction).

Tests may additionally use a **service-level test helper** to fast-forward a merchant to SUBMITTED without HTTP. **Seed** keeps a SUBMITTED example for manual QA. The spec does **not** claim seed is the product path. (D-3: RESOLVED — `createMerchantDraft` is included.)

---

## 5. The `AdminApproval` actioner — queue reads + actions

**Decision (E6):** holistic onboarding approval; no partial-approve.

**New admin routes (capability-gated, §10):**
- `GET /api/v1/admin/approvals` — list/filter the unified queue by `type`, `status`, `claimedById`, age; paginated; for the MERCHANT_ONBOARDING card returns the submission summary + the inline onboarding checklist + the 2 mandatory RMVs.
- `GET /api/v1/admin/approvals/:id` — one approval + its target detail.
- `POST /api/v1/admin/approvals/:id/claim` — claim-to-review (sets `claimedById/claimedAt`; merchant `OnboardingStep→UNDER_REVIEW`). `POST …/release` — release.
- `POST /api/v1/admin/approvals/:id/approve` — holistic approve → the go-live transition (§6).
- `POST /api/v1/admin/approvals/:id/request-changes` — body `{ reason }` → `OnboardingStep→NEEDS_CHANGES`, `AdminApproval.status→CHANGES_REQUESTED`+comment, notify.
- `POST /api/v1/admin/approvals/:id/reject` — body `{ reason }` → reject (reopenable).
- `POST /api/v1/admin/branches/:id/confirm-location` — **admin pin-drop fallback** (capability-gated, audited): sets `branch.latitude/longitude` + `locationConfidence=MANUALLY_CONFIRMED` so a `POSTCODE_CENTROID` main branch is **never a permanent go-live blocker** (Q7). The merchant-side exact-pin confirmation already exists (`docs/superpowers/specs/2026-05-14-merchant-exact-pin-confirmation-design.md`); this is the admin fallback the actioner needs so approve isn't blocked by an unconfirmed pin.

**Actioner rules:** unified inbox over all `ApprovalType`s (this slice fully implements `MERCHANT_ONBOARDING`; other types remain submit-only / deferred). **Claim-to-review** prevents double-handling. **Holistic** — one approve reviews the whole submission incl. the 2 RMVs and activates them together. **No bulk-approve.** Every action is **atomic + idempotent** (§12) and writes a **transactional audit** record (§9) + a **notification** (§11). **Reject is reopenable** (admin-only, audited). Resubmission **reopens the same `AdminApproval` thread** (referenceId=merchantId) with history in `AuditLog`.

---

## 6. Atomic go-live transition

**On approve, in ONE `prisma.$transaction`:**
1. Re-assert still-actionable (status PENDING/CHANGES-resubmitted; not already actioned) — idempotent no-op otherwise.
2. Re-validate the go-live gates server-side (do not trust the submit-time snapshot): contract `SIGNED` (by the merchant), ≥2 mandatory RMVs present, ≥1 valid main branch, `isTestData=false`, and the **branch-eligibility predicate** for at least the main branch (§8) — i.e. the main branch must be confirmed (`locationConfidence ∈ CONFIRMED_SET`). If it is still `POSTCODE_CENTROID`, approve is blocked with a clear "confirm the main branch location first" error; the admin resolves it via the §5 `confirm-location` pin-drop (or the merchant confirms their pin). The approve transaction does not silently go-live an unconfirmed location.
3. `Merchant`: `status→ACTIVE`, `onboardingStep→LIVE`, `verificationStatus→VERIFIED`.
4. **Activate the mandatory RMVs**: the merchant's `isRmv` vouchers `status→ACTIVE`, `approvalStatus→APPROVED`, `approvedBy`=actor, `approvedAt`=now.
5. `AdminApproval`: `status→APPROVED`, `actionedAt`, `adminUserId`=actor.
6. **Transactional `AuditLog`** (`MERCHANT_APPROVAL_APPROVED` + `MERCHANT_GO_LIVE`, actor=admin).
7. After commit (best-effort): `notify()` "you're live" (§11).

**No cache invalidation** needed (discovery is uncached — live DB query; §12). The merchant + its eligible branches appear on the next discovery query. Branch-level visibility follows §8 (a chain goes ACTIVE; only confirmed branches show).

---

## 7. Suspend / reactivate + SEC-M1/M2 (E4)

**Decision (E4):** a merchant cannot be made live unless we can take them down immediately.

- **`POST /api/v1/admin/merchants/:id/suspend`** (capability-gated, reason required), one transaction: `Merchant.status→SUSPENDED`, `onboardingStep→SUSPENDED` + transactional audit (`MERCHANT_SUSPENDED`, actor, reason) + **revoke the merchant's cached Redis auth sessions** (`authMerchant` + every `authBranch` for its branch users). **`/reactivate`** reverses (→ACTIVE/LIVE).
- **SEC-M1 (verify path):** `redemption/routes.ts:140,153,193,207` read `session.isActive` / `merchantSession.isSuspended` from the **cached** login snapshot (≤1hr stale). Fix: on the redeem + verify paths, **re-check `merchant.status===ACTIVE` and `branch.isActive` from the live DB** for the suspend/active decision (the cached session may identify the actor but must not decide active/suspended).
- **SEC-M2 (portal resolve/refresh):** `resolveAdminMerchant` + the merchant token-refresh must **re-check `merchant.status` live** → a suspended OWNER drops to a **read-only SUSPENDED** state ("Your account is suspended. [reason]."), not full access until token expiry.
- **Customers mid-cycle:** an in-flight (un-validated) redemption now fails validation; **recommend not consuming the cycle-state** for an un-validated in-flight redemption so the customer isn't penalised (a validated redemption stays historical). (D-4: RESOLVED — included.)

SEC-M1 + SEC-M2 are **hard go-live prerequisites** — bundled here deliberately.

---

## 8. Branch visibility / location-confidence gate (§19.1, E5)

**Decision (E5):** include, kept tight + tested (it touches customer discovery).

- **Per-branch visibility predicate** (replaces the merchant-level-only gate): a branch is discovery-visible + redeemable iff `merchant.status===ACTIVE AND branch.isActive AND branch.locationConfidence ∈ CONFIRMED_SET AND branch.localityId != null AND branch.isTestData===false AND branch.deletedAt==null`.
- **`CONFIRMED_SET = { MANUALLY_CONFIRMED, ADDRESS_GEOCODED }`** — a single shared constant used by **(a)** the discovery branch query (`discovery/service.ts:338` gains the `locationConfidence` gate), **(b)** `hasExactPosition`/position-exposure (currently `MANUALLY_CONFIRMED`-only at `:98` — unify so an `ADDRESS_GEOCODED` branch is visible **with** its geocoded position), and **(c)** the §6 go-live gate. (D-5: RESOLVED — `ADDRESS_GEOCODED` branches expose their geocoded coordinates.)
- **Effect:** a chain goes ACTIVE once its main branch is confirmed; additional branches appear independently as each is confirmed; unconfirmed branches stay hidden (don't block the merchant or siblings). Vouchers stay merchant-wide (available at every *visible* branch). New day-2 branches are created hidden (pending) — but that day-2 add flow is a later slice; this slice covers the predicate + the go-live read.

**Tight + tested:** the only customer-facing change is the added predicate + the unified position-exposure; pinned by discovery integration tests (visible vs hidden by confidence; chain partial-visibility).

---

## 9. Platform-wide audit + actor (§11)

- **`AuditLog += actorId String, actorType ActorType`** (new enum `ActorType { ADMIN, MERCHANT_ADMIN, BRANCH_MANAGER, BRANCH_STAFF, CUSTOMER, SYSTEM }`) — separate from the affected `entityId/entityType`. `+= before Json?, after Json?, reason String?` (structured before/after for state changes; reason for actioner decisions).
- **Transactional** for the actioner/suspend/go-live transitions (write the `AuditLog` inside the same `$transaction` as the state change), so the trail can never diverge from the action. `writeAuditLog` keeps its fire-and-forget form for low-stakes telemetry; a new `writeAuditLogTx(tx, …)` variant runs inside a transaction.
- **New events:** `MERCHANT_APPROVAL_APPROVED, MERCHANT_APPROVAL_REJECTED, MERCHANT_CHANGES_REQUESTED, MERCHANT_GO_LIVE, MERCHANT_SUSPENDED, MERCHANT_REACTIVATED, MERCHANT_APPROVAL_CLAIMED, MERCHANT_APPROVAL_RELEASED, MERCHANT_RESUBMITTED, MEMBERSHIP_CREATED`.
- **Backfill `actorId/actorType` at existing call sites** opportunistically where the actor is known (additive; existing rows get null actor).

---

## 10. Admin capability enforcement for this slice (E7)

**Decision (E7):** minimal enforcement now, grant-ready design.

- Keep the `AdminRole` enum; **expand additively** with the roles this slice needs if missing (`+= ADMIN` for the Platform-Manager tier; SALES/MARKETING are designed-not-added unless needed). 
- **`requireAdminCapability('cap')`** middleware + a **code-level role→capability map** (not route-role-hardcoded). This slice defines + enforces a small capability set: `approval:read`, `approval:action` (claim/approve/request-changes/reject), `merchant:suspend`, `merchant:create-draft`. Mapped to `SUPER_ADMIN` (all) + `ADMIN` + `OPERATIONS` (approvals + lifecycle). This is the **first enforced admin surface** (closes SEC-M3 for these routes).
- **Grant-ready (design-only):** document the `AdminCapabilityGrant` model shape (effective = role-modules ∪ grants − revokes) but **do not build the grant table, migration, or UI** in this slice — the role→capability map is enough to gate it. (D-6: RESOLVED — design-only.)

---

## 11. Lifecycle notifications via Phase-0 `notify()`

Each actioner transition enqueues a notification through the existing `notify()` (outbox + dark-by-default; real send gated by `EMAIL_ENABLED`):
- **Approve/go-live** → "You're live on Redeemo" (merchant OWNER).
- **Request-changes** → "Changes needed: <reason>" + what to fix.
- **Reject** → "Application not approved: <reason>".
- New **email templates** in `emailTemplates.ts` (one pair: approval-outcome + changes-requested), recipient = the merchant OWNER's email. **In-app** `Notification` row written with `NotificationType.MERCHANT_VERIFICATION_UPDATE` (wires the so-far-unused type; the in-app feed read path stays Phase-6, but the row persists for it).
- Sent **after commit** (best-effort; the outbox guarantees eventual delivery; never blocks/rolls back the actioner transaction).

---

## 12. Idempotency / concurrency

- **Each actioner action runs in one `prisma.$transaction`** that (a) re-reads the `AdminApproval` + merchant **for update**, (b) asserts still-actionable, (c) flips approval + entity state + writes the transactional audit. A second concurrent/duplicate action is a **safe no-op** (the status already moved) — reuse the `StripeWebhookEvent`-style idempotency precedent.
- **Claim race:** claim is a conditional update (`WHERE claimedById IS NULL`) — only one admin wins.
- **Resubmit-while-under-review race (§18.2):** the resubmit path checks the approval is in `CHANGES_REQUESTED`/`NEEDS_CHANGES`; a merchant editing while an admin is mid-review is re-queued cleanly (the action transaction re-reads current state).
- **Go-live double-fire:** the merchant is already `ACTIVE` → no-op + idempotent audit.
- Notifications are **at-least-once** via the outbox; the `notify()` idempotency (CommunicationLog) + Resend idempotency-key cover duplicates.

---

## 13. Exact schema changes (additive + one expand-contract)

**Enums (additive):**
- `OnboardingStep += UNDER_REVIEW, REJECTED`
- `ApprovalStatus += CHANGES_REQUESTED`
- new `MerchantRole { OWNER, BRANCH_MANAGER, STAFF }`
- new `ActorType { ADMIN, MERCHANT_ADMIN, BRANCH_MANAGER, BRANCH_STAFF, CUSTOMER, SYSTEM }`
- `AdminRole += ADMIN` (if not present)

**Models:**
- new `MerchantMembership(id, merchantId, merchantAdminId, role MerchantRole, allBranches Boolean @default(true), status UserStatus, invitedById?, createdAt, updatedAt, @@unique([merchantId, merchantAdminId]))`.
- **new `MerchantMembershipBranch(id, membershipId, branchId, createdAt, @@unique([membershipId, branchId]))`** (D-2 — built now, franchise-ready; populated only for scoped BRANCH_MANAGERs in a later slice).
- `AdminApproval += claimedById String?, claimedAt DateTime?` (+ FK `claimedBy AdminUser?`).
- `AuditLog += actorId String?, actorType ActorType?, before Json?, after Json?, reason String?`.
- **Expand-contract (D-1: drop now):** backfill one OWNER `MerchantMembership` per existing `MerchantAdmin`, reroute `resolveAdminMerchant` + all merchant-scoped reads through the membership, then **drop `MerchantAdmin.merchantId`** (and its `@unique`) — safe, seed/test-only data, no real merchants exist.
- **`AdminCapabilityGrant` — NOT added this slice (D-6).** Design-only: the role→capability map (§10) gates Slice 1; the grant table + the effective-access model (`role-modules ∪ grants − revokes`) are documented for a later admin/RBAC slice.

All migrations applied via `prisma migrate deploy` (additive + the one safe column drop; no data loss — no real merchants exist).

---

## 14. Tests required

- **Membership migration + `resolveAdminMerchant`:** backfilled OWNER membership resolves the same merchantId; last-OWNER guard rejects orphaning.
- **Actioner state machine (the core):** submit (verif→PENDING) · claim (→UNDER_REVIEW) · request-changes (→NEEDS_CHANGES + CHANGES_REQUESTED + reason) · resubmit (reopen) · reject (→REJECTED, reopenable) · approve → go-live (ACTIVE/LIVE/VERIFIED + 2 RMVs ACTIVE/APPROVED) — each asserting the 4-axis result + the transactional audit row (actor + before/after + reason).
- **Idempotency/concurrency:** double-approve = no-op; claim race = single winner; approve re-validates gates server-side.
- **Suspend safety (SEC-M1/M2):** suspended merchant → verify path rejects on **live DB** (not cached session); `resolveAdminMerchant` returns read-only SUSPENDED; sessions revoked. (Pin the live-DB read explicitly.)
- **Branch visibility (§8):** APPROVED merchant with a `MANUALLY_CONFIRMED` + an `ADDRESS_GEOCODED` + a `POSTCODE_CENTROID` branch → only the first two are discovery-visible; chain partial-visibility; the unified `CONFIRMED_SET` across visibility + position-exposure + go-live. (DB-integration, customer-facing — test tightly.)
- **Capability enforcement:** the actioner/suspend routes reject a SUPPORT/CONTENT admin and allow OPERATIONS/ADMIN/SUPER_ADMIN.
- **Notifications:** each transition enqueues the right `notify()` type/recipient (mocked, like the Phase-0 placeholder-wiring tests).
- **Minimal creation path (§4):** `createMerchantDraft` creates Merchant + OWNER membership + MerchantAdmin atomically; admin never receives the password.

---

## 15. Deferred to later slices (explicit)

Self-register / `MerchantLead` / claim-token + claim edge cases · verification pre-score (Google Places/FHRS/CH/dup + degraded mode §19.3) · curated-terms §20 + type-builder §21 + admin-panel-management §22 (the `TermsClause` library is *seeded* later, before Phase-3 portal) · merchant-portal UI + admin-panel UI (Phase 3) · standalone post-launch VOUCHER approval + the submit-enqueue bug fix · day-2 add-branch flow + day-2 edit tiering/pending-edit applier · full admin role/grant expansion + invite-bootstrap + grant UI · multi-merchant-per-person sessions · ownership transfer · merchant GDPR/DSAR · post-live monitoring (§18.1 #6) · duplicate-business-at-registration (§18.1 #2).

---

## 16. Decisions — RESOLVED (owner, 2026-06-11)

- **D-1 — drop `MerchantAdmin.merchantId` now: YES.** Clean `MerchantMembership` foundation; backfill OWNER memberships, reroute resolution, drop the old 1:1 field (no real data yet). (§3, §13)
- **D-2 — branch-scope storage: join table now.** Build `MerchantMembershipBranch` in Slice 1 (franchise-ready); OWNER = `allBranches=true`; BRANCH_MANAGER branch assignment populates the join later. (§3, §13)
- **D-3 — include `createMerchantDraft`: YES.** A safe admin/service path to create a merchant draft without setting/knowing the owner's password. (§4)
- **D-4 — cycle-state refund on suspend: YES.** An un-validated in-flight redemption is not consumed when a merchant is suspended (customer-fair). (§7)
- **D-5 — `ADDRESS_GEOCODED` exposes geocoded coordinates: YES.** One shared `CONFIRMED_SET = { MANUALLY_CONFIRMED, ADDRESS_GEOCODED }` for visibility, position exposure, and go-live. (§8)
- **D-6 — `AdminCapabilityGrant`: design-only.** Role→capability map gates Slice 1; the full grant model is documented for a later admin/RBAC slice. (§10, §13)
- **D-7 — chain/franchise first cohort: assume YES (design constraint).** The data model must support multi-branch/franchise **now** (hence D-2's join table + the membership foundation); full BRANCH_MANAGER UI + branch-scope enforcement are **not** built in Slice 1 unless `writing-plans` shows a piece is required for go-live. (§3)

**Still owner/legal (out of this slice):** the Merchant Agreement + solicitor items (contract is a deferred slice); whether a real chain is in the *first launch cohort* operationally (affects sequencing of the later BRANCH_MANAGER slice, not Slice 1's model).

---

## 17. Risks & tradeoffs

- **Large slice → milestones.** Slice 1 spans the membership migration + actioner + go-live + suspend + SEC-M1/M2 + branch-visibility + audit + RBAC + notifications. It is one coherent goal (the actioner spine + safe go-live) but too large for a single uninterrupted build — **`writing-plans` MUST decompose it into ordered milestones** (suggested: ① membership migration + `createMerchantDraft` + audit-actor foundation → ② actioner reads + claim + request-changes/reject → ③ atomic go-live + RMV activation + notifications → ④ suspend/reactivate + SEC-M1/M2 → ⑤ branch-visibility gate), each independently testable, with a checkpoint between.
- **Unenforced-but-present RBAC surface (D-2 + D-7).** Building `MerchantMembership` + `MerchantMembershipBranch` now while deferring BRANCH_MANAGER enforcement means a model exists ahead of its enforcement. *Mitigation:* Slice 1 creates **OWNER memberships only** (`allBranches=true`, no join rows); no route consumes branch-scope yet; the join table is inert until the later BRANCH_MANAGER slice wires `requireBranchScope`. Document the invariant "no BRANCH_MANAGER membership without enforcement."
- **Expand-contract drop (D-1).** Dropping `MerchantAdmin.merchantId` is a non-additive migration; safe *only* because data is seed/test-only. *Mitigation:* the migration runs the backfill + reroute first, asserts every `MerchantAdmin` has an OWNER membership, then drops — and there is no production data to lose. If real merchants somehow existed, this would need a staged expand→verify→contract across deploys.
- **Customer-facing change inside an admin slice (D-5, §8).** Adding the `locationConfidence` visibility gate + exposing `ADDRESS_GEOCODED` positions touches discovery. *Mitigation:* one shared `CONFIRMED_SET` constant + tight DB-integration tests (visible/hidden by confidence; position exposure); no real merchant branches exist yet, so no live impact.
- **SEC-M1/M2 live-DB reads add a query on the hot redeem/verify path.** *Mitigation:* a single indexed `merchant.status`/`branch.isActive` read; acceptable for the redemption path (not a list endpoint). Revisit with a short-TTL cache only if load testing shows it.
- **`notify()` for lifecycle email is still dark.** Approval/rejection emails won't actually send until `EMAIL_ENABLED` + the runbook §6 gates close — expected; the outbox records intent and the in-app `Notification` row persists.

---

**End of slice spec draft.** Implementation plan NOT written. Awaiting review.

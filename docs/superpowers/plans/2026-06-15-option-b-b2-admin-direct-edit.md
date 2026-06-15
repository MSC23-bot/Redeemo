# Option B — B2: Admin Direct-Edit-on-Behalf — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use **superpowers:subagent-driven-development** to implement task-by-task with two-stage review. Steps use `- [ ]`. TDD: failing test, implement, green, commit. Backend on Node 24 (`eval "$(fnm env)"; fnm use 24`). Real-DB tests MUST be named `*.integration.test.ts` (the CI `backend (typecheck + unit)` job runs `test:unit` only). **This plan doc is UNTRACKED — commit it before dispatching a worktree implementer, or carry every fact in the prompt (the B1 lesson: untracked docs are invisible to worktree subagents).**

**Status:** DRAFT (owner-approved decisions locked below; do NOT implement until the owner approves this plan).
**Spec:** `docs/superpowers/specs/2026-06-15-option-b-admin-edit-on-behalf-design.md` (Option B; this is slice **B2**). Builds on **B1** (`project_option_b_b1_complete`) — the pending-edit applier.

**Goal:** Let Redeemo staff edit a merchant's data ON BEHALF, audited as the admin acting for the merchant, reusing the EXACT merchant-side validation/gates (no weaker path). B2 introduces the **D4 service-seam** (`fnCore(merchantId, actor)`) and ships it in small PRs, starting with the lowest-risk DIRECT fields.

**Architecture:** Extract each merchant mutation's core into `fnCore(prisma, { merchantId, actor }, updates)` that runs the identical validation + side-effects + a transactional `writeAuditLogTx(actor)`. The existing merchant route keeps a thin `fn(prisma, ownerAdminId, updates)` wrapper (`resolveAdminMerchant` → core with `actor:{type:'MERCHANT_ADMIN'}`); a NEW admin route resolves the TARGET merchant + calls the SAME core with `actor:{type:'ADMIN', id, reason}`. Additive. `resolveAdminMerchant` is NOT changed (the admin path uses a new target-resolver helper).

**Tech Stack:** Fastify 5, Prisma 7.8 (`generated/prisma`), Neon, ioredis, Vitest; admin-web Next 15 + jest.

---

## Owner decisions (LOCKED)

1. **D4 `fnCore(merchantId, actor)` seam** — NOT parallel admin-only mutation functions.
2. **Merchant-path audit moves to transactional `writeAuditLogTx` with `actorType:'MERCHANT_ADMIN'`** as part of the seam (for the mutations a given PR refactors).
3. **New `merchant:edit` capability** for B2 direct writes — kept separate from B1's `approval:apply-edit`.
4. **Small B2 PRs** — do NOT do all four mutations in one PR.
5. **First PR (B2.1) = lowest-risk DIRECT edits only:** merchant `websiteUrl`; branch `phone, email, websiteUrl, isActive`; + the shared seam + audit + capability + tests.
6. **High-risk fields (`vatNumber`, `companyNumber`, post-go-live `primaryCategoryId`) are OUT of B2.1** — each needs a specific policy + an owner approval point.
7. **Sensitive fields:** post-go-live sensitive changes route through the pending-edit/B1 lane (NOT admin self-apply) — and are OUT of B2.1. Pre-go-live direct sensitive is a later, separately-justified slice.
8. **SUSPENDED merchants:** admin edits ARE allowed for operational fixes, but REQUIRE a `reason` + audit (made explicit in §SUSPENDED below).

---

## Cross-check (readiness → live code → plan)

| Readiness/spec item | Verified live code | B2 disposition |
|---|---|---|
| D4 seam vs parallel admin fns | each merchant mutation is `fn(prisma, ownerAdminId, updates)` inline; no seam; no admin entry | **D4 seam** (decision 1); reject parallel fns (drift / no-weaker-path risk) |
| `resolveAdminMerchant` is the shared resolver (highest sweep risk) | `merchant/shared.ts:5`; membership-based + `MERCHANT_SUSPENDED` block | **UNCHANGED** — admin path uses a NEW `resolveTargetMerchantForAdmin(prisma, merchantId)` helper (allows SUSPENDED; no owner lookup). Lower sweep risk than spec implied. |
| merchant audit is fire-and-forget `writeAuditLog` | `audit.ts:105`; merchant services use it (no actor) | **B2.1 only:** `updateMerchantProfile` + `updateBranch` move to `writeAuditLogTx(actor)`. Other mutations keep `writeAuditLog` until their own B2 PR. |
| merchant DIRECT fields | merchant: `websiteUrl, vatNumber, companyNumber, primaryCategoryId`; branch: `phone, email, websiteUrl, isActive` | **B2.1 admin allow-list = merchant `websiteUrl` ONLY** + branch's 4; the other 3 merchant DIRECT fields are the excluded high-risk set (decision 6). |
| `primaryCategoryId` first-set provisions RMVs (`profile/service.ts:36-86`) | confirmed (`NO_RMV_TEMPLATE` if <2) | core keeps the side-effect; B2.1 admin route simply does NOT pass `primaryCategoryId`, so it never fires on the admin path in B2.1. |
| ADMIN-actor write precedents | `createMerchantDraft`/`suspendMerchant`/`confirmBranchLocation`/B1 `editApplier` all use `writeAuditLogTx(actorType:'ADMIN')` | mirror these. |
| admin can reach a target merchant | merchants list/search (`merchant:read`, PR #240) shipped | no WP2 blocker; B2.1-web extends that surface. |
| go-live model | `MerchantStatus`/`OnboardingStep`/`VerificationStatus` enums exist; "live" = ACTIVE+LIVE+VERIFIED | B2.1 edits only go-live-agnostic DIRECT fields, so NO pre/post-go-live branching needed in B2.1. |

---

## PR breakdown

- **B2.1 (this plan, full detail) — backend seam + first admin DIRECT edit routes.** The `fnCore` seam for `updateMerchantProfile` + `updateBranch`; `merchant:edit` capability; admin routes for merchant `websiteUrl` + branch `phone/email/websiteUrl/isActive`; merchant-path audit → `writeAuditLogTx`; SUSPENDED-with-reason policy; tests + full backend sweep. **Backend only. No schema change.**
- **B2.1-web (immediately after B2.1) — admin-web edit surface.** A merchant-detail/edit view (extends the `/merchants` list from #240) with the B2.1 fields, `merchant:edit`-gated. Separated so the risky seam refactor lands UI-free first. May fold into B2.1 if small.
- **B2.2 (design-level, deferred; own PR + owner approval) — high-risk merchant fields** (`vatNumber`, `companyNumber`): SUPER_ADMIN-only + reason + confirmation (constraint 9).
- **B2.3 (deferred) — `primaryCategoryId` admin edit:** pre-go-live (RMV provisioning) + a post-go-live category-change policy.
- **B2.4 (deferred) — branch `createBranch` + `softDeleteBranch` on behalf** (seam-extend both; the existing safety guards stay).
- **B2.5 (deferred) — post-go-live SENSITIVE on behalf:** admin creates a `MerchantPendingEdit`/`BranchPendingEdit` (reuse `createMerchantEditRequest`/`createBranchEditRequest`) which **B1 applies** (decision 7 — queue, not self-apply).

Each deferred PR is its own plan + reviewable PR + owner approval point.

---

## B2.1 — files / routes / services

**Backend (seam + routes):**
- `src/api/merchant/profile/service.ts` (modify) — extract `updateMerchantProfileCore(prisma, { merchantId, actor }, updates, ctx)`; keep `updateMerchantProfile(prisma, ownerAdminId, updates, ctx)` as the thin wrapper; move its audit to `writeAuditLogTx(actor=MERCHANT_ADMIN)`.
- `src/api/merchant/branch/service.ts` (modify) — extract `updateBranchCore(prisma, { merchantId, actor }, branchId, updates, ctx)`; thin `updateBranch` wrapper; audit → `writeAuditLogTx(actor=MERCHANT_ADMIN)`.
- `src/api/merchant/shared.ts` (modify, additive) — add `resolveTargetMerchantForAdmin(prisma, merchantId)` (load the merchant by id; throw `MERCHANT_NOT_FOUND` if absent; **does NOT block SUSPENDED** — returns `{ merchantId, status }` so the route can require a reason).
- `src/api/admin/capability.ts` (modify) — add `'merchant:edit'` to the union + `ALL_SLICE1_CAPS`. Mirror in `apps/admin-web/lib/auth/session.ts`.
- `src/api/admin/merchants/routes.ts` (modify) — `PATCH /api/v1/admin/merchants/:id/profile` gated `merchant:edit`.
- `src/api/admin/branches/routes.ts` (modify) — `PATCH /api/v1/admin/branches/:branchId` gated `merchant:edit` (resolve the branch's merchant; reuse the merchant route's resolver), OR `PATCH /api/v1/admin/merchants/:id/branches/:branchId`. Confirm path shape at implementation.
- (No new service module needed — the admin routes call the exported `*Core` directly.)

**Tests (B2.1):**
- `tests/api/admin/admin-merchant-edit.integration.test.ts` (new, real-DB) — admin edits merchant `websiteUrl` + branch fields; applied + audited ADMIN before/after/reason; SUSPENDED-with-reason; merchant wrapper still works (MERCHANT_ADMIN audit).
- `tests/api/admin/admin-merchant-edit-routes.test.ts` (new, mock, CI gate) — capability gate (403 without `merchant:edit`); reason required; field allow-list (a non-allow-listed field is rejected/ignored).
- `tests/api/merchant/...` (modify) — update the existing `updateMerchantProfile`/`updateBranch` suites for the `writeAuditLog → writeAuditLogTx` change.
- **Full backend sweep** (M1 lesson) — see §Tests.

---

## B2.1 — tasks (TDD)

### Task 1 — `merchant:edit` capability
- [ ] Add `'merchant:edit'` to `AdminCapability` + `ALL_SLICE1_CAPS` (`capability.ts`); mirror in `apps/admin-web/lib/auth/session.ts`.
- [ ] Test: OPERATIONS + SUPER_ADMIN hold it; FINANCE/CONTENT/SUPPORT do not. Commit.

### Task 2 — `resolveTargetMerchantForAdmin` helper
- [ ] `merchant/shared.ts`: `export async function resolveTargetMerchantForAdmin(prisma, merchantId): Promise<{ merchantId: string; status: MerchantStatus }>` — `findUnique`; throw `MERCHANT_NOT_FOUND` if absent; NO suspended block (B2 §SUSPENDED gates that at the route). Mock test: returns a SUSPENDED merchant (no throw); unknown id throws `MERCHANT_NOT_FOUND`. Commit.

### Task 3 — extract `updateMerchantProfileCore` + audit move (the seam)
- [ ] Write a test for the core: `updateMerchantProfileCore(prisma, { merchantId, actor:{type:'ADMIN', id, reason} }, { websiteUrl }, ctx)` applies `websiteUrl` + writes `writeAuditLogTx(actorType:'ADMIN', before:{websiteUrl:old}, after:{websiteUrl:new}, reason)` in one `$transaction`.
- [ ] Refactor `updateMerchantProfile`: move the body into `updateMerchantProfileCore({ merchantId, actor }, updates)`; the existing function becomes `resolveAdminMerchant(ownerAdminId) → core({ merchantId, actor:{type:'MERCHANT_ADMIN', id: ownerAdminId} })`. Wrap the entity write + audit in a `$transaction` (the category path already is; the simple DIRECT path now is too). Swap `writeAuditLog` → `writeAuditLogTx`.
- [ ] Keep the SENSITIVE rejection + the `primaryCategoryId` RMV side-effect inside the core unchanged (B2.1 admin route won't pass those keys, but the core must still enforce them for the merchant path).
- [ ] Run the merchant-profile suite + fix the audit-shape assertions. Commit.

### Task 4 — extract `updateBranchCore` + audit move
- [ ] Same pattern for `updateBranch` → `updateBranchCore({ merchantId, actor }, branchId, updates)` + thin wrapper; audit → `writeAuditLogTx`. Preserve the `isMainBranch` atomic promotion + soft-delete (`deletedAt:null`) scope. Run the branch suite + fix. Commit.

### Task 5 — admin merchant-profile edit route
- [ ] `PATCH /admin/merchants/:id/profile` gated `merchant:edit`: body Zod = `{ websiteUrl?: string|null, reason: string (min 1) }` (B2.1 allow-list = `websiteUrl` ONLY); resolve via `resolveTargetMerchantForAdmin`; if SUSPENDED require the reason (always required here) + proceed; call `updateMerchantProfileCore({ merchantId, actor:{type:'ADMIN', id: req.user.sub, reason} }, { websiteUrl })`.
- [ ] Integration: admin sets `websiteUrl` → applied + `AuditLog{event:'MERCHANT_PROFILE_UPDATED', actorType:'ADMIN', before/after, reason}`. Mock: 403 without cap; missing reason → 400; a non-allow-listed key (e.g. `businessName`, `companyNumber`) → rejected (Zod strips or 400). Commit.

### Task 6 — admin branch edit route
- [ ] `PATCH /admin/branches/:branchId` (or `/admin/merchants/:id/branches/:branchId`) gated `merchant:edit`: body `{ phone?, email?, websiteUrl?, isActive?, reason }`; resolve the branch + its merchant (admin-side, SUSPENDED-allowed); call `updateBranchCore({ merchantId, actor:ADMIN }, branchId, updates)`. Integration + mock (cap gate, reason, allow-list, soft-deleted branch → `BRANCH_NOT_FOUND`). Commit.

### Task 7 — same-gates + sweep
- [ ] **Same-gates property test:** drive the merchant wrapper AND the admin core with the SAME invalid input (e.g. a SENSITIVE key) → BOTH reject with the same error. **No-weaker-path:** the admin path cannot write a field the merchant path can't.
- [ ] **Full backend sweep** (§Tests). Fix any audit-assertion fallout. Commit.

---

## Capability + role mapping
- New `merchant:edit` (additive): OPERATIONS + SUPER_ADMIN hold it (via `ALL_SLICE1_CAPS`); FINANCE/CONTENT/SUPPORT do not; SUPER_ADMIN auto-inherits. B1's `approval:apply-edit` is unchanged + separate. Admin-web mirror in `lib/auth/session.ts`. Backend `requireAdminCapability('merchant:edit')` is the enforcement (defence in depth); the admin-web mirror is UX.
- **High-risk fields (B2.2+):** `vatNumber`/`companyNumber` gate SUPER_ADMIN-only — NOT in B2.1.

## Audit behavior (before → after)
- **Before:** merchant DIRECT edits write `writeAuditLog` (fire-and-forget, no actor, not transactional).
- **After (B2.1, for the 2 refactored mutations):** BOTH paths write `writeAuditLogTx` inside the mutation `$transaction`: merchant wrapper → `actorType:'MERCHANT_ADMIN'`, `actorId = ownerAdminId`; admin route → `actorType:'ADMIN'`, `actorId = staffAdminId`, `reason`. `before`/`after` carry only the changed allow-listed fields. Event strings reuse `MERCHANT_PROFILE_UPDATED` / `BRANCH_UPDATED` (actor differentiation lives in `actorType`). This is the §3.4 "act FOR, never AS" envelope.

## Validation + same-gates strategy
The `fnCore` is the single validation/gate/side-effect body; the merchant wrapper and the admin route both call it, so the gates are identical by construction (constraint 3). The admin route adds a TIGHTER input allow-list (B2.1: `websiteUrl` / the 4 branch fields) — more restrictive, never weaker. Pinned by the same-gates + no-weaker-path tests (Task 7).

## SUSPENDED merchant policy (explicit, decision 8)
- The merchant self-serve path stays BLOCKED on SUSPENDED (`resolveAdminMerchant` throws `MERCHANT_SUSPENDED`) — unchanged.
- The ADMIN path uses `resolveTargetMerchantForAdmin`, which does NOT block SUSPENDED — an admin MAY edit a suspended merchant for operational fixes. The admin edit routes **require a `reason`** (Zod `min(1)`) on every call, and the `writeAuditLogTx` records `actorType:'ADMIN'`, `actorId`, `before/after`, and the `reason`. So a suspended-merchant edit is always reason-bearing + audited. (No separate "suspended-only" gate in B2.1; reason+audit is the control. A future PR may add a confirmation step for suspended edits if owner wants.)

## Tests per PR + broad-sweep risk
- **B2.1 new:** the admin-edit integration + route-gate tests + the same-gates/no-weaker-path property tests (above).
- **Broad backend sweep (M1 lesson — REQUIRED):** the seam touches `updateMerchantProfile`/`updateBranch` + their audit. Run the FULL backend suite, not just the owning dir. Known-affected suites to re-green: the merchant profile/branch update tests (audit-shape change), `tests/api/merchant/branch/{pin,resolve-on-write}.test.ts`, `tests/api/shared/placeholder-notify-wiring.test.ts`, `tests/api/merchant/membership.integration.test.ts`, `tests/api/merchant/suspend-sec-m2.integration.test.ts`, plus any test asserting `writeAuditLog` for these two mutations. `resolveAdminMerchant` is unchanged, so its consumers should be unaffected (verify, don't assume). Run `tsc --noEmit` both sides.
- **CI gate:** mock route + capability tests are `*.test.ts` (unit project); the real-DB edit tests are `*.integration.test.ts` (run locally in the main checkout — integration is not in the CI unit gate).

## Schema changes
**Expected: NONE.** The audit envelope, capability map, and all models exist. If implementation proves a migration is needed, STOP and report before adding one.

## Rollback risk
- The seam refactor is **additive in interface** (the merchant wrapper signature is preserved). Rollback = revert the PR; the merchant path returns to fire-and-forget audit; the admin routes/capability disappear; no data corruption (audit rows are additive; no entity-shape change).
- **The real risk is the audit-shape change** breaking merchant-service tests mid-refactor — mitigated by the full sweep + updating those tests in the SAME PR.
- No schema, so no migration to roll back.

## Remaining owner decisions (for B2.2+, not blocking B2.1)
1. **B2.2 high-risk policy:** confirm `vatNumber`/`companyNumber` = SUPER_ADMIN-only + reason + confirmation; and whether a confirmation UI step is required.
2. **B2.3 `primaryCategoryId`:** can admins set it pre-go-live (RMV provisioning fires)? Any post-go-live category-change restriction?
3. **B2.1-web:** fold the admin-web edit form into B2.1, or ship it as the immediately-following PR?
4. **Suspended-edit confirmation:** is reason+audit sufficient (B2.1), or add an explicit confirmation step for suspended merchants?
5. **B2.5 post-go-live SENSITIVE:** confirm the "admin creates pending edit → B1 applies" composition (decision 7) when that slice is reached.

---

## Self-review
- Spec coverage: B2.1 covers decisions 1-8; high-risk/sensitive/category explicitly deferred (decisions 6/7) to named PRs.
- No placeholders: each B2.1 task has the concrete file + the exact change.
- Type/name consistency: `*Core` cores + thin wrappers; `resolveTargetMerchantForAdmin` (admin) vs `resolveAdminMerchant` (merchant, unchanged); `merchant:edit` cap.
- The one cross-PR contract: the admin route's field allow-list is the additional admin-side gate; the core owns the shared validation.

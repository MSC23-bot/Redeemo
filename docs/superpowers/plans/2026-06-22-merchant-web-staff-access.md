# Staff & Access (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Do NOT start any PR without explicit owner approval; do NOT merge without a SHA-bound gate.**

**Goal:** Ship the Merchant Portal's first non-owner roles + branch-scope authorization + team management: owners invite portal members (Branch managers / Staff) by email, assign role + branch scope, optionally delegate voucher management, deactivate/reactivate/remove, resend invites; plus a read-only app-user (BranchUser) surface with reset-password / deactivate / reactivate.

**Architecture:** Foundation-first horizontal slicing (spec §10). **PR-A** adds the authz foundation (the two-resolver pattern + one additive `canManageVouchers` column + guards + helper/test-only non-owner-membership plumbing) with **no route migrated, no UI, and non-owner login NOT live**. **PR-B** migrates every §4.3-classified non-owner route to `resolveMerchantContext` + a guard (including the two resolver-bypassing redemption routes), adds membership CRUD + invite + the app-user surface, and **activates non-owner login only after every guard lands**. **PR-C** builds the merchant-web Staff & Access module.

**Tech Stack:** Node 24 + Fastify + Prisma 7 (Neon Postgres) + vitest (backend); Next 15 App Router + React Query 5 + zod 4 + shadcn/ui + jest/RTL (merchant-web, port 3003).

**Source spec:** `docs/superpowers/specs/2026-06-22-merchant-web-staff-access-design.md` (rev 2, approved at `0aefa916`). Every decision D1-D10 + the route-guard matrix §4.3 + invariants §7 are normative; this plan implements them. Read the spec before starting.

---

## Operating rules (all PRs)

- **Owner-gated per PR + per slice.** Do not start a PR without explicit owner approval. Do not merge without a SHA-bound gate (`REDEEMO_PR_SCOPE_VERIFIED=<full-head-sha>` after a live `gh api compare` scope check).
- **Fresh implementer + fresh adversarial reviewer per PR** (no self-certify), per the subagent-driven-development discipline. The adversarial reviewer is perspective-diverse (security / spec-compliance / scope).
- **Closed scope per PR.** The "Scope guard" list at the end of each PR is exhaustive; touching anything outside it is a stop-and-report.
- **Stop-and-report triggers** (spec §9) apply throughout - in particular: any schema change beyond the single `canManageVouchers` column; any JWT-shape / mobile-auth / validation-FK change; any merchant-JWT-reachable route discovered outside the matrix; any pressure to use email correlation for authorization or a destructive action.
- **No-schema discipline:** the ONLY migration in the entire milestone is PR-A Task 1 (`canManageVouchers`). New `AppError` codes are code, not schema.
- **CI gate:** `npm run test:unit` (vitest `--project unit`, excludes `*.integration.test.ts`) + `npm run typecheck` for backend; `npm run test` + `npm run typecheck` in `apps/merchant-web`. Integration tests (`*.integration.test.ts`) are local-only (not in CI) - run them locally before each merge gate.
- **Migration application:** `npx prisma migrate dev --name <name>` applies to the **local dev DB only**; staging/prod apply via `npx prisma migrate deploy` during deploy (do not run `migrate deploy` against staging from this work - note it in the PR body).
- **House style:** brand tokens (no hardcoded hex), no em-dashes (`:`/`;`/`()`/`·`), SVG icons not emojis.

---

## Route-guard matrix implementation mapping

This is the spec §4.3 matrix translated to exact code actions. **PR-A migrates nothing** (foundation only). **PR-B** applies the "Action" column. A route marked **stay** keeps calling `resolveAdminMerchant` (owner-only = safe deny) and needs zero change.

| Route (file:line) | Spec outcome | Action in PR-B |
|---|---|---|
| `GET /merchant/branches` (`branch/routes.ts:71`) | SCOPED-READ | migrate `listBranches` to `resolveMerchantContext`; filter to `ctx.allBranches ? all : allowedBranchIds` |
| `GET /merchant/branches/:id` (`branch/routes.ts:86`) | SCOPED-READ | migrate `getBranch`; `assertBranchAllowed(ctx, id)` |
| `POST/PATCH/DELETE branches*`, hours, amenities, photos, pin, edit-requests | OWNER | **stay** (resolveAdminMerchant) |
| `GET /merchant/vouchers`, `/:id`, `/rmv` (`voucher/routes.ts:110,123,162`) | MEMBER-READ | migrate `listVouchers`/`getVoucher`/`listRmvVouchers` to `resolveMerchantContext` (any active member; no branch filter - vouchers are merchant-wide) |
| `POST /merchant/vouchers`, `PATCH /:id`, `POST /:id/submit`, `DELETE /:id`, `rmv/create-flagship`, `rmv/:id`, `rmv/:id/submit` (`voucher/routes.ts:114,128,139,149,172,180,188`) | OWNER\|MV | migrate to `resolveMerchantContext` + `assertCanManageVouchers(ctx)` |
| `GET /merchant/redemptions`, `/lookup`, `/export.csv` (`redemptions/routes.ts:27,36,43`) | SCOPED-READ | migrate; intersect requested `branchId` with `ctx.allowedBranchIds`; scoped-member with no `branchId` -> restrict to `allowedBranchIds` |
| `GET /merchant/profile` (`profile/routes.ts:12`) | MEMBER-READ | migrate `getMerchantProfile` to `resolveMerchantContext` (read only) |
| `PATCH /merchant/profile`, `/profile/edit-request*` | OWNER | **stay** |
| `onboarding/*` (`onboarding/routes.ts`) | OWNER (taxonomy + contract GET = AUTH/REF, no resolver) | **stay** |
| `notifications/*` (`notifications/routes.ts`) | OWN-RECIPIENT | **stay** (already `recipientId=req.user.sub`, no resolver; suspended-reachable - do NOT add a resolver) |
| `POST /merchant/uploads/:kind` (`upload/routes.ts:19`) | OWNER\|MV (v1) | migrate to `resolveMerchantContext` + `assertCanManageVouchers` (plan note: acceptable broad grant; URL inert without a guarded write) |
| `branch-user` create/reset/deactivate/reactivate/pin (`auth/merchant/branch-user.routes.ts`) | OWNER (v1) | **stay** (still `resolveAdminMerchant` via `assertBranchOwnership`); ADD the findFirst-ambiguity guard (Task B7) |
| NEW `staff/*` (membership CRUD) | OWNER | new routes use `resolveAdminMerchant` + `assertOwner` on the resolved membership role |
| **† `POST /redemption/verify`** (merchant actor) (`redemption/routes.ts:123`) | SCOPED-WRITE | **bespoke:** in the merchant-actor branch, after `merchantVerify()`, call `resolveMerchantContext(adminId)` and pass `ctx` into `verifyRedemption`; `assertBranchAllowed(ctx, redemption.branchId)` before validating |
| **† `GET /branch/:branchId/redemptions`** (merchant actor) (`redemption/routes.ts:173`) | SCOPED-READ | **bespoke:** in the merchant-actor branch, `resolveMerchantContext(adminId)` + `assertBranchAllowed(ctx, branchId)` before `listBranchRedemptions` |

**Cutover invariant (§4.4):** non-owner login is activated (Task B9) ONLY in the slice where every row above (including the two † routes) carries its guard.

---

# PR-A - Authz foundation + schema (no UI, no route migrated, non-owner login NOT live)

**Branch:** `feat/staff-access-pr-a-foundation` off `main`.
**Closed scope:** `prisma/schema.prisma` (+ the one migration dir), `src/api/shared/errors.ts`, `src/api/shared/merchantMembership.ts`, `src/api/merchant/shared.ts`, and new tests under `tests/api/merchant/` + `tests/api/shared/`. **Nothing else.**

### Task A1: `canManageVouchers` migration

**Files:**
- Modify: `prisma/schema.prisma` (model `MerchantMembership`, ~line 230)
- Create: `prisma/migrations/<timestamp>_merchant_membership_can_manage_vouchers/migration.sql` (generated)

- [ ] **Step 1: Add the column to the schema.** In `model MerchantMembership`, after `allBranches Boolean @default(true)`:

```prisma
  canManageVouchers Boolean @default(false) // Staff & Access D3: owner-granted voucher-management delegation for a BRANCH_MANAGER
```

- [ ] **Step 2: Generate + apply the migration (local dev DB only).**

Run: `npx prisma migrate dev --name merchant_membership_can_manage_vouchers`
Expected: migration created + applied; `npx prisma generate` runs; the generated client at `generated/prisma/client` now types `canManageVouchers`.

- [ ] **Step 3: Verify the migration is additive + default-false (no backfill).**

Run: `grep -A2 "canManageVouchers" prisma/migrations/*/migration.sql`
Expected: `ADD COLUMN "canManageVouchers" BOOLEAN NOT NULL DEFAULT false` (existing OWNER rows read `false`).

- [ ] **Step 4: Commit.**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(staff-access PR-A): add MerchantMembership.canManageVouchers (additive, default false)"
```

### Task A2: New error codes

**Files:** Modify `src/api/shared/errors.ts` (the `ERROR_DEFINITIONS` map)

- [ ] **Step 1: Write a failing test.** Create `tests/api/shared/staff-access-errors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { ERROR_DEFINITIONS } from '../../../src/api/shared/errors'

describe('Staff & Access error codes', () => {
  it('defines MULTIPLE_BRANCH_USERS (409)', () => {
    expect(ERROR_DEFINITIONS.MULTIPLE_BRANCH_USERS.statusCode).toBe(409)
  })
  it('defines MULTI_MEMBERSHIP_UNSUPPORTED (400)', () => {
    expect(ERROR_DEFINITIONS.MULTI_MEMBERSHIP_UNSUPPORTED.statusCode).toBe(400)
  })
  it('reuses INSUFFICIENT_PERMISSIONS (403) for role denials', () => {
    expect(ERROR_DEFINITIONS.INSUFFICIENT_PERMISSIONS.statusCode).toBe(403)
  })
})
```

- [ ] **Step 2: Run it - expect FAIL** (`MULTIPLE_BRANCH_USERS` undefined).

Run: `npx vitest run tests/api/shared/staff-access-errors.test.ts`

- [ ] **Step 3: Add the codes.** In `ERROR_DEFINITIONS`:

```typescript
  MULTIPLE_BRANCH_USERS:        { statusCode: 409, message: 'This branch has more than one app user. Use the app-management screen to choose which one to update.' },
  MULTI_MEMBERSHIP_UNSUPPORTED: { statusCode: 400, message: 'This account is linked to more than one business, which is not supported yet.' },
```

(Reuse the existing `INSUFFICIENT_PERMISSIONS` (403) for role/owner/capability denials - do NOT add a new generic forbidden code.)

- [ ] **Step 4: Run - expect PASS.** `npx vitest run tests/api/shared/staff-access-errors.test.ts`
- [ ] **Step 5: Commit.** `git commit -am "feat(staff-access PR-A): add MULTIPLE_BRANCH_USERS + MULTI_MEMBERSHIP_UNSUPPORTED error codes"`

### Task A3: `getActiveMembership` helper (single-membership contract)

**Files:** Modify `src/api/shared/merchantMembership.ts`

- [ ] **Step 1: Write failing tests.** Create `tests/api/shared/active-membership.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { getActiveMembership } from '../../../src/api/shared/merchantMembership'

const ctx = (rows: any[]) => ({ merchantMembership: { findMany: vi.fn().mockResolvedValue(rows) } }) as any

describe('getActiveMembership', () => {
  it('returns the single ACTIVE membership with role/allBranches/canManageVouchers/branchIds', async () => {
    const m = await getActiveMembership(ctx([
      { id: 'mm1', merchantId: 'm1', merchantAdminId: 'a1', role: 'BRANCH_MANAGER', allBranches: false, canManageVouchers: true,
        merchant: { status: 'ACTIVE', businessName: 'X' }, branches: [{ branchId: 'b1' }] },
    ]), 'a1')
    expect(m).toMatchObject({ merchantId: 'm1', role: 'BRANCH_MANAGER', allBranches: false, canManageVouchers: true, allowedBranchIds: ['b1'] })
  })
  it('returns null when there is no active membership', async () => {
    expect(await getActiveMembership(ctx([]), 'a1')).toBeNull()
  })
  it('throws MULTI_MEMBERSHIP_UNSUPPORTED when >1 active membership', async () => {
    await expect(getActiveMembership(ctx([{ id: 'mm1' }, { id: 'mm2' }]), 'a1'))
      .rejects.toThrow('MULTI_MEMBERSHIP_UNSUPPORTED')
  })
})
```

- [ ] **Step 2: Run - expect FAIL.** `npx vitest run tests/api/shared/active-membership.test.ts`

- [ ] **Step 3: Implement.** Add to `src/api/shared/merchantMembership.ts`:

```typescript
export type ActiveMembership = {
  id: string
  merchantId: string
  merchantAdminId: string
  role: 'OWNER' | 'BRANCH_MANAGER' | 'STAFF'
  allBranches: boolean
  canManageVouchers: boolean
  allowedBranchIds: string[]
  merchant?: { status: string; businessName: string } | null
}

/**
 * Resolve the caller's single ACTIVE membership (any role). Throws
 * MULTI_MEMBERSHIP_UNSUPPORTED if the person has >1 (multi-merchant identity is
 * deferred; enforced here at resolve time, not just at invite). Returns null if none.
 * `take: 2` is the cheap >1 detector.
 */
export async function getActiveMembership(
  prisma: PrismaClient,
  adminId: string
): Promise<ActiveMembership | null> {
  const rows = await prisma.merchantMembership.findMany({
    where: { merchantAdminId: adminId, status: 'ACTIVE' },
    select: {
      id: true, merchantId: true, merchantAdminId: true, role: true, allBranches: true, canManageVouchers: true,
      merchant: { select: { status: true, businessName: true } },
      branches: { select: { branchId: true } },
    },
    take: 2,
  })
  if (rows.length === 0) return null
  if (rows.length > 1) throw new AppError('MULTI_MEMBERSHIP_UNSUPPORTED')
  const r = rows[0]
  return {
    id: r.id, merchantId: r.merchantId, merchantAdminId: r.merchantAdminId,
    role: r.role as ActiveMembership['role'], allBranches: r.allBranches, canManageVouchers: r.canManageVouchers,
    allowedBranchIds: r.branches.map((b) => b.branchId), merchant: r.merchant,
  }
}
```

- [ ] **Step 4: Run - expect PASS.** Commit: `git commit -am "feat(staff-access PR-A): getActiveMembership helper with single-membership contract"`

### Task A4: `resolveMerchantContext` + guards

**Files:** Modify `src/api/merchant/shared.ts`

- [ ] **Step 1: Write failing tests.** Create `tests/api/merchant/merchant-context.test.ts` covering: (a) `resolveMerchantContext` returns `{adminId, merchantId, role, allBranches, allowedBranchIds, canManageVouchers}` for an active member; (b) throws `INVALID_CREDENTIALS` when no membership; (c) throws `MERCHANT_SUSPENDED` when merchant suspended; (d) `assertCanManageVouchers` allows OWNER + allows `canManageVouchers:true` + throws `INSUFFICIENT_PERMISSIONS` for a plain BRANCH_MANAGER + throws for STAFF; (e) `assertBranchAllowed` allows when `allBranches` + allows when in `allowedBranchIds` + throws otherwise; (f) `assertOwner` allows OWNER + throws for non-owner. (Use a prisma mock returning a membership row, mirroring Task A3.)

- [ ] **Step 2: Run - expect FAIL.**

- [ ] **Step 3: Implement.** Add to `src/api/merchant/shared.ts` (leave `resolveAdminMerchant` UNCHANGED):

```typescript
import { getActiveMembership, type ActiveMembership } from '../shared/merchantMembership'

export type MerchantContext = {
  adminId: string
  merchantId: string
  role: 'OWNER' | 'BRANCH_MANAGER' | 'STAFF'
  allBranches: boolean
  allowedBranchIds: string[]
  canManageVouchers: boolean
}

/** Role-aware resolver for routes that intentionally admit non-owners (§4.1). Keeps the SEC-M2 suspended guard. */
export async function resolveMerchantContext(prisma: PrismaClient, adminId: string): Promise<MerchantContext> {
  const m = await getActiveMembership(prisma, adminId)
  if (!m) throw new AppError('INVALID_CREDENTIALS')
  if (m.merchant?.status === 'SUSPENDED') throw new AppError('MERCHANT_SUSPENDED')
  return {
    adminId, merchantId: m.merchantId, role: m.role, allBranches: m.allBranches,
    allowedBranchIds: m.allowedBranchIds, canManageVouchers: m.role === 'OWNER' || m.canManageVouchers,
  }
}

export function assertOwner(ctx: MerchantContext): void {
  if (ctx.role !== 'OWNER') throw new AppError('INSUFFICIENT_PERMISSIONS')
}
export function assertCanManageVouchers(ctx: MerchantContext): void {
  if (!(ctx.role === 'OWNER' || ctx.canManageVouchers)) throw new AppError('INSUFFICIENT_PERMISSIONS')
}
export function assertBranchAllowed(ctx: MerchantContext, branchId: string): void {
  if (!(ctx.allBranches || ctx.allowedBranchIds.includes(branchId))) throw new AppError('INSUFFICIENT_PERMISSIONS')
}
```

- [ ] **Step 4: Run - expect PASS.** Commit: `git commit -am "feat(staff-access PR-A): resolveMerchantContext + assertOwner/assertCanManageVouchers/assertBranchAllowed guards"`

### Task A5: No-behaviour-change regression pin

- [ ] **Step 1: Write a test** `tests/api/merchant/pr-a-no-behaviour-change.test.ts` asserting `resolveAdminMerchant` is unchanged: a non-OWNER membership still resolves to `INVALID_CREDENTIALS` (it calls `getOwnerMembership`, role:'OWNER' only), and an OWNER still resolves `{adminId, merchantId}`. This pins that PR-A does not widen the owner-only resolver.
- [ ] **Step 2: Run - expect PASS** (no impl change; it documents the invariant). Commit.

### PR-A verification

- [ ] `npx vitest run tests/api/shared tests/api/merchant/merchant-context.test.ts tests/api/merchant/pr-a-no-behaviour-change.test.ts` -> all green.
- [ ] `npm run test:unit` -> full unit suite green (no regressions).
- [ ] `npm run typecheck` -> clean.
- [ ] `npx vitest run tests/api/merchant/membership.integration.test.ts` (local-only) -> green.

### PR-A scope guard (closed)

Only: `prisma/schema.prisma`, `prisma/migrations/**`, `src/api/shared/errors.ts`, `src/api/shared/merchantMembership.ts`, `src/api/merchant/shared.ts`, `tests/api/shared/**`, `tests/api/merchant/{merchant-context,pr-a-no-behaviour-change}.test.ts`. **No route file, no auth/login change, no UI.** Touching anything else = stop-and-report.

### PR-A rollback notes

The migration is additive default-false with no backfill - safe to leave even if PR-B is delayed (nothing reads `canManageVouchers` until PR-B). To revert pre-merge: `git checkout main -- prisma/schema.prisma` + delete the migration dir + `npx prisma migrate reset` on the local dev DB. `resolveMerchantContext`/guards are unreferenced by any route in PR-A, so reverting them cannot affect live behaviour.

### PR-A adversarial review checklist

- `resolveAdminMerchant` byte-unchanged (the safe-default-deny depends on it).
- `getActiveMembership` `take:2` >1 path throws (not silently picks one).
- Migration additive, default false, no backfill, no other schema drift.
- Guards use `INSUFFICIENT_PERMISSIONS` (403), `canManageVouchers` includes OWNER.
- No route consumes the new resolver yet; non-owner login still impossible (`resolveMerchantInfo` untouched).

### PR-A SHA-bound merge gate

`gh api repos/:owner/:repo/compare/main...feat/staff-access-pr-a-foundation` -> confirm only the scope-guard files. Then `REDEEMO_PR_SCOPE_VERIFIED=$(gh pr view <n> --json headRefOid --jq .headRefOid) gh pr merge <n> --squash`. **Owner approval required first.**

---

# PR-B - Backend behaviour + non-owner cutover (no merchant-web UI)

**Branch:** `feat/staff-access-pr-b-backend` off updated `main` (after PR-A).
**May sub-split** (recommended): **B-i** membership CRUD + invite; **B-ii** branch-scope enforcement migration of the matrix routes incl. the two † routes; **B-iii** app-user surface + findFirst guard; **B-iv** activate non-owner login. Each sub-PR is independently reviewable; non-owner login (B-iv) MERGES LAST.

### Task B1: Staff membership service - read + invite

**Files:**
- Create: `src/api/merchant/staff/service.ts`
- Create: `tests/api/merchant/staff.service.test.ts`

- [ ] **Step 1: Write failing tests** for `listMembers` (returns memberships for the merchant excluding `DELETED`, curated select: id, name, email, role, status, `canManageVouchers`, `allBranches`, branchIds, `claimed` = `passwordHash != null`, `lastLoginAt`; **never `passwordHash`**) and `inviteMember` (creates `MerchantAdmin` with `passwordHash:null` + `MerchantMembership` ACTIVE with role/scope/`canManageVouchers` + `invitedById` + `MerchantMembershipBranch` rows for a scoped member; calls `issueMerchantClaim`; **rejects `EMAIL_ALREADY_EXISTS` when the email already belongs to a `MerchantAdmin`** per D5b; role-elevation: only an OWNER caller may create an OWNER or grant `canManageVouchers`).

- [ ] **Step 2: Run - expect FAIL.**

- [ ] **Step 3: Implement `service.ts`.** Signatures (each resolves the caller via `resolveAdminMerchant` then `assertOwner` on the caller's `resolveMerchantContext`; audited via `writeAuditLog`):

```typescript
export async function listMembers(prisma, adminId): Promise<MemberRow[]>
export async function inviteMember(prisma, redis, adminId, body: { email; firstName; lastName; jobTitle?; role; allBranches; branchIds?; canManageVouchers? }, ctx): Promise<{ memberId: string }>
```

`inviteMember` body validated by zod; transaction creates admin + membership (+ branch rows) + audit `MEMBER_INVITED`, then `issueMerchantClaim(prisma, redis, { adminId: newAdminId, email, ip })`. Role-elevation guard: if `body.role === 'OWNER' || body.canManageVouchers` require the caller is OWNER (the caller always is in v1 since management is owner-only, but assert it server-side). Scope: if `!allBranches`, require `branchIds` non-empty and that each branch belongs to `merchantId`. **In v1, gate `allBranches=false` (Specific branches) behind a feature constant `SPECIFIC_BRANCHES_ENABLED` (see Task B6)** - until enforcement coverage lands, invites are all-branches only.

- [ ] **Step 4: Run - expect PASS.** Commit.

### Task B2: Staff membership service - edit / deactivate / reactivate / remove / resend

- [ ] **Step 1: Write failing tests** for: `updateMemberAccess` (role/scope/`canManageVouchers`; re-writes `MerchantMembershipBranch`; `assertNotLastOwner` if demoting/removing the last owner; role-elevation guard; rejects a non-owner editing their own role/scope/cap - i.e. server ignores client values on self); `deactivateMember` (membership `status:INACTIVE` + `revokeAllSessionsForEntity('merchant', memberAdminId)` + audit; `assertNotLastOwner`); `reactivateMember` (`status:ACTIVE` + audit); `removeMember` (membership `status:DELETED` + revoke sessions + clear `MerchantMembershipBranch` + audit before/after; `assertNotLastOwner`; re-invite later reactivates - test that inviting the same email after remove flips the row, not `EMAIL_ALREADY_EXISTS`... NOTE: see Task B2a); `resendInvite` (only when `passwordHash==null`; mint fresh claim token, invalidate old, re-`issueMerchantClaim`, audit).

- [ ] **Step 2-4:** Implement, run green, commit. Use `revokeAllSessionsForEntity` + `revokeAllUserSessionRecords` (role `'merchant'`) exactly as `deactivateBranchUser` does for `'branch'`.

### Task B2a: Re-invite-after-remove contract (D5b + D6 interaction)

> **Stop-and-report check:** D5b rejects inviting an email that already belongs to a `MerchantAdmin`. D6 soft-remove keeps the `MerchantAdmin` row (status `DELETED` is on the *membership*, not the admin). So re-inviting a removed member's email would hit `EMAIL_ALREADY_EXISTS` (the admin still exists) - a dead-end the spec calls out as solved.

- [ ] **Step 1: Write the test** for the intended behaviour: inviting an email whose `MerchantAdmin` exists **and** whose only membership for this merchant is `status:DELETED` -> **reactivates that membership** (back to ACTIVE with the new role/scope) + re-issues a claim token, rather than throwing `EMAIL_ALREADY_EXISTS`. Inviting an email whose `MerchantAdmin` has an ACTIVE/INACTIVE membership -> `EMAIL_ALREADY_EXISTS` (or `MEMBER_ALREADY_EXISTS`). Inviting an email belonging to a `MerchantAdmin` of a **different** merchant -> `EMAIL_ALREADY_EXISTS` (multi-merchant deferred, D5b).
- [ ] **Step 2-4:** Implement `inviteMember`'s lookup to branch on (admin exists?) × (membership for THIS merchant exists & its status). Reactivate-DELETED path; reject otherwise. Run green, commit. **If this requires any behaviour the spec doesn't cover, stop-and-report.**

### Task B3: Staff routes + plugin registration

**Files:**
- Create: `src/api/merchant/staff/routes.ts`
- Modify: `src/api/merchant/plugin.ts` (register `staffRoutes` in the scoped block)
- Create: `tests/api/merchant/staff.routes.test.ts`

- [ ] **Step 1: Write failing route tests** (mirroring `tests/api/merchant/profile.test.ts`: build app, mock prisma/redis, sign an OWNER merchant token): `GET /api/v1/merchant/staff` (200, no `passwordHash` in payload); `POST /api/v1/merchant/staff` (invite -> 200/201); `PATCH /api/v1/merchant/staff/:id`; `POST /api/v1/merchant/staff/:id/deactivate`; `POST /api/v1/merchant/staff/:id/reactivate`; `DELETE /api/v1/merchant/staff/:id`; `POST /api/v1/merchant/staff/:id/resend-invite`. Plus: a **non-owner** caller (BRANCH_MANAGER membership) hitting any of these -> `INSUFFICIENT_PERMISSIONS` (403).

- [ ] **Step 2-4:** Implement `routes.ts` (prefix `/api/v1/merchant/staff`, mirror `profile/routes.ts` zod-parse + service-call shape); register in `plugin.ts`. Run green, commit.

### Task B4: App-user read + findFirst-ambiguity guard

**Files:**
- Modify: `src/api/auth/merchant/branch-user.service.ts` (add the count guard to `resetBranchUserPassword`/`deactivateBranchUser`/`reactivateBranchUser`; add `listBranchAppUsers`)
- Modify: `src/api/merchant/staff/service.ts` (expose `listBranchAppUsers` for the staff surface) or place the read in `staff/service.ts`
- Create: `tests/api/merchant/branch-user-ambiguity.test.ts`

- [ ] **Step 1: Write failing tests:** (a) a branch with **2** `BranchUser` rows -> `resetBranchUserPassword`/`deactivate`/`reactivate` each throw `MULTIPLE_BRANCH_USERS` and **mutate nothing** (assert `branchUser.update` not called); (b) exactly **1** -> acts on that row's id; (c) **0** -> `BRANCH_USER_NOT_FOUND`; (d) `listBranchAppUsers` returns app users grouped by branch with a per-branch count, curated select (no `passwordHash`).

- [ ] **Step 2: Run - expect FAIL.**

- [ ] **Step 3: Implement the guard.** In each of the three functions, replace the lone `findFirst({where:{branchId}})` with an atomic count+select+act inside a transaction (closes the TOCTOU residual, spec §5.3):

```typescript
return prisma.$transaction(async (tx) => {
  const rows = await tx.branchUser.findMany({ where: { branchId: data.branchId }, select: { id: true }, take: 2 })
  if (rows.length === 0) throw new AppError('BRANCH_USER_NOT_FOUND')
  if (rows.length > 1) throw new AppError('MULTIPLE_BRANCH_USERS')
  const branchUserId = rows[0].id
  // ... existing update on { id: branchUserId } ...
})
```

Add `listBranchAppUsers(prisma, merchantId)`: `findMany` BranchUsers where `branch.merchantId === merchantId`, select `id, branchId, firstName, lastName, jobTitle, email, status, lastLoginAt`, plus compute a per-branch count so the UI can disable actions when `>1`. **Never select `passwordHash`.**

- [ ] **Step 4: Run - expect PASS.** Commit.

### Task B5: Branch-scope enforcement - migrate the matrix routes

> Apply the "Action in PR-B" column of the Route-guard mapping. Each migration: swap `resolveAdminMerchant` -> `resolveMerchantContext` and add the guard. **Owner-only ("stay") routes are NOT touched.**

- [ ] **Step 1 (vouchers):** Write failing tests for the **four-case voucher matrix** (spec §5.1.1) against `POST /merchant/vouchers` (representative write): owner allowed; BRANCH_MANAGER+`canManageVouchers` allowed; BRANCH_MANAGER without it -> `INSUFFICIENT_PERMISSIONS`; STAFF -> `INSUFFICIENT_PERMISSIONS`; **read** (`GET /merchant/vouchers`) allowed for all four. Plus: a STAFF payload carrying `canManageVouchers:true` is ignored (the value comes from the resolved membership, never the body).
- [ ] **Step 2-4:** Migrate the voucher service read fns to `resolveMerchantContext` (no branch filter) and the write fns to `resolveMerchantContext` + `assertCanManageVouchers`. Run green, commit.
- [ ] **Step 5 (redemptions):** Write failing tests: scoped BRANCH_MANAGER (`allowedBranchIds:['b1']`) listing redemptions -> only `b1` rows; requesting `?branchId=b2` (not allowed) -> empty/`INSUFFICIENT_PERMISSIONS`; owner -> all. Migrate `listMerchantRedemptions`/`lookup`/`export.csv` to intersect with `ctx.allowedBranchIds`. Run green, commit.
- [ ] **Step 6 (branches read + profile read + uploads):** Migrate `listBranches` (filter to allowed), `getBranch` (`assertBranchAllowed`), `getMerchantProfile` (MEMBER-READ), `POST /uploads/:kind` (`assertCanManageVouchers`). Tests pin scoped vs owner. Run green, commit.

### Task B6: The two † resolver-bypassing redemption routes

**Files:**
- Modify: `src/api/redemption/routes.ts` (merchant-actor branches of `POST /redemption/verify` + `GET /branch/:branchId/redemptions`)
- Modify: `src/api/redemption/service.ts` (`verifyRedemption` merchant branch: accept a `ctx`/allowed-branch check)
- Create: `tests/api/redemption/merchant-actor-branch-scope.test.ts`

- [ ] **Step 1: Write failing tests** (these are the highest-value security pins): with a merchant session, validating (`POST /redemption/verify`) a code whose `redemption.branchId` is **outside** the caller's `allowedBranchIds` -> denied (`BRANCH_ACCESS_DENIED` or `REDEMPTION_NOT_FOUND` mask); in-scope or `allBranches` (owner) -> allowed. Same for `GET /branch/:branchId/redemptions`: out-of-scope `branchId` -> denied; in-scope/owner -> allowed. Branch-actor path (BranchUser) unchanged.

- [ ] **Step 2: Run - expect FAIL** (today both are merchant-wide).

- [ ] **Step 3: Implement.** In the merchant-actor branch of each handler, after `merchantVerify()` + reading the `authMerchant` session, call `const ctx = await resolveMerchantContext(app.prisma, req.user.sub)`. For `verify`: pass `ctx` into `verifyRedemption`; in the service's merchant branch, after loading `redemption`, add `assertBranchAllowed(ctx, redemption.branchId)` (keep the existing `redemption.voucher.merchantId === ctx.merchantId` check). For `branch/:branchId/redemptions`: `assertBranchAllowed(ctx, branchId)` before `listBranchRedemptions`. **Do not change the branch-actor (BranchUser) path.**

- [ ] **Step 4: Run - expect PASS.** Commit.

### Task B7: `SPECIFIC_BRANCHES_ENABLED` flip (in-v1 sequencing gate)

> Per spec §5.2, "Specific branches" is surfaced **within v1** once enforcement coverage (Tasks B5 + B6) is complete - not a permanent deferral. Tasks B1/B3 gated invites to all-branches behind a constant; flip it here now that coverage exists.

- [ ] **Step 1:** Confirm Tasks B5 + B6 are merged/complete (the SCOPED set of 7 routes all enforce). Set `SPECIFIC_BRANCHES_ENABLED = true` (a backend const consumed by `inviteMember`/`updateMemberAccess` validation). Add a test that a scoped invite (`allBranches:false, branchIds:['b1']`) now succeeds and writes `MerchantMembershipBranch`.
- [ ] **Step 2-4:** Implement, run green, commit. (If the owner elects to defer Specific branches, leave the const `false` and record it - that is the only way it becomes a deferral.)

### Task B8: Activate non-owner login (the cutover - MERGES LAST)

**Files:** Modify `src/api/auth/merchant/service.ts` (`resolveMerchantInfo` + the session write)
**Create:** `tests/api/auth/merchant/non-owner-login.test.ts`

> **Hard gate:** this task MUST land only after B1-B7 are complete. Until it merges, a non-owner cannot authenticate (PR-A left `resolveMerchantInfo` on `getOwnerMembership`).

- [ ] **Step 1: Write failing tests:** a BRANCH_MANAGER member can `login` + `otp/verify` and receives a working session (today: `INVALID_CREDENTIALS`); the session/refresh still rejects a SUSPENDED merchant; an admin with NO active membership still `INVALID_CREDENTIALS`.
- [ ] **Step 2: Run - expect FAIL.**
- [ ] **Step 3: Implement.** Change `resolveMerchantInfo` to use `getActiveMembership` (any active member) instead of `getOwnerMembership`, preserving the SEC-M2 suspended throw and the `{merchantId, status, businessName}` return. (The `authMerchant` session shape is unchanged - role/scope are resolved per-request by `resolveMerchantContext`, not stored in the session, so the two † routes stay correct.)
- [ ] **Step 4: Run - expect PASS.**
- [ ] **Step 5: Full-cutover regression.** Run the entire backend unit suite + the redemption + voucher + redemptions + branch suites to prove non-owner login does not expose any unguarded route. Commit.

### PR-B verification

- [ ] `npm run test:unit` green (incl. all new staff/redemption/voucher/branch-user tests).
- [ ] `npm run typecheck` clean.
- [ ] Local integration: `npx vitest run --project integration` green.
- [ ] **Manual cutover proof:** with a seeded BRANCH_MANAGER (scoped to one branch), confirm via `app.inject` tests that out-of-scope redemptions read/validate + voucher write + other-branch reads are all denied.

### PR-B scope guard (closed)

`src/api/merchant/staff/**`, `src/api/merchant/plugin.ts` (registration line only), the voucher/redemptions/branch/profile/upload **service** files (resolver swap + guard only - no business-logic change), `src/api/auth/merchant/branch-user.service.ts` (findFirst guard + `listBranchAppUsers`), `src/api/redemption/{routes,service}.ts` (merchant-actor branch only), `src/api/auth/merchant/service.ts` (`resolveMerchantInfo` only), and the corresponding `tests/**`. **No merchant-web file. No schema. No JWT shape change. No branch-actor redemption change.**

### PR-B rollback notes

If a guard misfires in production: the fastest safe rollback is to **revert Task B8** (non-owner login) - that returns the system to owner-only (the migrated routes still work for owners exactly as before, since owners have `allBranches` + `canManageVouchers` by role). The route migrations themselves are owner-safe (owner context = all branches). Each sub-PR (B-i..B-iv) is independently revertable; B-iv last-in/first-out.

### PR-B adversarial review checklist (perspective-diverse)

- **Security:** every §4.3 SCOPED/OWNER|MV route actually calls the guard (grep each migrated service fn for `resolveMerchantContext` + the guard); the two † routes resolve context and `assertBranchAllowed`; no route trusts a client `branchId`/`role`/`canManageVouchers`; `passwordHash` never in any payload; `assertNotLastOwner` on every owner-affecting path; invite rejects cross-merchant email reuse.
- **Spec-compliance:** four-case voucher test present + passing; findFirst-ambiguity refuse-on->1 + atomic; re-invite-after-remove matches B2a; resend only when unclaimed; non-owner login is the LAST merge and only after all guards.
- **Scope:** no owner-only ("stay") route was changed; no merchant-web; no schema; branch-actor redemption path untouched.

### PR-B SHA-bound merge gate (per sub-PR)

Live `gh api compare` scope check per sub-PR; `REDEEMO_PR_SCOPE_VERIFIED=<head-sha>`; owner approval per sub-PR. **B-iv (non-owner login) requires explicit confirmation that B-i..B-iii are merged and green.**

---

# PR-C - merchant-web Staff & Access module

**Branch:** `feat/staff-access-pr-c-merchant-web` off updated `main` (after PR-B).
**Closed scope:** `apps/merchant-web/**` only (new `app/(app)/staff/**`, `components/staff/**`, `lib/api/staff.ts`, `lib/staff/useStaff.ts`, the `navItems.ts` href, and tests). No backend.

### Task C1: API client + zod (`lib/api/staff.ts`)

- [ ] **Step 1: Write failing tests** (`apps/merchant-web/lib/api/__tests__/staff.test.ts`) for `listStaff`/`inviteStaff`/`updateStaff`/`deactivateStaff`/`reactivateStaff`/`removeStaff`/`resendInvite` + `listBranchAppUsers` + the reset/deactivate/reactivate app-user calls, mirroring `lib/api/redemptions.ts` (zod `.passthrough()` row schemas, `apiFetch` with `auth:true`).
- [ ] **Step 2-4:** Implement against the PR-B endpoints (`/api/v1/merchant/staff*`, `/api/v1/merchant/branches/:branchId/user*`). Zod schemas: `memberRowSchema` (role, status, accessPills, branchIds, claimed, lastLoginAt), `appUserRowSchema`. Run green, commit. **No new BFF route needed** (client calls backend directly with the Bearer token; M1 BFF only handles refresh).

### Task C2: React Query hooks (`lib/staff/useStaff.ts`)

- [ ] **Step 1-4:** `useStaff(enabled)` (queryKey `['staff']`, staleTime 30s), `useBranchAppUsers(enabled)`, and mutations (`useInviteStaff`, `useUpdateStaff`, `useDeactivateStaff`, `useReactivateStaff`, `useRemoveStaff`, `useResendInvite`, app-user reset/deactivate/reactivate) each invalidating `['staff']` / `['branchAppUsers']` on success. Mirror the existing hook pattern. Tests + commit.

### Task C3: List page + summary cards + nav

**Files:** `app/(app)/staff/page.tsx`, `components/staff/{StaffSummaryCards,StaffTable,StaffSearch}.tsx`, modify `components/shell/navItems.ts:23`

- [ ] **Step 1: Write failing RTL tests** (mirror `redemptions/page.test.tsx`): loading state; renders the member table (name, role chip, access pills Portal/App, branch coverage, last-active); summary cards (People / Portal users X of 8 / App users X of 20 - **hardcoded caps** `PORTAL_CAP=8`, `APP_CAP=20`); allowance banner when a cap is full; search appears when `>4` people; lifecycle gating (pre-live = owner-only row + "for now it is just you"; suspended = blocked state, no table - calls the suspended home).
- [ ] **Step 2-4:** Implement. Set `navItems.ts:23` `href: '/staff'`. Use `Table`, `Badge`, `Card`, brand tokens. Lifecycle via `deriveStatusPill`/`homeFor` (suspended -> blocked state, consistent with the rest of the portal per spec §6.1). **Owner-only management:** non-owner sessions do not see management affordances (the backend `assertOwner` is the source of truth; UI hides Add/row-actions for non-owners). Run green, commit.

### Task C4: Add/Edit drawer

**Files:** `components/staff/StaffAddEditDrawer.tsx` (+ a `Sheet` primitive if needed, else the handrolled `Dialog`)

- [ ] **Step 1: Write failing RTL tests:** full name / email / job title; Access toggles (Portal/App, `Switch`); Portal role radios (Owner/Branch manager/Staff) with Can/Cannot copy; Extra responsibilities (Manage vouchers = `canManageVouchers`; Manage campaigns + Manage billing = disabled "coming soon"); Branches (All / Specific - **Specific only rendered when the backend has it enabled**; if `SPECIFIC_BRANCHES_ENABLED` is off, show all-branches only); Automated emails = **read-only informational** (spec §D9, no editable toggles); App-password reset row (edit + app user only). Title swaps "Add staff member" / "Edit {name}". Submit calls the right mutation.
- [ ] **Step 2-4:** Implement (a `Sheet`/side-drawer is preferred per the prototype; if not present, add `components/ui/sheet.tsx` via shadcn or use the handrolled `Dialog`). Run green, commit.

### Task C5: Row actions + invite-delivery UX

**Files:** `components/staff/StaffRowActions.tsx`

- [ ] **Step 1: Write failing RTL tests:** Edit access; Reset app password (app users; **disabled when the branch has >1 app user** per the count from `listBranchAppUsers` - the §5.3 UI guard); Reactivate (deactivated only); Deactivate (active, not last owner); Remove from team (not last owner); Resend invite (not-yet-claimed only); last-owner lock footnote. Plus the **invite-delivery dependency UX** (spec §5.1.2): when email is dark, the invite confirmation surfaces the claim link to the owner / a clear "invite will send once email is live" state rather than implying delivery (the exact copy is a C-task decision; the test pins that no "email sent" claim is shown when the API indicates dark delivery).
- [ ] **Step 2-4:** Implement. Run green, commit.

### PR-C verification

- [ ] `cd apps/merchant-web && npm run test` green; `npm run typecheck` clean.
- [ ] Manual device-QA against a local backend (PR-B merged): owner invites a BRANCH_MANAGER; the member row shows unclaimed; resend works; deactivate/reactivate/remove; app-user reset/deactivate; multi-app-user branch disables the per-user action; suspended merchant sees blocked state; pre-live shows owner-only.

### PR-C scope guard (closed)

`apps/merchant-web/**` only. No backend, no schema, no API contract change (consume PR-B as-is). If a backend gap appears, **stop-and-report** (do not patch the backend from PR-C).

### PR-C rollback notes

Frontend-only; revert the branch. The `navItems.ts` href revert (`/staff` -> `#`) hides the surface instantly. No data migration.

### PR-C adversarial review checklist

- Owner-only management enforced in UI (non-owner sees no Add/row-actions) AND backed by PR-B's `assertOwner` (UI is not the security boundary).
- "Specific branches" only rendered when backend-enabled; Automated-emails read-only (no editable toggles, §D9); caps hardcoded with "contact Redeemo" copy.
- Reset/deactivate app-user action disabled on multi-app-user branches (§5.3 UI guard).
- Invite UX does not claim email delivery while dark (§5.1.2); brand tokens, no em-dashes.

### PR-C SHA-bound merge gate

Live `gh api compare` scope check (only `apps/merchant-web/**`); `REDEEMO_PR_SCOPE_VERIFIED=<head-sha>`; owner approval.

---

## Cross-PR self-review (spec coverage)

| Spec item | Covered by |
|---|---|
| D3 `canManageVouchers` migration | A1 |
| Two-resolver pattern (§4.1) | A4 (`resolveMerchantContext` added; `resolveAdminMerchant` unchanged, pinned A5) |
| Single-membership contract (`MULTI_MEMBERSHIP_UNSUPPORTED`) | A3 |
| Guards (`assertOwner`/`assertCanManageVouchers`/`assertBranchAllowed`) | A4 |
| Route-guard matrix migration (§4.3) | B5 (resolver routes) + B6 (the two † routes) |
| Voucher 4-case protection (§5.1.1) | B5 Step 1 |
| Membership CRUD + invite (claim-link) (D5/D6) | B1, B2 |
| Re-invite-after-remove (D5b×D6) | B2a |
| findFirst ambiguity guard + atomicity (§5.3) | B4 |
| App-user read surface (D7) | B4 |
| Specific-branches in-v1 gate (§5.2) | B1/B3 (gated) + B7 (flip) |
| Non-owner login cutover (§4.4) | B8 (last) |
| Suspended = blocked (§6.1) | B (resolver throws) + C3 (UI blocked state) |
| Invite email-dark dependency (§5.1.2) | C5 UX + the backend already mints token (no code) |
| Hardcoded email defaults, no prefs (D9) | C4 read-only informational |
| merchant-web module (§6) | C1-C5 |
| Owner-only management v1 | B3 (`assertOwner`) + C3 (UI) |
| Last-owner protection (D8) | B2 (`assertNotLastOwner`) |

**Placeholder scan:** none - every task names exact files + the test contract; security-critical code (resolver, guards, the two † patches, findFirst guard, login cutover) is given verbatim.

**Type consistency:** `MerchantContext`/`ActiveMembership` shapes match across A3/A4/B5/B6; `getActiveMembership` is the single resolver source consumed by `resolveMerchantContext` (A4) and `resolveMerchantInfo` (B8).

---

## Execution handoff (after owner approval)

Per the owner's direction: **do not start implementation**. After this plan is approved, **land the spec + this plan together as a docs-only PR** (the Day-2 pattern), THEN begin PR-A under subagent-driven-development (fresh implementer + fresh adversarial reviewer per PR, SHA-bound gates), pausing at each PR's merge gate for owner approval.

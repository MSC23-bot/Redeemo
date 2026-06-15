# Option B B2.3: Admin Edit Merchant Category (primaryCategoryId) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan ships as THREE separate PRs (B2.3-read, B2.3-core, B2.3-web) in order; each milestone section below is independently shippable and gets its own PR + SHA-bound merge.

**Goal:** Let a SUPER_ADMIN set or change a merchant's `primaryCategoryId` on the merchant's behalf, preserving the existing RMV-provisioning side effects, the `CATEGORY_CHANGE_BLOCKED` guard, and the two-step confirm flow, with actor-attributed audit, surfaced as a "Category" card + eligible picker + two-stage confirm dialog on `/merchants/[id]`.

**Architecture:** Extract a shared dispatcher `setMerchantCategoryCore(prisma, { merchantId, actor }, newCategoryId, confirm, ctx)` (the D4 seam) that BOTH the merchant-JWT wrapper (`updateMerchantProfile`, actor MERCHANT_ADMIN) and a new admin route (actor ADMIN + reason) call. The dispatcher keeps the existing first-set-vs-change branch behaviour: the first-set provisioning stays its own path; the change path stays in `handleCategoryChange`. Both paths gain actor-attributed in-transaction audit via `writeAuditLogTx` (replacing the current fire-and-forget `writeAuditLog`). No schema or migration.

**Tech Stack:** Backend Fastify 5 + Prisma 7 (Neon Postgres 16), Vitest (mock `test:unit` + real-DB `*.integration.test.ts`). Admin-web Next 15 App Router + React 19 + React Query v5 + Tailwind 4, Jest + jsdom.

---

## Shared context (live code, inspected 2026-06-15)

- **`primaryCategoryId` is NOT a simple-DIRECT field** (not in `DIRECT_SIMPLE_FIELDS`), so B2.3 cannot reuse `updateMerchantProfileDirectCore` like B2.1/B2.2. The logic lives in `src/api/merchant/profile/service.ts:85-136` (`updateMerchantProfile`, the `primaryCategoryId` branch) + `src/api/merchant/voucher/service.ts:482-533` (`handleCategoryChange`).
- **First-set path** (`updateMerchantProfile`, `primaryCategoryId === null`): inline `$transaction` sets the category + provisions 2 RMVs (`rmvTemplate.findMany({ categoryId, isActive }, take: 2)`; `NO_RMV_TEMPLATE` if `< 2`), then fire-and-forget `writeAuditLog` `RMV_PROVISIONED` + `MERCHANT_PROFILE_UPDATED`. No confirm.
- **Change path** (`handleCategoryChange`): blocks if any RMV is `PENDING_APPROVAL`/`ACTIVE` (`CATEGORY_CHANGE_BLOCKED`); if `confirm !== true` returns `{ requiresConfirmation: true, message }`; else `$transaction` soft-deletes DRAFT RMVs (`status -> INACTIVE`), sets the category, provisions 2 new RMVs (`NO_RMV_TEMPLATE` if `< 2`), then fire-and-forget `writeAuditLog` `CATEGORY_CHANGED`. Same-category is a no-op.
- **The merchant route** `src/api/merchant/profile/routes.ts:17-25` is loose-bodied (`z.record`); the merchant sends `{ primaryCategoryId, confirm }`. The wrapper returns `getMerchantProfile(prisma, adminId)` after applying. `handleCategoryChange` is imported by `profile/service.ts` only (grep before refactor to confirm no other caller).
- **`writeAuditLogTx`** (`src/api/shared/audit.ts:167`) supports `{ entityId, entityType, event, actorId, actorType, before, after, reason, ipAddress, userAgent, metadata }`. `ActorType` includes `ADMIN` + `MERCHANT_ADMIN`. `AuditLog.event` is a plain String column (no migration for any event reuse).
- **Reads:** `getMerchantDetail` (`src/api/admin/merchants/service.ts:97`) returns the category NAME only (`primaryCategory: { select: { name: true } }`), NOT `primaryCategoryId`. There is NO admin categories list; the only list is `listActiveCategories` (`src/api/customer/discovery/service.ts:4563`, customer route `GET /api/v1/customer/categories`).
- **Eligibility:** `Category.rmvTemplates` (relation `CategoryRmvTemplates`); a category is a valid `primaryCategoryId` pick only if it has `>= 2` active RMV templates (else the apply throws `NO_RMV_TEMPLATE`). `RmvTemplate.categoryId` + `isActive`.
- **Resolvers:** `resolveTargetMerchantForAdmin(prisma, id)` (allows SUSPENDED, throws `MERCHANT_NOT_FOUND`) for the admin path; `resolveAdminMerchant` (blocks SUSPENDED) stays the merchant path.
- **Capabilities** `src/api/admin/capability.ts`: union + `ALL_SLICE1_CAPS` + `adminHasCapability` (SUPER_ADMIN short-circuit). A cap in the union but NOT in `ALL_SLICE1_CAPS` is SUPER_ADMIN-only. Mirror in `apps/admin-web/lib/auth/session.ts`.

## Cross-check table (B2.3 need -> live code reality -> locked decision)

| # | B2.3 need | Live code reality | Locked decision |
|---|---|---|---|
| 1 | Apply category change on the admin path | logic keyed by `adminId` (`resolveAdminMerchant`) in `updateMerchantProfile` + `handleCategoryChange` | Extract `setMerchantCategoryCore({ merchantId, actor })`; merchant wrapper + admin route delegate (D7: keep first-set vs change as distinct paths) |
| 2 | Capability gate | none for category | NEW `merchant:edit-category`, in union + mirror but NOT in `ALL_SLICE1_CAPS` -> SUPER_ADMIN-only (D1) |
| 3 | Live-RMV constraint | `CATEGORY_CHANGE_BLOCKED` on submitted/active RMV | Keep the block; UI shows a locked state; no force-recategorize (D2) |
| 4 | Actor audit | fire-and-forget `writeAuditLog`, no actor | Upgrade the category path to in-tx `writeAuditLogTx` (ADMIN/MERCHANT_ADMIN + reason + before/after/metadata); merchant path non-regression pinned (D3) |
| 5 | Preselect + pick category | detail returns name only; no admin list | Add `primaryCategoryId` to detail + a new admin categories list with `eligible` (D4); ship as B2.3-read first (D5) |
| 6 | Two-step confirm | `handleCategoryChange` returns `requiresConfirmation` | Admin route returns the same; UI previews consequence then re-sends `confirm: true` + reason (D6) |
| 7 | Mandatory-voucher rule | provisioning creates 2 RMVs | Preserve provisioning counts/codes exactly; do not unify the two provisioning paths (D7) |

## Risks (explicit, owner-emphasised)

1. **Shared merchant/voucher blast radius.** `updateMerchantProfile` + `handleCategoryChange` are merchant-portal code. The seam refactor MUST keep the merchant path externally byte-equivalent (it still returns `getMerchantProfile(adminId)` and the same result discriminants). Pin the merchant path with a non-regression test. **Run a FULL backend sweep (`npm run test:unit` + the relevant integration files), not just the owning dir** (the M1 lesson).
2. **Destructive DRAFT RMV replacement.** A confirmed category change soft-deletes the merchant's DRAFT RMVs (`status -> INACTIVE`) and provisions 2 new mandatory RMVs. The admin UI MUST surface this consequence before the confirm (two-stage flow), and the audit MUST capture it.
3. **`CATEGORY_CHANGE_BLOCKED` limits the flow to onboarding / pre-live correction.** Once any RMV is `PENDING_APPROVAL`/`ACTIVE`, category change throws. So an established/live merchant's category cannot be changed here. The UI shows a locked state; this is intentional (D2).
4. **Audit-behaviour change.** Moving the category path from fire-and-forget to in-tx actor audit changes existing behaviour (audit rows now commit/rollback with the state change and carry an actor). Pin the merchant path still produces the same events; pin the admin path produces actor-attributed rows.

## File structure

**B2.3-read (PR 1, backend):**
- Modify: `src/api/admin/merchants/service.ts` (add `primaryCategoryId` to `getMerchantDetail` select + return; new `listAdminCategories`).
- Modify: `src/api/admin/merchants/routes.ts` (new `GET /api/v1/admin/categories`, gated `merchant:read`).
- Test: `tests/api/admin/merchant-detail-routes.test.ts` + `merchant-detail.integration.test.ts` (primaryCategoryId present); new `tests/api/admin/admin-categories-routes.test.ts` + `admin-categories.integration.test.ts`.

**B2.3-core (PR 2, backend):**
- Modify: `src/api/admin/capability.ts` (add `merchant:edit-category`, NOT in `ALL_SLICE1_CAPS`).
- Modify: `src/api/merchant/profile/service.ts` (new `setMerchantCategoryCore`; first-set provisioning made actor-aware + in-tx audit; `updateMerchantProfile` category branch delegates).
- Modify: `src/api/merchant/voucher/service.ts` (`handleCategoryChange` signature -> `(prisma, { merchantId, actor }, newCategoryId, confirm, ctx)`; in-tx `writeAuditLogTx`).
- Modify: `src/api/admin/merchants/routes.ts` (new `PATCH /api/v1/admin/merchants/:id/category`, gated `merchant:edit-category`).
- Test: new `tests/api/admin/admin-merchant-category-routes.test.ts` + `admin-merchant-category.integration.test.ts`; extend any `handleCategoryChange` / `updateMerchantProfile` tests for the new signature + actor audit + merchant-path non-regression.

**B2.3-web (PR 3, admin-web):**
- Modify: `apps/admin-web/lib/auth/session.ts` (mirror `merchant:edit-category`, NOT in `ALL_SLICE1_CAPS`).
- Modify: `apps/admin-web/lib/api/merchants.ts` (add `primaryCategoryId` to detail schema; `editCategory` client + types).
- Create: `apps/admin-web/lib/api/categories.ts` (admin categories list client + Zod).
- Create: `apps/admin-web/lib/merchants/useAdminCategories.ts` + add `useEditMerchantCategory` to `useMerchantActions.ts`.
- Create: `apps/admin-web/features/merchants/EditCategoryDialog.tsx`.
- Modify: `apps/admin-web/app/(app)/merchants/[id]/page.tsx` (Category card + dialog mount + locked state).
- Test: dialog test, hook/client tests, session mirror test, page test.

---

# Milestone B2.3-read (PR 1)

Small, low-risk backend reads that unblock the UI. No category mutation here.

## Task R1: expose `primaryCategoryId` on the merchant detail payload

**Files:**
- Modify: `src/api/admin/merchants/service.ts` (`getMerchantDetail`)
- Test: `tests/api/admin/merchant-detail-routes.test.ts`, `tests/api/admin/merchant-detail.integration.test.ts`

- [ ] **Step 1: Extend the failing read assertions**

In `merchant-detail-routes.test.ts`, add `primaryCategoryId: 'cat-1'` to the mock `detailRow.merchant` and assert `body.merchant.primaryCategoryId === 'cat-1'`. In `merchant-detail.integration.test.ts`, seed the merchant with a `primaryCategoryId` (create or reuse a Category) and assert `res.merchant.primaryCategoryId` equals it.

- [ ] **Step 2: Run to verify it fails**

Run: `eval "$(fnm env)"; fnm use 24; npx vitest run tests/api/admin/merchant-detail-routes.test.ts`
Expected: FAIL (field undefined).

- [ ] **Step 3: Add `primaryCategoryId` to the select + return**

In `getMerchantDetail`, add `primaryCategoryId: true` to the merchant `select` (it already selects `primaryCategory: { select: { name: true } }`; keep both). `primaryCategoryId` flows through the existing `...rest` spread, so the return needs no other change. Update the doc comment to note the id is exposed for the B2.3 category edit (the name stays for display).

- [ ] **Step 4: Run to verify it passes + tsc**

Run: `npx vitest run tests/api/admin/merchant-detail-routes.test.ts && npx tsc --noEmit | grep "error TS" | grep -v savings.service.test`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/api/admin/merchants/service.ts tests/api/admin/merchant-detail-routes.test.ts tests/api/admin/merchant-detail.integration.test.ts
git commit -m "feat(admin): expose primaryCategoryId on merchant detail read (B2.3-read)"
```

## Task R2: admin categories list endpoint with eligibility

**Files:**
- Modify: `src/api/admin/merchants/service.ts` (new `listAdminCategories`)
- Modify: `src/api/admin/merchants/routes.ts` (new `GET /api/v1/admin/categories`)
- Test: `tests/api/admin/admin-categories-routes.test.ts` (new), `tests/api/admin/admin-categories.integration.test.ts` (new)

- [ ] **Step 1: Write the failing route + service tests**

`admin-categories-routes.test.ts` (mock, mirroring `merchant-detail-routes.test.ts`): 401 unauth; 403 `ADMIN_CAPABILITY_DENIED` for SUPPORT (lacks `merchant:read`); 200 for OPERATIONS returning `{ categories: [{ id, name, parentId, eligible }] }`; assert the prisma call selects `_count.rmvTemplates` filtered to `isActive: true`.

`admin-categories.integration.test.ts` (real DB): seed a category with 2 active RMV templates (eligible) and one with 0 (ineligible); assert the eligible flags. Use prefix-scoped bulk teardown + 60s timeout.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/api/admin/admin-categories-routes.test.ts`
Expected: FAIL (route 404).

- [ ] **Step 3: Implement `listAdminCategories`**

In `src/api/admin/merchants/service.ts`:

```ts
/**
 * B2.3-read: the categories an admin can assign as a merchant's primaryCategoryId.
 * `eligible = (active RMV templates >= 2)` mirrors the provisioning constraint
 * (setMerchantCategoryCore throws NO_RMV_TEMPLATE for a category with < 2 active
 * templates), so the picker can disable ineligible categories. Top-level active
 * categories only (parentId: null), matching the merchant onboarding picker.
 */
export async function listAdminCategories(prisma: PrismaClient) {
  const cats = await prisma.category.findMany({
    where: { parentId: null, isActive: true },
    select: {
      id: true,
      name: true,
      parentId: true,
      sortOrder: true,
      _count: { select: { rmvTemplates: { where: { isActive: true } } } },
    },
    orderBy: { sortOrder: 'asc' },
  })
  return {
    categories: cats.map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      eligible: c._count.rmvTemplates >= 2,
    })),
  }
}
```

(During implementation, confirm `parentId: null` matches the set the merchant onboarding category picker offers; if onboarding uses a different filter, mirror it and note the deviation.)

- [ ] **Step 4: Add the route**

In `src/api/admin/merchants/routes.ts`, gated `merchant:read` (same as the directory + detail reads):

```ts
import { ..., getMerchantDetail, listAdminCategories } from './service'
...
  // B2.3-read: categories assignable as a merchant's primaryCategoryId, with an
  // eligibility flag (>= 2 active RMV templates). Gated merchant:read.
  app.get('/api/v1/admin/categories', { preHandler: [requireAdminCapability('merchant:read')] }, async () => {
    return listAdminCategories(app.prisma)
  })
```

(Note: this path is `/api/v1/admin/categories`, a sibling of the `/api/v1/admin/merchants` prefix, registered inside `adminMerchantRoutes` for proximity to the consumers; confirm the admin plugin mounts it under the authenticated admin scope.)

- [ ] **Step 5: Run + tsc + commit**

Run: `npx vitest run tests/api/admin/admin-categories-routes.test.ts && npx tsc --noEmit | grep "error TS" | grep -v savings.service.test`
Expected: PASS; tsc clean.

```bash
git add src/api/admin/merchants/service.ts src/api/admin/merchants/routes.ts tests/api/admin/admin-categories-routes.test.ts tests/api/admin/admin-categories.integration.test.ts
git commit -m "feat(admin): GET /admin/categories with RMV-template eligibility (B2.3-read)"
```

## B2.3-read verification + PR

- [ ] Backend `tsc` clean; `npm run test:unit` green; the two new + two extended tests pass; integration locally. Open PR, present head SHA + scope + CI, pause for owner + Codex, SHA-bound merge.

---

# Milestone B2.3-core (PR 2)

The D4 seam + admin route + confirm + actor audit. This is the high-risk milestone (touches shared merchant/voucher code).

## Task C1: capability `merchant:edit-category` (backend)

**Files:** Modify `src/api/admin/capability.ts`

- [ ] **Step 1: Add the cap (SUPER_ADMIN-only)**

In the `AdminCapability` union (after `merchant:edit-identity`):

```ts
  | 'merchant:edit-identity'
  // Option B B2.3: gates the admin edit of a merchant's primaryCategoryId.
  // NOT in ALL_SLICE1_CAPS -> SUPER_ADMIN-only (via the superuser short-circuit).
  // Category change has RMV-provisioning side effects, so it sits at the same
  // higher bar as merchant:edit-identity.
  | 'merchant:edit-category'
```

Do NOT add it to `ALL_SLICE1_CAPS`. Leave `ROLE_CAPABILITIES` + `adminHasCapability` unchanged.

- [ ] **Step 2: tsc + commit** (`npx tsc --noEmit`; commit `feat(admin): add merchant:edit-category capability (B2.3-core)`).

## Task C2: extract `setMerchantCategoryCore` (the D4 seam) + actor audit

**Files:**
- Modify: `src/api/merchant/voucher/service.ts` (`handleCategoryChange` signature + in-tx audit)
- Modify: `src/api/merchant/profile/service.ts` (new `setMerchantCategoryCore`; first-set provisioning actor-aware; `updateMerchantProfile` delegates)
- Test: `tests/api/merchant/profile.test.ts` + any `handleCategoryChange` test (update for the new signature)

- [ ] **Step 1: Confirm `handleCategoryChange` has no other caller**

Run: `grep -rn "handleCategoryChange" src/ tests/`
Expected: only `profile/service.ts` (import + call) and its tests. If another caller exists, update it too.

- [ ] **Step 2: Make `handleCategoryChange` actor-aware + in-tx audit**

In `src/api/merchant/voucher/service.ts`, change the signature and move the audit inside the transaction:

```ts
import { writeAuditLog, writeAuditLogTx, type ActorType } from '../../shared/audit'
...
export async function handleCategoryChange(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: { type: ActorType; id: string; reason?: string } },
  newCategoryId: string,
  confirm: boolean,
  ctx: { ipAddress: string; userAgent: string }
) {
  const submittedRmv = await prisma.voucher.findMany({
    where: { merchantId, isRmv: true, status: { in: ['PENDING_APPROVAL', 'ACTIVE'] } },
  })
  if (submittedRmv.length > 0) throw new AppError('CATEGORY_CHANGE_BLOCKED')

  if (!confirm) {
    return {
      requiresConfirmation: true as const,
      message: 'Changing category will discard your existing RMV drafts. Re-send with confirm: true to proceed.',
    }
  }

  const beforeRow = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { primaryCategoryId: true } })

  await prisma.$transaction(async (tx) => {
    await tx.voucher.updateMany({ where: { merchantId, isRmv: true, status: 'DRAFT' }, data: { status: 'INACTIVE' } })
    await tx.merchant.update({ where: { id: merchantId }, data: { primaryCategoryId: newCategoryId } })
    const templates = await tx.rmvTemplate.findMany({ where: { categoryId: newCategoryId, isActive: true }, take: 2 })
    if (templates.length < 2) throw new AppError('NO_RMV_TEMPLATE')
    await Promise.all(templates.map(t =>
      tx.voucher.create({
        data: {
          merchantId,
          code:            `RMV-${randomBytes(4).toString('hex').toUpperCase()}`,
          isRmv:           true,
          isMandatory:     true,
          rmvTemplateId:   t.id,
          type:            t.voucherType,
          title:           t.title,
          description:     t.description,
          estimatedSaving: t.minimumSaving,
          status:          'DRAFT',
          approvalStatus:  'PENDING',
          merchantFields:  {},
        },
      })
    ))
    await writeAuditLogTx(tx, {
      entityId: merchantId, entityType: 'merchant', event: 'CATEGORY_CHANGED',
      actorId: actor.id, actorType: actor.type, reason: actor.reason,
      before: { primaryCategoryId: beforeRow?.primaryCategoryId ?? null },
      after: { primaryCategoryId: newCategoryId },
      metadata: { newCategoryId },
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    })
  })

  return { changed: true as const }
}
```

(Keep `writeAuditLog` imported if it is still used elsewhere in the file; remove only if now unused.)

- [ ] **Step 3: Add `setMerchantCategoryCore` + first-set provisioning (actor-aware) in `profile/service.ts`**

```ts
import { writeAuditLog, writeAuditLogTx, type AuditEvent, type ActorType } from '../../shared/audit'
import { handleCategoryChange } from '../voucher/service'
...
type CategoryActor = { type: ActorType; id: string; reason?: string }

/**
 * Option B B2.3: the shared category-set/change dispatcher. BOTH the merchant
 * wrapper (actor MERCHANT_ADMIN) and the admin route (actor ADMIN + reason) call
 * this, so the validation/side-effects/audit are identical (no weaker path).
 * D7: the first-set provisioning and the change path stay DISTINCT (the change
 * path is handleCategoryChange); they are NOT unified into one provisioning fn.
 */
export async function setMerchantCategoryCore(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: CategoryActor },
  newCategoryId: string,
  confirm: boolean,
  ctx: { ipAddress: string; userAgent: string }
) {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { primaryCategoryId: true } })
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')

  // First-time set: provision RMVs; no confirm needed.
  if (merchant.primaryCategoryId === null) {
    await prisma.$transaction(async (tx) => {
      await tx.merchant.update({ where: { id: merchantId }, data: { primaryCategoryId: newCategoryId } })
      const templates = await tx.rmvTemplate.findMany({ where: { categoryId: newCategoryId, isActive: true }, take: 2 })
      if (templates.length < 2) throw new AppError('NO_RMV_TEMPLATE')
      await Promise.all(templates.map(t =>
        tx.voucher.create({
          data: {
            merchantId,
            code:            `RMV-${randomBytes(4).toString('hex').toUpperCase()}`,
            isRmv:           true,
            isMandatory:     true,
            rmvTemplateId:   t.id,
            type:            t.voucherType,
            title:           t.title,
            description:     t.description,
            estimatedSaving: t.minimumSaving,
            status:          'DRAFT',
            approvalStatus:  'PENDING',
            merchantFields:  {},
          },
        })
      ))
      await writeAuditLogTx(tx, {
        entityId: merchantId, entityType: 'merchant', event: 'RMV_PROVISIONED',
        actorId: actor.id, actorType: actor.type, reason: actor.reason,
        metadata: { categoryId: newCategoryId },
        ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
      })
      await writeAuditLogTx(tx, {
        entityId: merchantId, entityType: 'merchant', event: 'MERCHANT_PROFILE_UPDATED',
        actorId: actor.id, actorType: actor.type, reason: actor.reason,
        before: { primaryCategoryId: null }, after: { primaryCategoryId: newCategoryId },
        ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
      })
    })
    return { provisioned: true as const }
  }

  // Same category: no-op.
  if (merchant.primaryCategoryId === newCategoryId) return { unchanged: true as const }

  // Change: delegate to handleCategoryChange (block / requiresConfirmation / apply).
  return handleCategoryChange(prisma, { merchantId, actor }, newCategoryId, confirm, ctx)
}
```

Add `randomBytes` import at the top of `profile/service.ts` if not already present (it is: `import { randomBytes } from 'crypto'`).

- [ ] **Step 4: Delegate the wrapper's category branch to the core**

In `updateMerchantProfile`, replace the entire `if ('primaryCategoryId' in updates) { ... }` block (the first-set + change + same-category logic) with:

```ts
  if ('primaryCategoryId' in updates) {
    const newCategoryId = updates.primaryCategoryId as string
    const confirm = updates.confirm === true
    const result = await setMerchantCategoryCore(
      prisma,
      { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } },
      newCategoryId,
      confirm,
      ctx,
    )
    if ('requiresConfirmation' in result) return result
    return getMerchantProfile(prisma, adminId)
  }
```

This preserves the merchant wrapper's external contract (returns `getMerchantProfile(adminId)` on apply, the `requiresConfirmation` object on a preview). The inline first-set provisioning + the old `handleCategoryChange(prisma, merchantId, ...)` call are gone (moved into the core).

- [ ] **Step 5: Update existing tests for the new `handleCategoryChange` signature + add merchant-path non-regression**

Update any test calling `handleCategoryChange(prisma, merchantId, ...)` to the new `(prisma, { merchantId, actor }, ...)` shape. In `tests/api/merchant/profile.test.ts`, pin: a merchant-path category set still returns the profile and writes `MERCHANT_PROFILE_UPDATED` with `actorType: 'MERCHANT_ADMIN'`; a merchant-path change with `confirm: false` returns `requiresConfirmation`.

- [ ] **Step 6: Run the touched unit tests + tsc**

Run: `npx vitest run tests/api/merchant/ && npx tsc --noEmit | grep "error TS" | grep -v savings.service.test`
Expected: PASS; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add src/api/merchant/profile/service.ts src/api/merchant/voucher/service.ts tests/api/merchant/profile.test.ts
git commit -m "feat(merchant): setMerchantCategoryCore seam + actor-attributed category audit (B2.3-core)"
```

## Task C3: admin category route

**Files:** Modify `src/api/admin/merchants/routes.ts`; Test `tests/api/admin/admin-merchant-category-routes.test.ts` (new)

- [ ] **Step 1: Write the failing route tests**

Cases (mirroring the B2.2 identity route test harness; the prisma mock needs `merchant.findUnique` returning `{ primaryCategoryId }`, `$transaction`, `rmvTemplate.findMany` returning 2 templates, `voucher` create/updateMany/findMany, `auditLog.create`):
- 401 unauth.
- 403 for OPERATIONS (lacks `merchant:edit-category`) + SUPPORT.
- 400 missing `reason`; 400 missing `primaryCategoryId`; 400 on a non-allow-listed key (`.strict()`).
- 200 SUPER_ADMIN first-set (`merchant.findUnique` -> `primaryCategoryId: null`) -> provisions, audits `MERCHANT_PROFILE_UPDATED` actorType ADMIN + reason.
- 200 SUPER_ADMIN change with `confirm: false` -> returns `requiresConfirmation` (mock RMV findMany -> `[]` so not blocked).
- 200 SUPER_ADMIN change with `confirm: true` -> applies, audits `CATEGORY_CHANGED` actorType ADMIN.

- [ ] **Step 2: Add the route**

```ts
import { ..., setMerchantCategoryCore } from '../../merchant/profile/service'
...
  // Option B B2.3: admin set/change of a merchant's primaryCategoryId on the
  // merchant's behalf. Gated SUPER_ADMIN-only (merchant:edit-category). STRICT
  // body: primaryCategoryId + optional confirm + required reason. The shared
  // core runs the first-set provisioning OR handleCategoryChange (block /
  // requiresConfirmation / apply) with actor-attributed audit. SUSPENDED merchant
  // allowed (resolveTargetMerchantForAdmin). The change path is still BLOCKED if
  // any RMV is submitted/active (CATEGORY_CHANGE_BLOCKED) - intentional (D2).
  app.patch(`${prefix}/:id/category`, { preHandler: [requireAdminCapability('merchant:edit-category')] }, async (req: any) => {
    const body = z
      .object({
        primaryCategoryId: z.string().min(1),
        confirm: z.boolean().optional(),
        reason: z.string().trim().min(1),
      })
      .strict()
      .parse(req.body)

    const id = idParam(req)
    await resolveTargetMerchantForAdmin(app.prisma, id)

    return setMerchantCategoryCore(
      app.prisma,
      { merchantId: id, actor: { type: 'ADMIN', id: req.user.sub, reason: body.reason } },
      body.primaryCategoryId,
      body.confirm === true,
      auditCtx(req),
    )
  })
```

- [ ] **Step 3: Run + tsc + commit**

Run: `npx vitest run tests/api/admin/admin-merchant-category-routes.test.ts && npx tsc --noEmit | grep "error TS" | grep -v savings.service.test`
Expected: PASS; tsc clean.

```bash
git add src/api/admin/merchants/routes.ts tests/api/admin/admin-merchant-category-routes.test.ts
git commit -m "feat(admin): PATCH /admin/merchants/:id/category (SUPER_ADMIN, confirm, reason) (B2.3-core)"
```

## Task C4: backend integration (real DB)

**Files:** Create `tests/api/admin/admin-merchant-category.integration.test.ts`

- [ ] **Step 1: Write the integration test**

Seed (prefix-scoped, bulk teardown, 60s timeout, FK order audit+vouchers before merchants): a category with `>= 2` active RMV templates (`catA`), a second eligible category (`catB`), and a template-less category (`catNone`). Assert, calling `setMerchantCategoryCore` directly (and at least one via `app.inject` against the route for the end-to-end path):
- **First-set:** merchant with `primaryCategoryId: null` + `setMerchantCategoryCore(catA)` -> `primaryCategoryId === catA`, exactly 2 RMV vouchers created (`isRmv && isMandatory && status DRAFT`), `RMV_PROVISIONED` + `MERCHANT_PROFILE_UPDATED` audit rows with `actorType ADMIN` + reason.
- **Change confirm:false:** merchant on `catA` with a DRAFT RMV -> `setMerchantCategoryCore(catB, confirm=false)` -> returns `{ requiresConfirmation: true }`, primaryCategoryId UNCHANGED, no new audit.
- **Change confirm:true:** same -> applies: old DRAFT RMVs -> INACTIVE, primaryCategoryId === catB, 2 new DRAFT RMVs, `CATEGORY_CHANGED` audit `actorType ADMIN` + before/after.
- **BLOCKED:** merchant on `catA` with an ACTIVE RMV -> `setMerchantCategoryCore(catB, confirm=true)` -> rejects `CATEGORY_CHANGE_BLOCKED`.
- **NO_RMV_TEMPLATE:** first-set to `catNone` -> rejects `NO_RMV_TEMPLATE`, no partial write (merchant primaryCategoryId stays null).
- **Same-category:** `setMerchantCategoryCore(catA)` on a merchant already on catA -> `{ unchanged: true }`, no audit.
- **Merchant-path non-regression:** `updateMerchantProfile(adminId, { primaryCategoryId: catA })` for an owner -> provisions + returns the profile, audit `actorType MERCHANT_ADMIN`.

- [ ] **Step 2: Run locally + commit**

Run: `npx vitest run tests/api/admin/admin-merchant-category.integration.test.ts`
Expected: PASS.

```bash
git add tests/api/admin/admin-merchant-category.integration.test.ts
git commit -m "test(admin): B2.3 category core integration (first-set/change/blocked/no-template/merchant-path)"
```

## Task C5: FULL backend sweep (the M1 lesson)

- [ ] **Step 1: Run the whole unit gate + the category/merchant/voucher integration files**

Run: `npm run test:unit && npx vitest run tests/api/merchant/ tests/api/admin/`
Expected: `test:unit` green (the seam touched shared merchant/voucher code, so a dir-scoped run is NOT enough); integration green locally (verify NEW failures only against the known flaky discovery/seed baseline).

- [ ] **Step 2:** Confirm `tsc --noEmit` clean (4 pre-existing savings baseline allowed). Open the B2.3-core PR; present head SHA + scope + the FULL-sweep result + CI; pause for owner + Codex; SHA-bound merge.

---

# Milestone B2.3-web (PR 3)

The admin-web Category card + eligible picker + two-stage confirm dialog + locked state.

## Task W1: capability mirror + clients + detail schema

**Files:**
- Modify: `apps/admin-web/lib/auth/session.ts` (mirror `merchant:edit-category`, NOT in `ALL_SLICE1_CAPS`) + `lib/auth/__tests__/session.test.ts` (SUPER_ADMIN-only block).
- Modify: `apps/admin-web/lib/api/merchants.ts` (add `primaryCategoryId: z.string().nullable()` to `merchantDetailSchema.merchant`; `EditCategoryInput` + `merchantsApi.editCategory` returning a discriminated `{ requiresConfirmation } | { changed } | { provisioned } | { unchanged }` parsed leniently; update the `getById` fixtures in `merchants.test.ts`).
- Create: `apps/admin-web/lib/api/categories.ts` (`adminCategoriesApi.list` -> `GET /api/v1/admin/categories`, Zod `{ categories: [{ id, name, parentId, eligible }] }`) + `lib/api/__tests__/categories.test.ts`.

- [ ] **Step 1:** Mirror the cap (not in `ALL_SLICE1_CAPS`); add the SUPER_ADMIN-only test block (mirror the B2.2 `merchant:edit-identity` block).
- [ ] **Step 2:** Add `primaryCategoryId` to the detail schema; update the existing `getById` test fixtures (add `primaryCategoryId`).
- [ ] **Step 3:** Add `EditCategoryInput { primaryCategoryId: string; confirm?: boolean; reason: string }` + `editCategory` client (PATCH `/api/v1/admin/merchants/${id}/category`); parse the response leniently (it is a small discriminated object). Add the categories list client + Zod.
- [ ] **Step 4:** Tests for both clients (URL/method/body/auth + Zod). Run `npx jest lib/api lib/auth`; commit.

## Task W2: hooks

**Files:** Create `apps/admin-web/lib/merchants/useAdminCategories.ts`; add `useEditMerchantCategory` to `useMerchantActions.ts` + tests.

- [ ] `useAdminCategories(enabled)` -> React Query `['admin-categories']` calling `adminCategoriesApi.list`.
- [ ] `useEditMerchantCategory(merchantId)` -> mutation calling `merchantsApi.editCategory`; on a result that is NOT `requiresConfirmation`, invalidate `merchantDetailQueryKey(merchantId)` + `MERCHANTS_LIST_KEY` (success AND error). A `requiresConfirmation` result is a normal resolve (not an error) and must NOT invalidate. Pin this in the hook test.
- [ ] Run `npx jest lib/merchants`; commit.

## Task W3: EditCategoryDialog (eligible picker + two-stage confirm)

**Files:** Create `apps/admin-web/features/merchants/EditCategoryDialog.tsx` + test.

- [ ] **Structure** (model on `EditMerchantIdentityDialog` + the review-screen confirm dialogs): props `{ merchantId, currentCategoryId, onSuccess, onCancel }`. Load categories via `useAdminCategories(true)`. A `<select>` (or button list) of categories with `eligible === true` enabled and `eligible === false` shown-but-disabled (labelled "no RMV templates"). A required reason field. Two-stage state machine:
  - Stage 1 (pick): "Review change" is enabled when a category is chosen (different from current) AND reason is non-empty. It calls `editCategory({ primaryCategoryId, reason })` (no confirm). If the result is `requiresConfirmation`, move to Stage 2 and show `result.message` (the discard-drafts consequence). If the result is `provisioned`/`changed`/`unchanged`, call `onSuccess` (first-set needs no confirm).
  - Stage 2 (confirm): show the consequence message + a confirm button "Discard drafts and change category" that calls `editCategory({ primaryCategoryId, reason, confirm: true })`. On `changed`, call `onSuccess`.
  - Errors via `NamedGateBanner` (maps `CATEGORY_CHANGE_BLOCKED`, `NO_RMV_TEMPLATE`, `MERCHANT_NOT_FOUND`; add these copy entries to `NamedGateBanner.tsx`).
  - testids: `edit-category-dialog`, `edit-category-select`, `edit-category-reason`, `edit-category-review`, `edit-category-confirm-message`, `edit-category-confirm`, `edit-category-cancel`.
- [ ] **Test:** review-button gating (category chosen + reason); first-set path (result provisioned -> onSuccess, no stage 2); change path (requiresConfirmation -> stage 2 message shown -> confirm sends `confirm: true`); ineligible category disabled; `NamedGateBanner` on `CATEGORY_CHANGE_BLOCKED`.
- [ ] Run `npx jest features/merchants/__tests__/EditCategoryDialog.test.tsx`; commit.

## Task W4: Category card on the detail page + locked state

**Files:** Modify `apps/admin-web/app/(app)/merchants/[id]/page.tsx` + `__tests__/page.test.tsx`.

- [ ] Add a "Category" card showing the current category name (from `data.merchant.category`). Compute `canEditCategory = can('merchant:edit-category')`. The Edit button shows only when `canEditCategory`. The card needs a **locked indicator** when the merchant has submitted/live RMVs: since the detail payload does not currently carry RMV status, EITHER (a) show the Edit button and let the route return `CATEGORY_CHANGE_BLOCKED` (surfaced in the dialog), OR (b) extend the detail payload with a `categoryLocked` boolean (a B2.3-read addition: `true` if any RMV is `PENDING_APPROVAL`/`ACTIVE`). **Recommended: do (b) in B2.3-read** (add `categoryLocked` to `getMerchantDetail`) so the card can show the locked state without a failed round-trip; if not, fall back to (a). Decide at B2.3-read time and reflect here.
- [ ] Extend `OpenDialog` with `{ kind: 'category' }`; mount `EditCategoryDialog`.
- [ ] **Test:** card renders the category; Edit shown only with `merchant:edit-category`; hidden for a merchant:read/merchant:edit admin without it; locked state hides Edit (if (b)); dialog mounts on click.
- [ ] Run `npx jest "app/(app)/merchants"`; commit.

## B2.3-web verification + PR

- [ ] admin-web `tsc` clean; full `jest` green; **`next build` in the main checkout** (worktree cannot); style sweep `grep -P '\x{2014}'` (brace form) clean, no emojis. Open PR, present head SHA + scope + CI + checks, pause for owner + Codex, SHA-bound merge.

---

## Cross-milestone note on `categoryLocked` (B2.3-read addition, decided at implementation)

If the locked-state UI (Task W4 option b) is adopted, add `categoryLocked` to `getMerchantDetail` in **B2.3-read** (compute `true` when the merchant has any RMV in `PENDING_APPROVAL`/`ACTIVE`), and to the admin-web detail schema in **B2.3-web**. This keeps the read change in the read milestone. If deferred, the card relies on the route's `CATEGORY_CHANGE_BLOCKED` (surfaced in the dialog). Record the choice in the B2.3-read PR.

## Closed-scope exclusions (do NOT touch in B2.3)

- No schema change, no migration (the cap is TS-only; the events `CATEGORY_CHANGED`/`RMV_PROVISIONED`/`MERCHANT_PROFILE_UPDATED` already exist; `AuditLog.event` is a String column).
- No force-recategorize-live-merchant flow (D2): keep `CATEGORY_CHANGE_BLOCKED`.
- Do NOT unify the two RMV provisioning paths (D7): the first-set provisioning and `handleCategoryChange` stay distinct.
- No change to the RMV provisioning counts/codes (RMV-001/002 contract preserved).
- No B2.4 (branch create/soft-delete), B2.5 (post-go-live SENSITIVE via B1 lane), B3 (submit-on-behalf), B4 (doc upload), B5 (voucher co-build), Merchant Portal, photo-apply, PR3 `branchCount`, stash restore.
- No customer-app / customer-web changes (the customer `listActiveCategories` is untouched; the admin list is a new endpoint).

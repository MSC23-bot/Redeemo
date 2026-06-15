# Option B B2.4: Admin Branch Create / Soft-Delete On-Behalf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan ships as TWO separate PRs (B2.4-core, B2.4-web) in order; each milestone section is independently shippable and gets its own PR + SHA-bound merge.

**Goal:** Let a SUPER_ADMIN create a new branch for a merchant, and soft-delete a branch, on the merchant's behalf, preserving the existing guards and side-effects, with actor-attributed transactional audit and a redacted response, surfaced as an "Add branch" affordance + per-branch Delete confirm on `/merchants/[id]`.

**Architecture:** Extract two shared D4 seams: `createBranchCore(prisma, { merchantId, actor }, data, ctx)` and `softDeleteBranchCore(prisma, { merchantId, actor }, branchId, ctx)`. BOTH the merchant-JWT wrappers (`createBranch`/`softDeleteBranch`, actor MERCHANT_ADMIN) and new admin routes (actor ADMIN + reason) call them, so validation/side-effects/audit are identical (no weaker path). The audit moves to actor-attributed in-transaction `writeAuditLogTx` with the corrected `entityType:'branch'`, and the soft-delete cascade becomes atomic. No schema or migration (the `Branch` model + `deletedAt` already exist).

**Tech Stack:** Backend Fastify 5 + Prisma 7 (Neon Postgres 16), Vitest (mock `test:unit` + real-DB `*.integration.test.ts`). Admin-web Next 15 App Router + React 19 + React Query v5 + Tailwind 4, Jest + jsdom.

---

## Shared context (live code, inspected 2026-06-15)

- **`Branch` model** (`prisma/schema.prisma:487-527`): `isMainBranch`, `isActive`, `deletedAt` (§BRANCHDEL soft-delete marker, DISTINCT from `isActive`), `redemptionPin` (AES-encrypted, null until set), `latitude/longitude`, `locationConfidence` (Plan 4 snapshot).
- **`createBranch`** (`src/api/merchant/branch/service.ts:91-144`): resolves via `resolveAdminMerchant(adminId)`; first branch (`count where merchantId, deletedAt:null === 0`) becomes `isMainBranch`; **requires `postcode`** (`POSTCODE_REQUIRED`) then `resolveBranchLocationFields(postcode)` (sets `locationConfidence:'POSTCODE_CENTROID'`; throws `POSTCODE_NOT_FOUND` / `GAZETTEER_UNAVAILABLE`); **caller `latitude/longitude` are dropped**; does NOT set a `redemptionPin`; fire-and-forget `BRANCH_CREATED` audit (`entityType:'merchant'`, `metadata.branchId`); returns the branch with `BRANCH_INCLUDE`.
- **`softDeleteBranch`** (`...service.ts:453-497`): resolves via `resolveAdminMerchant`; `findFirst {id, merchantId, deletedAt:null}` (`BRANCH_NOT_FOUND`); guards **`BRANCH_IS_MAIN`** + **`BRANCH_LAST_ACTIVE`** (only when `merchant.status==='ACTIVE'` and `activeBranchCount<=1`); **cascades** `branchUser.updateMany -> status:'INACTIVE'`; `branch.update {deletedAt:new Date(), isActive:false}`; fire-and-forget `BRANCH_DELETED` audit. **NOT transactional** (the cascade + soft-delete are two separate writes).
- **`BRANCH_INCLUDE`** (`...service.ts:57-62`): `openingHours/amenities/photos/pendingEdits`. A `prisma.branch.create({ include: BRANCH_INCLUDE })` still returns ALL scalar columns including `redemptionPin` (null on create) and asset URLs - hence the redaction need.
- **`resolveBranchLocationFields`** (`...service.ts:25`): postcode -> location snapshot; throws `POSTCODE_NOT_FOUND` / `GAZETTEER_UNAVAILABLE` (the resolver error); `POSTCODE_REQUIRED` is thrown by `createBranch` itself.
- **`createBranchBody`** Zod (`src/api/merchant/branch/routes.ts:24`): `name, addressLine1, addressLine2?, city, postcode, country?, latitude?, longitude?, phone?, email?, websiteUrl?, logoUrl?, bannerUrl?, about?`. Merchant routes: `POST /merchant/branches` (create), `DELETE /merchant/branches/:id` (soft-delete, no body).
- **Admin routes** (`src/api/admin/branches/routes.ts`): prefix `/api/v1/admin/branches`; existing `POST /:id/confirm-location` (M4, `branch:confirm-location`) + `PATCH /:branchId` (B2.1, `merchant:edit`). The admin merchant routes own `/api/v1/admin/merchants` (`src/api/admin/merchants/routes.ts`).
- **Capability** (`src/api/admin/capability.ts`): union + `ALL_SLICE1_CAPS` + `adminHasCapability` (SUPER_ADMIN short-circuit). A cap NOT in `ALL_SLICE1_CAPS` is SUPER_ADMIN-only. Mirror in `apps/admin-web/lib/auth/session.ts`.
- **Resolver** (`src/api/merchant/shared.ts`): `resolveTargetMerchantForAdmin(prisma, merchantId) -> { merchantId, status }` (allows SUSPENDED; throws `MERCHANT_NOT_FOUND`); `EditActor`.
- **`writeAuditLogTx`** (`src/api/shared/audit.ts:167`): `{ entityId, entityType, event, actorId, actorType, before, after, reason, ipAddress, userAgent, metadata }`; `ActorType` includes `ADMIN` + `MERCHANT_ADMIN`; `BRANCH_CREATED` + `BRANCH_DELETED` already in the `AuditEvent` union; `AuditLog.event` is a String column (no migration).
- **Admin-web detail page** (`apps/admin-web/app/(app)/merchants/[id]/page.tsx`): `BranchCard` (130) per branch (id/name/isMainBranch/isActive/address) inside `merchant-branches-section` (388) with the B2.1 `branch-edit-<id>` button. The detail payload already carries every branch field the delete UI needs (id, name, isMainBranch, isActive) - so B2.4 needs NO read slice.

## Decision 8 resolution: POST for delete, not DELETE-with-body

The admin delete needs a `reason` on the wire. We use **`POST /api/v1/admin/branches/:branchId/delete`** (body `{ reason }`), NOT `DELETE` with a body, because: (1) there is NO DELETE-with-body precedent in this codebase; (2) every existing admin action route (suspend / reactivate / confirm-location) is a `POST`; (3) HTTP DELETE request bodies are unreliable through proxies / some fetch stacks; (4) the merchant soft-delete uses `DELETE /:id` with the id in params and NO body, so there is no body convention to match. Create stays `POST /api/v1/admin/merchants/:id/branches`.

## Cross-check table (B2.4 need -> live code reality -> locked decision)

| # | B2.4 need | Live code reality | Locked decision |
|---|---|---|---|
| 1 | Admin create on-behalf | `createBranch(adminId)` keyed by `resolveAdminMerchant` | Extract `createBranchCore({ merchantId, actor })`; merchant wrapper + admin route delegate (no weaker path) |
| 2 | Admin soft-delete on-behalf | `softDeleteBranch(adminId)`; non-transactional cascade | Extract `softDeleteBranchCore({ merchantId, actor })`; wrap cascade + soft-delete + audit in ONE `$transaction` (D4) |
| 3 | Capability | none for branch create/delete | NEW `merchant:manage-branches`, in union + mirror but NOT in `ALL_SLICE1_CAPS` -> SUPER_ADMIN-only (D1) |
| 4 | Delete guards | `BRANCH_IS_MAIN` + `BRANCH_LAST_ACTIVE` | Keep both on the admin path (D2) |
| 5 | Reason | merchant path has no reason | Required non-empty `reason` on admin create + delete, persisted on the audit row (D5) |
| 6 | Audit entity + attribution | fire-and-forget `writeAuditLog`, `entityType:'merchant'` | In-tx `writeAuditLogTx`, `entityType:'branch', entityId:branchId`, actor + reason (D3 + D4) |
| 7 | No PIN leak on create response | `branch.create({ include })` returns `redemptionPin` + secrets | Admin route returns a TIGHT redacted shape (no `redemptionPin`/asset secrets), like `getMerchantDetail`'s branch select (D6) |
| 8 | Location inputs | `createBranch` drops lat/lng; postcode -> POSTCODE_CENTROID | Admin create body does NOT accept lat/lng; location via postcode; pin-precise via existing confirm-location (D7) |
| 9 | SUSPENDED merchant | `resolveTargetMerchantForAdmin` allows SUSPENDED | Reuse it on both admin routes |
| 10 | Route shape | merchant create=POST, delete=DELETE(no body) | `POST /admin/merchants/:id/branches` + `POST /admin/branches/:branchId/delete` (D8; see rationale above) |

## Risks (explicit, owner-emphasised)

1. **Shared merchant/branch blast radius.** `createBranch`/`softDeleteBranch` are merchant-portal code. The seam refactor MUST keep the merchant path externally equivalent (the wrappers still return what they returned: `createBranch` -> the branch with `BRANCH_INCLUDE`; `softDeleteBranch` -> `{ ok: true }`). **Run a FULL backend sweep** (`npm run test:unit` + the merchant/admin integration files), not a dir-scoped run (the M1 lesson).
2. **Staff-login deactivation cascade.** Soft-delete sets every `branchUser` of the branch to `INACTIVE` (staff can no longer log in). This is destructive; the UI confirm MUST disclose it, the cascade MUST be atomic with the soft-delete, and the audit MUST capture the action.
3. **Main-branch + last-active guards.** `BRANCH_IS_MAIN` (never delete the main branch) and `BRANCH_LAST_ACTIVE` (never delete the last active branch of an ACTIVE merchant) must hold for the admin path.
4. **Discovery / list-vs-map for POSTCODE_CENTROID branches.** A newly created branch has `locationConfidence:'POSTCODE_CENTROID'` -> per the LOCKED PR #81 §4.1.1 asymmetry it is list-included but map-pin-hidden until the admin runs confirm-location (M4). B2.4 adds NO discovery code; the create + confirm-location stay two separate steps. Soft-delete removes the branch from discovery (via `isActive:false` + `deletedAt`).
5. **Redaction of `redemptionPin`.** The create response must never include `redemptionPin` (or `logoUrl`/`bannerUrl`/`priceListUrl`/`about`). Return the tight admin shape (D6), pinned at the integration level with a PIN sentinel.
6. **Audit entity change merchant -> branch.** Moving `BRANCH_CREATED`/`BRANCH_DELETED` from `entityType:'merchant'` to `entityType:'branch'` is a behaviour change to the merchant path's audit; pin the merchant path non-regression (the wrapper still creates/deletes and now audits `entityType:'branch'`).
7. **Postcode resolution dependency.** Create depends on the gazetteer; a missing/invalid postcode or a gazetteer outage rejects the whole create (`POSTCODE_REQUIRED` / `POSTCODE_NOT_FOUND` / `GAZETTEER_UNAVAILABLE`). The admin UI must surface these via `NamedGateBanner`.

## File structure

**B2.4-core (PR 1, backend):**
- Modify: `src/api/admin/capability.ts` (add `merchant:manage-branches`, NOT in `ALL_SLICE1_CAPS`).
- Modify: `src/api/merchant/branch/service.ts` (`createBranchCore` + `softDeleteBranchCore` seams; wrappers delegate; in-tx actor audit; transactional soft-delete; a `toAdminBranchShape` redaction helper exported for the routes).
- Modify: `src/api/admin/merchants/routes.ts` (`POST /:id/branches`).
- Modify: `src/api/admin/branches/routes.ts` (`POST /:branchId/delete`).
- Test: new `tests/api/admin/admin-branch-manage-routes.test.ts`; new `tests/api/admin/admin-branch-manage.integration.test.ts`; extend any existing `createBranch`/`softDeleteBranch` test for the new audit entity + merchant non-regression.

**B2.4-web (PR 2, admin-web):**
- Modify: `apps/admin-web/lib/auth/session.ts` (mirror `merchant:manage-branches`, NOT in `ALL_SLICE1_CAPS`) + `lib/auth/__tests__/session.test.ts`.
- Modify: `apps/admin-web/lib/api/branches.ts` (add `branchesApi.create` + `branchesApi.softDelete` + types) + `lib/api/__tests__/branches.test.ts`.
- Modify: `apps/admin-web/lib/merchants/useMerchantActions.ts` (add `useCreateBranch` + `useDeleteBranch`) + its test.
- Modify: `apps/admin-web/features/review/NamedGateBanner.tsx` (map `POSTCODE_REQUIRED`/`POSTCODE_NOT_FOUND`/`GAZETTEER_UNAVAILABLE`/`BRANCH_IS_MAIN`/`BRANCH_LAST_ACTIVE`).
- Create: `apps/admin-web/features/merchants/AddBranchDialog.tsx` + `DeleteBranchConfirm.tsx` + tests.
- Modify: `apps/admin-web/app/(app)/merchants/[id]/page.tsx` (Add-branch button + per-branch delete affordance) + its test.

---

# Milestone B2.4-core (PR 1)

## Task C1: capability `merchant:manage-branches`

**Files:** Modify `src/api/admin/capability.ts`

- [ ] **Step 1: Add the cap (SUPER_ADMIN-only)**

In the `AdminCapability` union (after `merchant:edit-category`):

```ts
  | 'merchant:edit-category'
  // Option B B2.4: gates admin branch create + soft-delete on the merchant's
  // behalf. NOT in ALL_SLICE1_CAPS -> SUPER_ADMIN-only (via the superuser
  // short-circuit). Soft-delete is destructive (it permanently removes a branch
  // and deactivates its staff logins), so it sits at the higher SUPER_ADMIN bar.
  | 'merchant:manage-branches'
```

Do NOT add it to `ALL_SLICE1_CAPS`. Leave `ROLE_CAPABILITIES` + `adminHasCapability` unchanged.

- [ ] **Step 2: tsc + commit** (`npx tsc --noEmit`; commit `feat(admin): add merchant:manage-branches capability (B2.4-core)`).

## Task C2: the two seams + actor audit + redaction helper

**Files:** Modify `src/api/merchant/branch/service.ts`

- [ ] **Step 1: Import `writeAuditLogTx` + `EditActor`**

The file already imports `writeAuditLog` + `resolveAdminMerchant`. Add:

```ts
import { writeAuditLog, writeAuditLogTx } from '../../shared/audit'
import { resolveAdminMerchant, type EditActor } from '../shared'
```

- [ ] **Step 2: Add the redaction helper (exported for the routes)**

```ts
/**
 * Option B B2.4: the tight admin-facing branch shape. NEVER includes
 * `redemptionPin` (AES-encrypted) or asset/secret URLs (logoUrl/bannerUrl/
 * priceListUrl/about). Mirrors getMerchantDetail's branch select so the admin
 * create response cannot leak a branch secret.
 */
export function toAdminBranchShape(b: {
  id: string; name: string; isMainBranch: boolean; addressLine1: string;
  addressLine2: string | null; city: string; postcode: string;
  localityName: string | null; locationConfidence: string;
  phone: string | null; email: string | null; websiteUrl: string | null; isActive: boolean;
}) {
  return {
    id: b.id, name: b.name, isMainBranch: b.isMainBranch,
    addressLine1: b.addressLine1, addressLine2: b.addressLine2, city: b.city, postcode: b.postcode,
    localityName: b.localityName, locationConfidence: b.locationConfidence,
    phone: b.phone, email: b.email, websiteUrl: b.websiteUrl, isActive: b.isActive,
  }
}
```

- [ ] **Step 3: Extract `createBranchCore`**

The location resolve (`resolveBranchLocationFields`) STAYS before the transaction (a bad postcode must reject before opening a tx). Move the `branch.create` + audit into one `$transaction`, actor-attributed, `entityType:'branch'`:

```ts
export async function createBranchCore(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  data: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const existingCount = await prisma.branch.count({ where: { merchantId, deletedAt: null } })
  const isMainBranch = existingCount === 0

  const postcode = data.postcode as string | undefined
  if (!postcode) throw new AppError('POSTCODE_REQUIRED')
  const locationFields = await resolveBranchLocationFields(prisma, postcode)

  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.create({
      data: {
        merchantId,
        isMainBranch,
        name:         data.name as string,
        addressLine1: data.addressLine1 as string,
        addressLine2: data.addressLine2 as string | undefined,
        city:         data.city as string,
        postcode,
        country:      (data.country as string | undefined) ?? 'GB',
        phone:        data.phone as string | undefined,
        email:        data.email as string | undefined,
        websiteUrl:   data.websiteUrl as string | undefined,
        logoUrl:      data.logoUrl as string | undefined,
        bannerUrl:    data.bannerUrl as string | undefined,
        about:        data.about as string | undefined,
        ...locationFields,
      },
      include: BRANCH_INCLUDE,
    })
    await writeAuditLogTx(tx, {
      entityId: branch.id, entityType: 'branch', event: 'BRANCH_CREATED',
      actorId: actor.id, actorType: actor.type, reason: actor.reason,
      metadata: { merchantId },
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    })
    return branch
  })
}
```

NOTE on lat/lng: the core does NOT read `data.latitude`/`data.longitude` (they are dropped, matching the merchant path). The admin route's STRICT body will reject them anyway.

- [ ] **Step 4: Delegate `createBranch` to the core**

```ts
export async function createBranch(prisma: PrismaClient, adminId: string, data: Record<string, unknown>, ctx: { ipAddress: string; userAgent: string }) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  return createBranchCore(prisma, { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } }, data, ctx)
}
```

- [ ] **Step 5: Extract `softDeleteBranchCore` (transactional)**

The guards (reads) stay BEFORE the tx; the cascade + soft-delete + audit are INSIDE one tx:

```ts
export async function softDeleteBranchCore(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  branchId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, merchantId, deletedAt: null } })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')
  if (branch.isMainBranch) throw new AppError('BRANCH_IS_MAIN')

  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } })
  if (merchant?.status === 'ACTIVE') {
    const activeBranchCount = await prisma.branch.count({ where: { merchantId, isActive: true, deletedAt: null } })
    if (activeBranchCount <= 1) throw new AppError('BRANCH_LAST_ACTIVE')
  }

  await prisma.$transaction(async (tx) => {
    await tx.branchUser.updateMany({ where: { branchId }, data: { status: 'INACTIVE' } })
    await tx.branch.update({ where: { id: branchId }, data: { deletedAt: new Date(), isActive: false } })
    await writeAuditLogTx(tx, {
      entityId: branchId, entityType: 'branch', event: 'BRANCH_DELETED',
      actorId: actor.id, actorType: actor.type, reason: actor.reason,
      metadata: { merchantId },
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    })
  })

  return { ok: true as const }
}
```

- [ ] **Step 6: Delegate `softDeleteBranch` to the core**

```ts
export async function softDeleteBranch(prisma: PrismaClient, adminId: string, branchId: string, ctx: { ipAddress: string; userAgent: string }) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  return softDeleteBranchCore(prisma, { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } }, branchId, ctx)
}
```

- [ ] **Step 7: Confirm `writeAuditLog` still used elsewhere in the file** (`grep -c "writeAuditLog(" src/api/merchant/branch/service.ts`; it is used by other functions, keep the import). Run `npx tsc --noEmit` + `npx vitest run tests/api/merchant/` (the merchant branch tests must stay green). Commit `feat(merchant): branch create/soft-delete D4 seams + actor-attributed transactional audit (B2.4-core)`.

## Task C3: admin routes

**Files:** Modify `src/api/admin/merchants/routes.ts` (create) + `src/api/admin/branches/routes.ts` (delete); Test new `tests/api/admin/admin-branch-manage-routes.test.ts`

- [ ] **Step 1: Write the failing route tests**

Mock-prisma harness (mirror the B2.2/B2.3 route tests; `$transaction` runs the cb with the same mock). Cases:
- **Create** `POST /api/v1/admin/merchants/m1/branches`: 401 unauth; 403 OPERATIONS + SUPPORT (lack `merchant:manage-branches`); 400 missing `reason`; 400 missing `name`/`postcode`; 400 strict-body reject (`latitude` key); 200 SUPER_ADMIN -> branch created, audit `entityType:'branch'` actor ADMIN + reason, **response has NO `redemptionPin`**. (Mock `branch.count -> 0`, `branch.create -> { id:'b-new', ...redacted fields..., redemptionPin:'SECRET' }`, `resolveBranchLocationFields` is real-ish; for the mock test, stub the merchant `findUnique` for `resolveTargetMerchantForAdmin` and the postcode resolver path - OR drive the redaction assertion at the integration layer if the mock makes the gazetteer awkward. Keep the mock test focused on auth/cap/strict-body; assert redaction in the integration test.)
- **Delete** `POST /api/v1/admin/branches/b1/delete`: 401; 403 OPERATIONS + SUPPORT; 400 missing reason; 404 `BRANCH_NOT_FOUND` (branch findFirst -> null); 409 `BRANCH_IS_MAIN`; 409 `BRANCH_LAST_ACTIVE`; 200 SUPER_ADMIN -> `{ ok: true }`, audit `entityType:'branch'` actor ADMIN + reason.

- [ ] **Step 2: Add the create route** (`src/api/admin/merchants/routes.ts`, gated `merchant:manage-branches`):

```ts
import { createBranchCore, toAdminBranchShape } from '../../merchant/branch/service'
...
  app.post(`${prefix}/:id/branches`, { preHandler: [requireAdminCapability('merchant:manage-branches')] }, async (req: any) => {
    const body = z.object({
      name: z.string().min(1),
      addressLine1: z.string().min(1),
      addressLine2: z.string().optional(),
      city: z.string().min(1),
      postcode: z.string().min(1),
      country: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      websiteUrl: z.string().optional(),
      reason: z.string().trim().min(1),
    }).strict().parse(req.body)

    const id = idParam(req)
    await resolveTargetMerchantForAdmin(app.prisma, id)

    const { reason, ...data } = body
    const branch = await createBranchCore(
      app.prisma,
      { merchantId: id, actor: { type: 'ADMIN', id: req.user.sub, reason } },
      data,
      auditCtx(req),
    )
    return toAdminBranchShape(branch)
  })
```

- [ ] **Step 3: Add the delete route** (`src/api/admin/branches/routes.ts`, gated `merchant:manage-branches`). The route resolves the branch's merchant first (the core needs `merchantId`):

```ts
import { softDeleteBranchCore } from '../../merchant/branch/service'
import { resolveTargetMerchantForAdmin } from '../../merchant/shared'
...
  app.post(`${prefix}/:branchId/delete`, { preHandler: [requireAdminCapability('merchant:manage-branches')] }, async (req: any) => {
    const { branchId } = z.object({ branchId: z.string().min(1) }).parse(req.params)
    const { reason } = z.object({ reason: z.string().trim().min(1) }).strict().parse(req.body)

    const branch = await app.prisma.branch.findFirst({ where: { id: branchId, deletedAt: null }, select: { merchantId: true } })
    if (!branch) throw new AppError('BRANCH_NOT_FOUND')
    await resolveTargetMerchantForAdmin(app.prisma, branch.merchantId)

    return softDeleteBranchCore(
      app.prisma,
      { merchantId: branch.merchantId, actor: { type: 'ADMIN', id: req.user.sub, reason } },
      branchId,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '' },
    )
  })
```

(Confirm `AppError` is imported in `admin/branches/routes.ts`; add the import if absent.)

- [ ] **Step 4: Run + tsc + commit**

Run: `npx vitest run tests/api/admin/admin-branch-manage-routes.test.ts && npx tsc --noEmit | grep "error TS" | grep -v savings.service.test`
Expected: PASS; tsc clean. Commit `feat(admin): POST /admin/merchants/:id/branches + POST /admin/branches/:branchId/delete (SUPER_ADMIN, reason) (B2.4-core)`.

## Task C4: backend integration (real DB)

**Files:** Create `tests/api/admin/admin-branch-manage.integration.test.ts`

- [ ] **Step 1: Write the integration test** (prefix-scoped, bulk teardown, 60s timeout; FK order: auditLog + branchUser + branch + memberships + merchant + merchantAdmin + adminUser). Use a real seeded merchant + OWNER membership (mirror `admin-merchant-edit.integration.test.ts`'s `makeMerchant`). Seed a merchant with an existing main branch + a second active branch so deletes are testable. Assert:
  - **Admin create** via `createBranchCore({ actor: ADMIN })` with a real UK postcode: branch created, `locationConfidence:'POSTCODE_CENTROID'`, `isMainBranch` true only when first; audit row `event:'BRANCH_CREATED', entityType:'branch', entityId:branch.id, actorType:'ADMIN', reason` present; the **returned `toAdminBranchShape` has NO `redemptionPin`** (set a `redemptionPin` sentinel on a sibling branch and assert the serialized create response never contains it).
  - **Admin soft-delete** of a non-main active branch (when >=2 active): `deletedAt != null`, `isActive:false`, its `branchUser` rows flipped to `INACTIVE`, audit `BRANCH_DELETED entityType:'branch' actorType:'ADMIN' reason`. Atomicity: assert all three effects are present together.
  - **`BRANCH_IS_MAIN`**: delete the main branch -> rejects.
  - **`BRANCH_LAST_ACTIVE`**: an ACTIVE merchant with one active branch -> rejects.
  - **`BRANCH_NOT_FOUND`**: unknown branchId -> rejects.
  - **Merchant-path non-regression**: `createBranch(ownerAdminId, ...)` + `softDeleteBranch(ownerAdminId, ...)` still work and audit `actorType:'MERCHANT_ADMIN'` with `entityType:'branch'`.

- [ ] **Step 2: Run locally + commit** (`npx vitest run tests/api/admin/admin-branch-manage.integration.test.ts`; commit `test(admin): B2.4 branch create/delete integration (create/delete/guards/redaction/merchant-path)`).

## Task C5: FULL backend sweep (the M1 lesson)

- [ ] **Step 1:** `npm run test:unit && npx vitest run tests/api/merchant/ tests/api/admin/` (the seam touched shared merchant/branch code; a dir-scoped run is NOT enough; verify NEW failures only vs the known flaky discovery/seed baseline). Confirm `tsc --noEmit` clean (4 pre-existing savings baseline allowed).
- [ ] **Step 2:** Open the B2.4-core PR; present head SHA + scope + the FULL-sweep result + CI; pause for owner + Codex; SHA-bound merge.

---

# Milestone B2.4-web (PR 2)

## Task W1: capability mirror + NamedGateBanner codes + clients

**Files:** Modify `apps/admin-web/lib/auth/session.ts` (+ test), `apps/admin-web/features/review/NamedGateBanner.tsx`, `apps/admin-web/lib/api/branches.ts` (+ test).

- [ ] Mirror `merchant:manage-branches` in `session.ts` (NOT in `ALL_SLICE1_CAPS`); add the SUPER_ADMIN-only test block (mirror B2.2/B2.3).
- [ ] Map in `NamedGateBanner.tsx`: `POSTCODE_REQUIRED` ("A postcode is required to create a branch."), `POSTCODE_NOT_FOUND` ("That postcode could not be found. Check it and try again."), `GAZETTEER_UNAVAILABLE` ("Address lookup is temporarily unavailable. Try again shortly."), `BRANCH_IS_MAIN` ("The main branch cannot be deleted."), `BRANCH_LAST_ACTIVE` ("This is the merchant's last active branch and cannot be deleted.").
- [ ] `branchesApi.create(merchantId, input)` -> `POST /api/v1/admin/merchants/${merchantId}/branches` (body `{ name, addressLine1, addressLine2?, city, postcode, country?, phone?, email?, websiteUrl?, reason }`; parse the redacted branch shape leniently `z.object({ id: z.string() }).passthrough()`); `branchesApi.softDelete(branchId, reason)` -> `POST /api/v1/admin/branches/${branchId}/delete` (body `{ reason }`; parse `{ ok }`). Tests pin URL/method/body/auth + error `.code` propagation.

## Task W2: hooks

**Files:** Modify `apps/admin-web/lib/merchants/useMerchantActions.ts` (+ test).

- [ ] `useCreateBranch(merchantId)` + `useDeleteBranch(merchantId)`: each a mutation that invalidates `merchantDetailQueryKey(merchantId)` + `MERCHANTS_LIST_KEY` on success AND error (mirror `useEditBranch`). Tests pin both invalidations both arms.

## Task W3: AddBranchDialog

**Files:** Create `apps/admin-web/features/merchants/AddBranchDialog.tsx` (+ test).

- [ ] Props `{ merchantId, onSuccess, onCancel }`. Fields: `name`, `addressLine1`, `addressLine2?`, `city`, `postcode` (required), optional `phone`/`email`/`websiteUrl`, and a mandatory `reason`. `canSubmit = name+addressLine1+city+postcode all non-empty && reason non-empty && !isPending`. On submit call `useCreateBranch`; `onSuccess` on resolve. Errors via `NamedGateBanner` (the postcode/gazetteer + create errors). testids `add-branch-dialog`, `add-branch-name`, `-address1`, `-city`, `-postcode`, `-reason`, `-submit`, `-cancel`. Test: required-field + reason gating; submit body shape; NamedGateBanner on `POSTCODE_NOT_FOUND`.

## Task W4: DeleteBranchConfirm

**Files:** Create `apps/admin-web/features/merchants/DeleteBranchConfirm.tsx` (+ test).

- [ ] Props `{ branchId, branchName, merchantId, onSuccess, onCancel }`. **Discloses the cascade** ("Deleting this branch permanently removes it and deactivates its staff logins. This cannot be undone.") + a mandatory `reason`; `canSubmit = reason non-empty && !isPending`. On submit call `useDeleteBranch`; `onSuccess` on resolve. Errors via `NamedGateBanner` (`BRANCH_IS_MAIN`/`BRANCH_LAST_ACTIVE`). testids `delete-branch-confirm`, `delete-branch-reason`, `delete-branch-submit`, `delete-branch-cancel`. Test: cascade copy present; reason gating; NamedGateBanner on `BRANCH_LAST_ACTIVE`.

## Task W5: page affordances

**Files:** Modify `apps/admin-web/app/(app)/merchants/[id]/page.tsx` (+ test).

- [ ] `canManageBranches = can('merchant:manage-branches')`. Add an **"Add branch"** button on the Branches section header (only when `canManageBranches`) opening `AddBranchDialog`. On each `BranchCard`, add a **Delete** affordance (only when `canManageBranches` AND `!branch.isMainBranch`) opening `DeleteBranchConfirm`. Extend `OpenDialog` with `{ kind: 'add-branch' }` + `{ kind: 'delete-branch'; branch: BranchDetail }`. Mount both dialogs. Test: Add-branch button gating; Delete affordance hidden on the main branch + for an admin without the cap; dialogs mount/close.

## B2.4-web verification + PR

- [ ] admin-web `tsc` clean; full `jest` green; **`next build` in the main checkout** (worktree cannot); style sweep `grep -P '\x{2014}'` (brace form) + emoji clean. Open PR, present head SHA + scope + CI + checks, pause for owner + Codex, SHA-bound merge.

---

## Closed-scope exclusions (do NOT touch in B2.4)

- No schema change, no migration (the `Branch` model + `deletedAt` already exist; the cap is TS-only; `BRANCH_CREATED`/`BRANCH_DELETED` events already exist; `AuditLog.event` is a String column).
- No change to the confirm-location flow (M4) or the discovery list-vs-map asymmetry (PR #81); a new branch inherits POSTCODE_CENTROID behaviour.
- No acceptance of `latitude`/`longitude` on the admin create (D7).
- No branch PIN management, no branch edit-request lane, no photo work, no opening-hours/amenities work.
- No B2.5 (post-go-live SENSITIVE via B1 lane), B3 (submit-on-behalf), B4 (doc upload), B5 (voucher), Merchant Portal, photo-apply, PR3 `branchCount`, stash restore.
- No customer-app / customer-web changes.

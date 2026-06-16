# Option B B2.5: Admin Propose Post-Go-Live SENSITIVE Edit (via the B1 lane) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan ships as TWO separate PRs (B2.5-core, B2.5-web) in order; each milestone section is independently shippable and gets its own PR + SHA-bound merge.

**Goal:** Let a SUPER_ADMIN PROPOSE a change to a merchant's SENSITIVE text identity fields (`businessName` / `tradingName` / `description`) on the merchant's behalf, routing the proposal into the EXISTING B1 pending-edit / approval lane (NOT a direct admin mutation), so it is reviewed and applied/rejected by the already-shipped B1 applier.

**Architecture:** Extract a shared seam `createMerchantEditRequestCore(prisma, { merchantId, actor }, proposedChanges, ctx)` from the merchant self-serve `createMerchantEditRequest`. BOTH the merchant-JWT wrapper (actor MERCHANT_ADMIN) and a new admin route (actor ADMIN + reason) call it, creating a `MerchantPendingEdit` + `AdminApproval(MERCHANT_IDENTITY_EDIT)` atomically with actor-attributed audit. The proposer + reason ride in the existing `AdminApproval.comment` free-text field. The APPLY/REJECT side is the already-shipped B1 applier (`approveEdit`/`rejectEdit`, gated `approval:apply-edit`) and needs NO change. No schema or migration.

**Tech Stack:** Backend Fastify 5 + Prisma 7 (Neon Postgres 16), Vitest (mock `test:unit` + real-DB `*.integration.test.ts`). Admin-web Next 15 App Router + React 19 + React Query v5 + Tailwind 4, Jest + jsdom.

---

## Shared context (live code, inspected 2026-06-16)

- **Merchant SENSITIVE fields** `src/api/merchant/profile/service.ts:8`: `SENSITIVE_FIELDS = ['businessName', 'tradingName', 'logoUrl', 'bannerUrl', 'description']`. Direct edits of these are blocked (`SENSITIVE_FIELDS_REQUIRE_EDIT_REQUEST`).
- **`createMerchantEditRequest`** (`...service.ts:189-225`): keyed by `adminId` (`resolveAdminMerchant`); filters `proposedChanges` to `SENSITIVE_FIELDS` (`NO_SENSITIVE_FIELDS` if none); `PENDING_EDIT_EXISTS` if a PENDING edit already exists; creates `MerchantPendingEdit { merchantId, proposedChanges, status: 'PENDING' }` THEN `AdminApproval { type: 'MERCHANT_IDENTITY_EDIT', referenceId: pendingEdit.id, referenceType: 'MerchantPendingEdit', comment: 'Merchant ... requested ...' }` (TWO separate writes - NOT transactional); fire-and-forget `MERCHANT_EDIT_REQUEST_CREATED` audit.
- **B1 applier** `src/api/admin/approvals/editApplier.ts` (shipped #244): `approveEdit`/`rejectEdit`/`getEditReviewContext`, gated `approval:apply-edit`. `approveEdit` applies `pickAllowed(proposed, MERCHANT_SENSITIVE_FIELDS)` where `MERCHANT_SENSITIVE_FIELDS = ['businessName','tradingName','logoUrl','bannerUrl','description']`. **The apply side handles an admin-proposed pending edit identically to a merchant-proposed one** (the rows are identical; only the comment differs), so B2.5 changes NOTHING here.
- **Models** `prisma/schema.prisma`: `MerchantPendingEdit` (id, merchantId, proposedChanges, status, reviewedBy, reviewNote, createdAt, reviewedAt) and `AdminApproval` (type, referenceId, referenceType, status, adminUserId=who ACTIONED, **comment** free-text, claimedById). NEITHER records the proposer; `AdminApproval.comment` is free text (carries the admin proposer + reason - no schema needed).
- **Admin queue** `src/api/admin/approvals/service.ts`: `listApprovals` already surfaces `MERCHANT_IDENTITY_EDIT` (resolving the merchant via the PendingEdit). So an admin-proposed edit appears in the existing queue + B1 review screen with NO new read.
- **`getMerchantDetail`** `src/api/admin/merchants/service.ts:97+`: selects businessName/tradingName (NOT `description`); returns vat/company/category/categoryLocked/primaryCategoryId. B2.5 adds `description` (for the dialog prefill) + `hasPendingIdentityEdit` (to gate the UI affordance).
- **Route helpers** `src/api/admin/merchants/routes.ts`: `idParam(req)` + `auditCtx(req)` helpers; `resolveTargetMerchantForAdmin` imported (allows SUSPENDED). Merchant self-serve route `POST /merchant/profile/edit-request` (loose `z.record` body) calls `createMerchantEditRequest(req.user.sub, ...)`.
- **Capability** `src/api/admin/capability.ts`: no propose capability; `approval:apply-edit` (in `ALL_SLICE1_CAPS` = OPS+SUPER) gates the B1 APPLY. `writeAuditLogTx` (`src/api/shared/audit.ts`) supports actor + reason; `MERCHANT_EDIT_REQUEST_CREATED` already in the `AuditEvent` union; `AuditLog.event` is a String column.

## The key reframing

The B1 applier already reviews + applies + rejects pending edits regardless of proposer. So **B2.5 adds only the admin-propose CREATE path**; `getEditReviewContext`/`approveEdit`/`rejectEdit` are untouched. This is why no schema is needed: the admin proposer + reason live in the `AdminApproval.comment` + the actor-attributed audit row, and the existing queue/review/apply machinery handles the rest.

## Cross-check table (expectation -> live code reality -> B2.5 decision)

| # | Expectation | Live code reality | B2.5 decision |
|---|---|---|---|
| 1 | Admin proposes on-behalf | `createMerchantEditRequest(adminId, ...)` is merchant-self-serve only | Extract `createMerchantEditRequestCore({ merchantId, actor })`; merchant wrapper + new admin route delegate (no weaker path) |
| 2 | Route into the B1 lane | creates `MerchantPendingEdit` + `AdminApproval(MERCHANT_IDENTITY_EDIT)` | Reuse exactly; existing queue/review/apply work unchanged |
| 3 | Apply/reject preserved | B1 `approveEdit`/`rejectEdit` (gated `approval:apply-edit`) shipped #244 | NO change to the apply side; B2.5 is propose-only |
| 4 | Record the admin proposer | no proposer column; `AdminApproval.comment` free text | Encode "Admin-proposed. Reason: ..." in the comment + actor audit. NO schema |
| 5 | Atomic create | `pendingEdit.create` + `adminApproval.create` are two writes | Make the core's two creates + audit ONE `$transaction` |
| 6 | Capability gate | none for propose | NEW `merchant:propose-edit`, SUPER_ADMIN-only (distinct from `approval:apply-edit`) |
| 7 | Guard: one pending edit | `PENDING_EDIT_EXISTS` enforced | Preserve |
| 8 | UI knows when blocked | `getMerchantDetail` does not expose pending-edit state | Add `hasPendingIdentityEdit` to the detail read |
| 9 | Field scope | merchant SENSITIVE incl. logo/banner | B2.5 = TEXT only (businessName/tradingName/description); exclude logoUrl/bannerUrl (asset territory) |
| 10 | 4-eyes | B1 does not record the proposer | NOT enforced in B2.5 (would need a `proposedByAdminId` column = schema); deferred |

## File structure

**B2.5-core (PR 1, backend):**
- Modify: `src/api/admin/capability.ts` (add `merchant:propose-edit`, NOT in `ALL_SLICE1_CAPS`).
- Modify: `src/api/merchant/profile/service.ts` (`createMerchantEditRequestCore` seam; wrapper delegates; transactional + actor audit + actor-varying comment).
- Modify: `src/api/admin/merchants/service.ts` (`getMerchantDetail` gains `description` + `hasPendingIdentityEdit`).
- Modify: `src/api/admin/merchants/routes.ts` (`POST /:id/edit-request`).
- Test: new `tests/api/admin/admin-propose-edit-routes.test.ts`; new `tests/api/admin/admin-propose-edit.integration.test.ts` (incl. the B1 round-trip); extend `merchant-detail-routes.test.ts` + `merchant-detail.integration.test.ts` for the new read fields; extend the existing `createMerchantEditRequest` test for the new transaction + audit.

**B2.5-web (PR 2, admin-web):**
- Modify: `apps/admin-web/lib/auth/session.ts` (mirror `merchant:propose-edit`, NOT in `ALL_SLICE1_CAPS`) + its test.
- Modify: `apps/admin-web/lib/api/merchants.ts` (detail schema `description` + `hasPendingIdentityEdit`; `proposeEdit` client + type) + its test.
- Modify: `apps/admin-web/lib/merchants/useMerchantActions.ts` (`useProposeIdentityEdit`) + its test.
- Modify: `apps/admin-web/features/review/NamedGateBanner.tsx` (map `NO_SENSITIVE_FIELDS` + `PENDING_EDIT_EXISTS`).
- Create: `apps/admin-web/features/merchants/ProposeIdentityEditDialog.tsx` + test.
- Modify: `apps/admin-web/app/(app)/merchants/[id]/page.tsx` (propose affordance + pending-disabled state) + its test.

---

# Milestone B2.5-core (PR 1)

## Task C1: capability `merchant:propose-edit`

**Files:** Modify `src/api/admin/capability.ts`

- [ ] **Step 1: Add the cap (SUPER_ADMIN-only)**

In the `AdminCapability` union (after `merchant:manage-branches`):

```ts
  | 'merchant:manage-branches'
  // Option B B2.5: gates the admin PROPOSE of a merchant's SENSITIVE identity
  // fields on the merchant's behalf (routes into the B1 pending-edit lane; does
  // NOT directly mutate). NOT in ALL_SLICE1_CAPS -> SUPER_ADMIN-only.
  // Intentionally distinct from approval:apply-edit (the B1 APPLY side), so the
  // PROPOSE and APPLY capabilities are separable.
  | 'merchant:propose-edit'
```

Do NOT add it to `ALL_SLICE1_CAPS`. Leave `ROLE_CAPABILITIES`/`adminHasCapability` unchanged.

- [ ] **Step 2: tsc + commit** (`npx tsc --noEmit`; commit `feat(admin): add merchant:propose-edit capability (B2.5-core)`).

## Task C2: extract `createMerchantEditRequestCore` (transactional + actor audit)

**Files:** Modify `src/api/merchant/profile/service.ts`; Test `tests/api/merchant/profile.test.ts`

- [ ] **Step 1: Add the core + delegate the wrapper**

Replace the body of `createMerchantEditRequest` with a delegation, and add the core. The two creates + the audit move INSIDE one `$transaction`; the `AdminApproval.comment` varies by actor:

```ts
export async function createMerchantEditRequestCore(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  proposedChanges: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const sensitiveKeys = SENSITIVE_FIELDS.filter(k => k in proposedChanges)
  if (sensitiveKeys.length === 0) throw new AppError('NO_SENSITIVE_FIELDS')

  // App-layer enforcement - no DB unique constraint on merchantId.
  const existing = await prisma.merchantPendingEdit.findFirst({ where: { merchantId, status: 'PENDING' } })
  if (existing) throw new AppError('PENDING_EDIT_EXISTS')

  const filteredChanges: Record<string, unknown> = {}
  for (const k of sensitiveKeys) filteredChanges[k] = proposedChanges[k]

  // The proposer + reason ride in the AdminApproval.comment (no schema). The
  // merchant path keeps its original wording; the admin path records the actor.
  const comment = actor.type === 'ADMIN'
    ? `Admin-proposed identity field changes on the merchant's behalf. Reason: ${actor.reason ?? ''}`
    : `Merchant ${merchantId} requested identity field changes`

  return prisma.$transaction(async (tx) => {
    const pendingEdit = await tx.merchantPendingEdit.create({
      data: { merchantId, proposedChanges: filteredChanges as any, status: 'PENDING' },
    })
    await tx.adminApproval.create({
      data: {
        type: 'MERCHANT_IDENTITY_EDIT', status: 'PENDING',
        referenceId: pendingEdit.id, referenceType: 'MerchantPendingEdit', comment,
      },
    })
    await writeAuditLogTx(tx, {
      entityId: merchantId, entityType: 'merchant', event: 'MERCHANT_EDIT_REQUEST_CREATED',
      actorId: actor.id, actorType: actor.type, reason: actor.reason,
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    })
    return pendingEdit
  })
}

export async function createMerchantEditRequest(
  prisma: PrismaClient,
  adminId: string,
  proposedChanges: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  return createMerchantEditRequestCore(prisma, { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } }, proposedChanges, ctx)
}
```

(`writeAuditLogTx` is already imported; `EditActor` is imported from `../shared`. Note the behaviour delta: the audit is now AWAITED in-tx, so an audit-write failure rolls back the pending edit, matching the B2.1-B2.4 posture.)

- [ ] **Step 2: Update the existing test mock for the transaction**

In `tests/api/merchant/profile.test.ts`, the `createMerchantEditRequest` test mock needs `$transaction` (runs the cb with the same mock) since the creates moved inside a tx. Pin: the merchant path still creates the PendingEdit + AdminApproval and audits `actorType: 'MERCHANT_ADMIN'`.

- [ ] **Step 3: Run + tsc + commit**

Run: `eval "$(fnm env)"; fnm use 24; npx vitest run tests/api/merchant/profile.test.ts && npx tsc --noEmit | grep "error TS" | grep -v savings.service.test`
Expected: PASS; tsc clean. Commit `feat(merchant): createMerchantEditRequestCore seam + transactional actor-attributed audit (B2.5-core)`.

## Task C3: detail read additions (`description` + `hasPendingIdentityEdit`)

**Files:** Modify `src/api/admin/merchants/service.ts` (`getMerchantDetail`); Test `tests/api/admin/merchant-detail-routes.test.ts` + `merchant-detail.integration.test.ts`

- [ ] **Step 1: Extend the failing read assertions**

In `merchant-detail-routes.test.ts`, add `description: 'We sell coffee'` to the mock merchant + a `merchantPendingEdit: { findFirst: vi.fn().mockResolvedValue(null) }` to the prisma mock; assert `body.merchant.description === 'We sell coffee'` and `body.merchant.hasPendingIdentityEdit === false`. Add a second case: `merchantPendingEdit.findFirst` -> `{ id: 'pe-1' }` -> `hasPendingIdentityEdit === true`. In the integration test, seed a merchant with a `description` + assert both fields (and a pending-edit-present case).

- [ ] **Step 2: Add the fields**

In `getMerchantDetail`, add `description: true` to the merchant `select`, and after the `voucher.count`:

```ts
const pendingIdentityEdit = await prisma.merchantPendingEdit.findFirst({
  where: { merchantId, status: 'PENDING' }, select: { id: true },
})
```

In the return, add `description` (flows via `...rest`) and `hasPendingIdentityEdit: pendingIdentityEdit !== null` to the `merchant` object.

- [ ] **Step 3: Run + tsc + commit** (`npx vitest run tests/api/admin/merchant-detail-routes.test.ts`; commit `feat(admin): expose description + hasPendingIdentityEdit on merchant detail (B2.5-core)`).

## Task C4: admin propose route

**Files:** Modify `src/api/admin/merchants/routes.ts`; Test new `tests/api/admin/admin-propose-edit-routes.test.ts`

- [ ] **Step 1: Write the failing route tests**

Cases (mock harness; `$transaction` runs the cb with the same mock; `merchantPendingEdit.findFirst` -> null by default, `.create` -> `{ id: 'pe-1' }`, `adminApproval.create` -> `{}`, `merchant.findUnique` -> `{ id, status }` for `resolveTargetMerchantForAdmin`):
- 401 unauth; 403 OPERATIONS + SUPPORT (lack `merchant:propose-edit`); 200 SUPER_ADMIN with `{ businessName, reason }` -> `{ pendingEditId: 'pe-1' }`, `adminApproval.create` called with `comment` containing "Admin-proposed" + the reason, audit `actorType: 'ADMIN'`; 400 missing `reason`; 400 `NO_SENSITIVE_FIELDS` (only `reason` sent); 400 strict-body reject (`logoUrl` key); 409 `PENDING_EDIT_EXISTS` (`findFirst` -> `{ id: 'pe-0' }`).

- [ ] **Step 2: Add the route**

```ts
import { ..., createMerchantEditRequestCore } from '../../merchant/profile/service'
...
  app.post(`${prefix}/:id/edit-request`, { preHandler: [requireAdminCapability('merchant:propose-edit')] }, async (req: any) => {
    const body = z
      .object({
        businessName: z.string().trim().min(1).optional(),
        tradingName: z.string().trim().min(1).optional(),
        description: z.string().trim().min(1).optional(),
        reason: z.string().trim().min(1),
      })
      .strict()
      .parse(req.body)

    const id = idParam(req)
    await resolveTargetMerchantForAdmin(app.prisma, id)

    const { reason, ...proposed } = body
    const pendingEdit = await createMerchantEditRequestCore(
      app.prisma,
      { merchantId: id, actor: { type: 'ADMIN', id: req.user.sub, reason } },
      proposed,
      auditCtx(req),
    )
    return { pendingEditId: pendingEdit.id }
  })
```

(The STRICT body accepts ONLY the 3 text fields + reason; `logoUrl`/`bannerUrl` 400 before the service. If all 3 fields are omitted, `proposed` is `{}` -> the core throws `NO_SENSITIVE_FIELDS`.)

- [ ] **Step 3: Run + tsc + commit** (`npx vitest run tests/api/admin/admin-propose-edit-routes.test.ts`; commit `feat(admin): POST /admin/merchants/:id/edit-request (SUPER_ADMIN propose, reason) (B2.5-core)`).

## Task C5: integration (real DB, incl. the B1 round-trip)

**Files:** Create `tests/api/admin/admin-propose-edit.integration.test.ts`

- [ ] **Step 1: Write the integration test** (prefix-scoped, bulk teardown, 60s timeout; FK order: auditLog + adminApproval + merchantPendingEdit + memberships + merchant + merchantAdmin + adminUser). Seed a merchant + OWNER membership (mirror `admin-merchant-edit.integration.test.ts`'s `makeMerchant`). Assert:
  - **Admin propose** via `createMerchantEditRequestCore({ actor: ADMIN, reason })` with `{ businessName: 'New Name' }`: a `MerchantPendingEdit` (PENDING, proposedChanges has businessName) + an `AdminApproval(MERCHANT_IDENTITY_EDIT, comment ~ "Admin-proposed... Reason: ...")` both exist (atomic); audit `MERCHANT_EDIT_REQUEST_CREATED` actorType `ADMIN` + reason.
  - **PENDING_EDIT_EXISTS:** a second propose on the same merchant rejects.
  - **NO_SENSITIVE_FIELDS:** propose with `{}` rejects.
  - **End-to-end round-trip (the headline pin):** after the admin propose, call the B1 `approveEdit(prisma, redis?, approvalId, adminId, ...)` (read its exact signature from `editApplier.ts`) and assert the merchant's `businessName` is now `'New Name'` and the approval is `APPROVED` - proving the admin-propose -> B1-apply loop works end-to-end.
  - **Merchant-path non-regression:** `createMerchantEditRequest(ownerAdminId, { tradingName: 'X' }, ctx)` still creates the pending edit + audits `actorType: 'MERCHANT_ADMIN'`.

- [ ] **Step 2: Run locally + commit** (`npx vitest run tests/api/admin/admin-propose-edit.integration.test.ts`; commit `test(admin): B2.5 propose-edit integration (atomic create + B1 round-trip + merchant-path)`).

## Task C6: FULL backend sweep (the M1 lesson)

- [ ] `npm run test:unit && npx vitest run tests/api/merchant/ tests/api/admin/` (the seam touched shared `profile/service.ts`; verify NEW failures only vs the known flaky discovery/seed baseline). `tsc --noEmit` clean. Open the B2.5-core PR; present head SHA + scope + the FULL-sweep result + CI; pause for owner + Codex; SHA-bound merge.

---

# Milestone B2.5-web (PR 2)

## Task W1: capability mirror + NamedGateBanner + client + detail schema

**Files:** Modify `lib/auth/session.ts` (+ test), `features/review/NamedGateBanner.tsx`, `lib/api/merchants.ts` (+ test).

- [ ] Mirror `merchant:propose-edit` in `session.ts` (NOT in `ALL_SLICE1_CAPS`); add the SUPER_ADMIN-only test block.
- [ ] Map in `NamedGateBanner.tsx`: `NO_SENSITIVE_FIELDS` ("Change at least one identity field to propose an edit.") + `PENDING_EDIT_EXISTS` ("This merchant already has an identity edit awaiting review.").
- [ ] In `lib/api/merchants.ts`: add `description: z.string().nullable()` + `hasPendingIdentityEdit: z.boolean()` to `merchantDetailSchema.merchant`; add `ProposeIdentityEditInput { businessName?: string; tradingName?: string; description?: string; reason: string }` + `merchantsApi.proposeEdit(id, input)` -> `POST /api/v1/admin/merchants/${id}/edit-request` (parse `{ pendingEditId }` leniently). Update the `getById` fixtures in `merchants.test.ts` + the page-test fixture. Pin the client URL/method/body + error `.code`.

## Task W2: hook

**Files:** Modify `lib/merchants/useMerchantActions.ts` (+ test).

- [ ] `useProposeIdentityEdit(merchantId)` -> mutation calling `merchantsApi.proposeEdit`; invalidate `merchantDetailQueryKey(merchantId)` + `MERCHANTS_LIST_KEY` on success AND error (so `hasPendingIdentityEdit` re-reads). Pin both arms.

## Task W3: ProposeIdentityEditDialog

**Files:** Create `features/merchants/ProposeIdentityEditDialog.tsx` (+ test).

- [ ] Props `{ merchantId, current: { businessName, tradingName, description }, onSuccess, onCancel }`. Three text fields prefilled from `current` (tradingName/description may be null -> empty) + a mandatory reason. `canSubmit = atLeastOneChanged && reason.trim() non-empty && !isPending`, where `atLeastOneChanged` compares each field to its `current` value (only changed fields are sent). Submit body = only the CHANGED fields + reason. Copy makes clear this PROPOSES a change for review (not an immediate edit): "This proposes a change for admin review. It is not applied until approved." Errors via `NamedGateBanner` (`NO_SENSITIVE_FIELDS`/`PENDING_EDIT_EXISTS`). testids `propose-identity-dialog`, `-business-name`, `-trading-name`, `-description`, `-reason`, `-submit`, `-cancel`. Test: changed-field detection + reason gating; submit body contains ONLY changed fields + reason; `NamedGateBanner` on `PENDING_EDIT_EXISTS`; the "for review, not applied" copy present.

## Task W4: page affordance + pending-disabled state

**Files:** Modify `app/(app)/merchants/[id]/page.tsx` (+ test).

- [ ] `canProposeEdit = can('merchant:propose-edit')`. Add a "Propose identity change" affordance near the merchant header (where businessName/tradingName show), shown ONLY when `canProposeEdit`. When `data.merchant.hasPendingIdentityEdit` is true, the affordance is disabled with a note ("An identity edit is awaiting review.") so the admin cannot stack proposals (mirrors `PENDING_EDIT_EXISTS`). Extend `OpenDialog` with `{ kind: 'propose-identity' }`; mount `ProposeIdentityEditDialog` with `current` from the detail. Test: affordance shown only with the cap; disabled+note when `hasPendingIdentityEdit`; dialog mounts/closes.

## B2.5-web verification + PR

- [ ] admin-web `tsc` clean; full `jest` green; **`next build` in the main checkout**; style sweep `grep -P '\x{2014}'` (brace form) + emoji clean. Open PR, present head SHA + scope + CI + checks, pause for owner + Codex, SHA-bound merge.

---

## Risks (explicit)

1. **Shared merchant-profile blast radius.** `createMerchantEditRequest` is merchant-portal code; the seam refactor must keep the merchant path equivalent (still returns the pending edit, still creates the PendingEdit + AdminApproval). **Run a FULL backend sweep** (the M1 lesson), not a dir-scoped run.
2. **Atomicity.** The PendingEdit + AdminApproval creation is non-transactional today; the core makes it atomic. A half-written pending edit (no approval) or orphan approval (no pending edit) would corrupt the review queue. The audit is also awaited in-tx now (an audit-write failure rolls back the proposal - intentional, matches B2.1-B2.4).
3. **One pending-edit slot shared by merchant + admin.** `PENDING_EDIT_EXISTS` is enforced per merchant, so an admin proposal blocks a merchant proposal and vice versa. The detail read (`hasPendingIdentityEdit`) surfaces this so the UI disables the affordance; the route still enforces the guard server-side.
4. **No 4-eyes enforcement.** B1 does not record the proposer, so a SUPER_ADMIN holding both `merchant:propose-edit` and `approval:apply-edit` could propose AND approve the same edit. Structured enforcement (bar proposer == approver) needs a `proposedByAdminId` column (schema) and is DEFERRED. The audit trail still records who proposed (ADMIN actor) and who applied (B1 `adminUserId`).
5. **logo/banner exclusion.** B2.5 proposes TEXT identity fields only; `logoUrl`/`bannerUrl` are excluded (asset/photo territory). The route's STRICT body 400s on those keys, so they cannot leak into a B2.5 proposal.

## Closed-scope exclusions (do NOT touch in B2.5)

- No schema change, no migration (the proposer + reason ride in `AdminApproval.comment`; `MerchantPendingEdit`/`AdminApproval` exist; `MERCHANT_EDIT_REQUEST_CREATED` is already a String-column event).
- No change to the B1 applier (`approveEdit`/`rejectEdit`/`getEditReviewContext`) - the APPLY side is shipped and untouched.
- No `logoUrl`/`bannerUrl` propose (asset territory); no 4-eyes column.
- No BRANCH sensitive propose (deferred to a B2.5b follow-up unless explicitly bundled later).
- No notification emit (the admin queue is the review surface).
- No B3 (submit-on-behalf), B4 (doc upload), B5 (voucher), Merchant Portal, B1 photo-apply, PR3 `branchCount`, stash restore, §B24-TIMELINE.
- No customer-app / customer-web changes.

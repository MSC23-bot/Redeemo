# Option B B5.1 - Admin RMV co-build on behalf

Status: PLAN (not implemented). Tier 2/3 (Option B admin-on-behalf seam slice).
Branch: `feature/admin-b5-1-rmv-cobuild`.
Date: 2026-06-16.
Author: planning + live-code cross-check pass (grill-me interview resolved the decision tree).

This plan covers B5.1 ONLY. B5.2 (custom RCV voucher CRUD) is explicitly deferred and
carries an open product/legal decision (see "B5.2 product/legal anchor" at the end). No
schema/migration. Plan doc only; no code, no PR until separately approved.

---

## 1. What B5.1 is

Let an OPERATIONS admin co-build a stuck merchant's two mandatory RMV vouchers DURING
ONBOARDING: edit the template-allowed fields, then submit each RMV for review, ON THE
MERCHANT'S BEHALF, via the same service path the merchant runs (Option B "no weaker
path"). RMV submission moves the voucher DRAFT to PENDING_APPROVAL, which is what
`rmv_configured` (the go-live checklist gate) counts. Nothing goes live: the actioner
go-live approval (`approval:action`) is the separation-of-duties backstop that flips
submitted RMVs to ACTIVE.

This is an onboarding-completion helper, the voucher analogue of B3 (admin
submit-for-approval on behalf). It does NOT add or weaken any gate.

### Resolved decision tree (grill-me outcomes, locked by owner)

| # | Decision | Resolution |
|---|---|---|
| Q1 | Scope / sequencing | RMV co-build first. Custom RCV CRUD becomes B5.2. |
| Q2 | Capability tier | OPERATIONS. New `merchant:manage-vouchers` in `ALL_SLICE1_CAPS`; read via existing `merchant:read`. |
| Q3 | Edit window | DRAFT-only (onboarding phase). PENDING_APPROVAL/ACTIVE RMVs stay locked by the existing `VOUCHER_NOT_EDITABLE` gate. No live-RMV correction. |
| Q4 | Backend shape / split | Minimal: extract ONLY the 2 RMV cores; leave the 4 custom-voucher fns untouched. Audit upgraded in-tx actor-attributed (D2). Two PRs: B5.1-core then B5.1-web. |
| Q5 | Submit gate | Match the merchant path exactly: DRAFT-only, NO allowedFields-completeness gate. UI may advise but must not block. |
| Q6 | Owner notify | NONE in B5.1 (audit-only). B3 submit-on-behalf remains the owner-facing application-submit notice. B5.2/custom carries a merchant-acceptance product/legal decision. |

---

## 2. Inspected surface (live code, this pass)

Backend:
- `src/api/merchant/voucher/service.ts` - `listRmvVouchers` (L387), `updateRmvVoucher` (L396), `submitRmvVoucher` (L428), `provisionRmvVouchers` (L447), `handleCategoryChange` (L490, the in-voucher-domain EditActor + in-tx audit precedent). Imports `writeAuditLog`, `writeAuditLogTx`, `ActorType`, `resolveAdminMerchant`.
- `src/api/merchant/voucher/routes.ts` - merchant RMV routes: `GET /api/v1/merchant/vouchers/rmv`, `PATCH .../rmv/:id` (body `z.record(z.string(), z.unknown())`), `POST .../rmv/:id/submit`.
- `src/api/merchant/shared.ts` - `EditActor = { type: 'MERCHANT_ADMIN' | 'ADMIN'; id: string; reason? }` (L12); `resolveAdminMerchant` (L14, own merchant via membership, refuses SUSPENDED); `resolveTargetMerchantForAdmin` (L43, by-id, ALLOWS SUSPENDED, returns `{ merchantId, status }`).
- `src/api/shared/audit.ts` - `writeAuditLogTx(tx, AuditActorContext)` (L173, in-tx, actor-attributed); `ActorType` includes `ADMIN` + `MERCHANT_ADMIN`. `RMV_UPDATED` / `RMV_SUBMITTED` / `RMV_PROVISIONED` / `CATEGORY_CHANGED` ALREADY in the `AuditEvent` union (L57-60). `event` is a String column, so no migration regardless.
- `src/api/admin/capability.ts` - `AdminCapability` union + `ALL_SLICE1_CAPS` (L77) + `adminHasCapability` (SUPER_ADMIN superuser short-circuit) + `requireAdminCapability` preHandler. `merchant:submit` (B3) is in `ALL_SLICE1_CAPS` = the OPERATIONS precedent to follow.
- `src/api/admin/merchants/routes.ts` - the admin-on-behalf route precedents (B2.1 profile, B2.2 identity, B2.3 category, B2.4 branch, B2.5 propose, B3 submit, B4 documents). Helpers `idParam(req)`, `auditCtx(req)`. Every admin route: `requireAdminCapability(cap)` preHandler, STRICT Zod body with `reason: z.string().trim().min(1)`, `await resolveTargetMerchantForAdmin(...)`, then call the shared core with `actor: { type: 'ADMIN', id: req.user.sub, reason }`.
- `src/api/shared/errors.ts` - `RMV_NOT_FOUND` (404), `RMV_FIELD_NOT_ALLOWED` (400), `VOUCHER_NOT_EDITABLE` (409), `VOUCHER_NOT_SUBMITTABLE` (409), `MERCHANT_NOT_FOUND` (404), `MERCHANT_SUSPENDED` (403). All already exist; B5.1 adds NO new error codes.
- `src/api/merchant/onboarding/service.ts` (L31-43) + `src/api/admin/merchants/service.ts` (L158-184) - `rmv_configured = count(isRmv, status in [PENDING_APPROVAL, ACTIVE]) >= 2`. Confirms why RMV SUBMIT (DRAFT to PENDING_APPROVAL) is the onboarding-critical action.
- `src/api/admin/approvals/service.ts` (L520-523) - go-live activates submitted RMVs (`updateMany where isRmv, status in [PENDING_APPROVAL, ACTIVE] -> status ACTIVE, approvalStatus APPROVED`). The separation-of-duties backstop.

Admin-web:
- `apps/admin-web/lib/auth/session.ts` - capability mirror: `AdminCapability` union + `ALL_SLICE1_CAPS` (L72) + `OPERATIONS` role grant.
- `apps/admin-web/lib/api/documents.ts` + `lib/merchants/useMerchantDocuments.ts` + `features/merchants/MerchantDocumentsCard.tsx` + `UploadDocumentDialog.tsx` + `DeleteDocumentConfirm.tsx` - the closest B4 precedent (dedicated read endpoint NOT in detail; card + reason-required dialogs; invalidate on success AND error).
- `apps/admin-web/features/review/NamedGateBanner.tsx` - `CODE_MESSAGES` map; add the 4 RMV codes here.
- `apps/admin-web/app/(app)/merchants/[id]/page.tsx` (622 lines) - card mounts + `can(cap)` gating (`canManageDocuments = can('merchant:manage-documents')`, `<MerchantDocumentsCard merchantId canManage={...} />` at L503).
- `apps/admin-web/lib/api/client.ts` - `ApiError` with `.code` / `.body`.

Net-new confirmation: no existing admin voucher routes, cores, capability, or tests (grep clean). B5.1 is greenfield on the admin side.

Models (read-only, NO change):
- `Voucher` (RMV rows: `isRmv true`, `isMandatory true`, `rmvTemplateId`, `type/title/description/estimatedSaving` from template, `status DRAFT`, `merchantFields {}` Json).
- `RmvTemplate` (`allowedFields` Json; seeded value `['terms', 'expiryDate']` in `prisma/seed-data/referencePhases.ts`).

---

## 3. Cross-check table: resolved expectation -> live reality -> B5.1 decision

| Resolved expectation | Live-code reality | B5.1 decision |
|---|---|---|
| Extract `updateRmvVoucherCore` + `submitRmvVoucherCore` D4 seams | The 2 fns use `(prisma, adminId, voucherId, ...)` + `resolveAdminMerchant` + fire-and-forget `writeAuditLog`. The voucher-domain seam precedent `handleCategoryChange({ merchantId, actor }, ...)` already exists in the SAME file. | Extract the 2 cores with `{ merchantId, actor }`; merchant wrappers keep their signature and delegate as `MERCHANT_ADMIN`. Mirror `handleCategoryChange`. |
| `merchant:manage-vouchers` in `ALL_SLICE1_CAPS` (OPERATIONS) | `merchant:submit` (B3, an OPERATIONS lifecycle helper) is already in `ALL_SLICE1_CAPS`. B2.2/B2.3/B4 (higher bar) are NOT. | Add `merchant:manage-vouchers` to the union AND `ALL_SLICE1_CAPS`, backend + admin-web mirror. Read uses existing `merchant:read`. |
| DRAFT-only edit/submit; no live edit | `updateRmvVoucher`/`submitRmvVoucher` both gate `status !== 'DRAFT'` (`VOUCHER_NOT_EDITABLE` / `VOUCHER_NOT_SUBMITTABLE`). | Reuse verbatim via the cores. No new gate; no admin bypass. |
| No allowedFields-completeness gate on submit | `submitRmvVoucher` has NO completeness check (only DRAFT gate). | Reuse verbatim. UI advisory only. |
| Edit writes only allowed fields | `updateRmvVoucher` validates `proposedFields` keys against `rmvTemplate.allowedFields` (`RMV_FIELD_NOT_ALLOWED`), merges into `merchantFields` (Json); top-level `terms`/`expiryDate` columns untouched. | Core preserves this exactly. Admin form reads `merchantFields` + renders inputs per `allowedFields`. |
| Cross-merchant safety | `findFirst({ where: { id: voucherId, merchantId, isRmv: true } })` scopes the voucher to the merchant. | Core keeps the merchantId-scoped findFirst. Admin `:id` (merchant) + `:voucherId` (voucher belonging to that merchant) -> a mismatched voucher returns `RMV_NOT_FOUND` (no cross-merchant edit). |
| In-tx actor-attributed audit (D2) | RMV audit is fire-and-forget `writeAuditLog` (no actor). `handleCategoryChange` already does in-tx `writeAuditLogTx` with actor + before/after. | Wrap `voucher.update` + `writeAuditLogTx` in `$transaction`. Merchant path now carries `actorType: 'MERCHANT_ADMIN'`. |
| Owner notify | B3 reuses `MERCHANT_VERIFICATION_UPDATE`; `VOUCHER_APPROVAL_UPDATE` exists too. | NO notify in B5.1. Schema-free either way; we simply do not fire one. |
| No schema/migration | `RMV_UPDATED`/`RMV_SUBMITTED` events + `merchantFields` Json + all error codes already exist. | Confirmed: zero schema/migration. |
| Dedicated admin read endpoint | B4 chose a dedicated `GET .../documents` (NOT folded into `getMerchantDetail`). | `GET /api/v1/admin/merchants/:id/vouchers/rmv` gated `merchant:read`. |
| Admin form fields | Seeded `allowedFields` = `['terms', 'expiryDate']`. | Render dynamically from `allowedFields` (do not hardcode); `terms` -> textarea, `expiryDate` -> date input as the known shapes, with a generic text fallback for any other allowed key. |

---

## 4. Contradictions / corrections surfaced during inspection

1. EditActor type vs inline shape. `handleCategoryChange` uses an INLINE `{ type: ActorType; id: string; reason? }` (ActorType is the wide audit type), not the canonical `EditActor` (which narrows `type` to `'MERCHANT_ADMIN' | 'ADMIN'`). Decision: the new cores use the canonical `EditActor` from `merchant/shared.ts` (better typed; only those two actors are valid). This is a tightening, not a divergence; the audit call still reads `actor.type` / `actor.id` / `actor.reason` identically.

2. Admin PATCH body shape vs the merchant bare-record body. The merchant PATCH body is a bare `z.record(z.string(), z.unknown())`. The admin PATCH must ALSO carry a required `reason`. Folding `reason` into the same record is fragile (a future template could in theory name an allowedField `reason`). Decision: nested STRICT body `{ fields: z.record(z.string(), z.unknown()), reason: z.string().trim().min(1) }`. The core receives `body.fields` as `proposedFields` (the same record the merchant route passes), and the route threads `body.reason` into the actor. This is a deliberate, documented payload divergence from the merchant route, justified by the reason requirement and key-collision safety. (Reported tradeoff per the planning brief.)

3. Submit error code. RMV submit uses `VOUCHER_NOT_SUBMITTABLE`, NOT a distinct RMV submit code. The admin route and the web banner map `VOUCHER_NOT_SUBMITTABLE` accordingly. No new code.

4. `$transaction` introduction breaks the existing mock-based merchant RMV test. `voucher-rmv.test.ts` mocks `voucher.update` directly with no `$transaction` mock and does not assert actor audit. Moving the audit in-tx requires `$transaction`, so the test MUST be updated to mock `$transaction` (like the category test) and assert the `MERCHANT_ADMIN` actor-attributed audit. This is the load-bearing merchant-path non-regression pin (Section 7).

---

## 5. B5.1-core backend plan

### 5.1 Seam extraction (`src/api/merchant/voucher/service.ts`)

Extract two cores; keep the two merchant wrappers thin and signature-compatible.

```
// New core (shape mirrors handleCategoryChange).
export async function updateRmvVoucherCore(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  voucherId: string,
  proposedFields: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string },
) {
  const voucher = await prisma.voucher.findFirst({
    where: { id: voucherId, merchantId, isRmv: true },
    include: { rmvTemplate: true },
  })
  if (!voucher) throw new AppError('RMV_NOT_FOUND')
  if (voucher.status !== 'DRAFT') throw new AppError('VOUCHER_NOT_EDITABLE')

  const allowedFields = Array.isArray(voucher.rmvTemplate?.allowedFields)
    ? (voucher.rmvTemplate.allowedFields as string[]) : []
  const disallowed = Object.keys(proposedFields).filter(k => !allowedFields.includes(k))
  if (disallowed.length > 0) throw new AppError('RMV_FIELD_NOT_ALLOWED')

  const currentFields = (voucher.merchantFields as Record<string, unknown>) ?? {}
  const merged = { ...currentFields, ...proposedFields }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.voucher.update({
      where: { id: voucherId }, data: { merchantFields: merged as any },
    })
    await writeAuditLogTx(tx, {
      entityId: merchantId, entityType: 'merchant', event: 'RMV_UPDATED',
      actorId: actor.id, actorType: actor.type, reason: actor.reason,
      before: { merchantFields: currentFields }, after: { merchantFields: merged },
      metadata: { voucherId }, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    })
    return updated
  })
}

// Merchant wrapper - unchanged signature; delegates as MERCHANT_ADMIN.
export async function updateRmvVoucher(prisma, adminId, voucherId, proposedFields, ctx) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  return updateRmvVoucherCore(prisma, { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } }, voucherId, proposedFields, ctx)
}
```

`submitRmvVoucherCore` mirrors the same structure:
- read `findFirst({ id: voucherId, merchantId, isRmv: true })` -> `RMV_NOT_FOUND`;
- `status !== 'DRAFT'` -> `VOUCHER_NOT_SUBMITTABLE`;
- `$transaction`: `voucher.update({ data: { status: 'PENDING_APPROVAL', publishedAt: new Date() } })` + `writeAuditLogTx({ event: 'RMV_SUBMITTED', before: { status: 'DRAFT' }, after: { status: 'PENDING_APPROVAL' }, metadata: { voucherId }, actor... })`;
- merchant wrapper delegates as `MERCHANT_ADMIN`.

Invariants preserved verbatim: DRAFT-only gate, allowedFields KEY validation, `merchantFields` merge semantics, `publishedAt` stamp on submit, NO completeness gate, NO value-type validation added (symmetric with the merchant path). `provisionRmvVouchers`, `listRmvVouchers`, and all 4 custom-voucher fns are UNTOUCHED.

### 5.2 Admin read service (`src/api/admin/merchants/service.ts` or a small new module)

`listAdminRmvVouchers(prisma, merchantId)`: `voucher.findMany({ where: { merchantId, isRmv: true }, include: { rmvTemplate: true }, orderBy: { createdAt: 'asc' } })` mapped to a redacted per-RMV shape:
`{ id, code, title, type, estimatedSaving (Number-coerced), status, approvalStatus, merchantFields, allowedFields }`.
Vouchers carry no secrets (the PIN lives on `Branch`), so this is a redaction of convenience. `estimatedSaving` is a Prisma `Decimal`; coerce to `Number` (the documented Decimal-serialization rule).

### 5.3 Admin routes (`src/api/admin/merchants/routes.ts`)

Append three routes inside `adminMerchantRoutes`, following the B2.x/B3/B4 idiom (`idParam`, `auditCtx`, `requireAdminCapability`, STRICT body, `resolveTargetMerchantForAdmin`):

```
// Read (merchant:read). OPERATIONS can VIEW, consistent with documents/M4.
app.get(`${prefix}/:id/vouchers/rmv`, { preHandler: [requireAdminCapability('merchant:read')] }, async (req) => {
  const id = idParam(req)
  await resolveTargetMerchantForAdmin(app.prisma, id)
  return listAdminRmvVouchers(app.prisma, id)
})

// Edit (merchant:manage-vouchers). Nested { fields, reason } body (Section 4 #2).
app.patch(`${prefix}/:id/vouchers/:voucherId/rmv`, { preHandler: [requireAdminCapability('merchant:manage-vouchers')] }, async (req) => {
  const { id, voucherId } = z.object({ id: z.string().min(1), voucherId: z.string().min(1) }).parse(req.params)
  const body = z.object({ fields: z.record(z.string(), z.unknown()), reason: z.string().trim().min(1) }).strict().parse(req.body)
  await resolveTargetMerchantForAdmin(app.prisma, id)
  return updateRmvVoucherCore(app.prisma, { merchantId: id, actor: { type: 'ADMIN', id: req.user.sub, reason: body.reason } }, voucherId, body.fields, auditCtx(req))
})

// Submit (merchant:manage-vouchers).
app.post(`${prefix}/:id/vouchers/:voucherId/rmv/submit`, { preHandler: [requireAdminCapability('merchant:manage-vouchers')] }, async (req) => {
  const { id, voucherId } = z.object({ id: z.string().min(1), voucherId: z.string().min(1) }).parse(req.params)
  const { reason } = z.object({ reason: z.string().trim().min(1) }).strict().parse(req.body)
  await resolveTargetMerchantForAdmin(app.prisma, id)
  return submitRmvVoucherCore(app.prisma, { merchantId: id, actor: { type: 'ADMIN', id: req.user.sub, reason } }, voucherId, auditCtx(req))
})
```

Route-naming tradeoff (reported): `:id/vouchers/:voucherId/rmv` keeps the RMV namespace explicit and leaves room for B5.2 custom routes under `:id/vouchers/...` without collision. Alternative `:id/rmv/:voucherId` was rejected as less future-proof against the custom-voucher namespace.

`resolveTargetMerchantForAdmin` allows SUSPENDED (consistent with all B2.x admin routes). For RMV co-build this is largely moot: a SUSPENDED merchant's RMVs are ACTIVE (post-go-live), so the DRAFT-only gate would refuse the edit/submit anyway. The resolver behaviour is unchanged either way.

### 5.4 Imports / wiring
- `routes.ts`: import `updateRmvVoucherCore`, `submitRmvVoucherCore` from `../../merchant/voucher/service`, and `listAdminRmvVouchers` from `./service` (or the new module).
- No app.ts change (no new plugin/dep). No multipart.

---

## 6. Capability / auth model

- Backend `src/api/admin/capability.ts`: add `| 'merchant:manage-vouchers'` to the `AdminCapability` union AND to `ALL_SLICE1_CAPS` (so OPERATIONS holds it). Doc-comment it as the B5.1 OPERATIONS onboarding-helper cap (peer of `merchant:submit`), distinct from the SUPER_ADMIN-only B2.2/B2.3/B4 caps, with a forward note that B5.2 custom-voucher CRUD may warrant a SEPARATE higher-bar capability/tier (creating public custom offers is a higher product/legal bar).
- Read stays on the existing `merchant:read`.
- Admin-web mirror `apps/admin-web/lib/auth/session.ts`: add the same union member AND add it to the mirror `ALL_SLICE1_CAPS` (L72), with the "keep aligned with backend" comment. SUPER_ADMIN holds it via the superuser short-circuit (no map upkeep).

---

## 7. Audit / reason model + merchant-path non-regression pins

- Events: reuse `RMV_UPDATED` + `RMV_SUBMITTED` (already in the union). entityId = merchantId, entityType `'merchant'`. NO new event, NO migration.
- Reason: required (non-empty, trimmed) on BOTH admin routes; lands on `reason` of the audit row. Absent on the merchant path (actor `MERCHANT_ADMIN`, no reason), matching B2.x/B3.
- before/after: `RMV_UPDATED` -> `before: { merchantFields }`, `after: { merchantFields }`. `RMV_SUBMITTED` -> `before: { status: 'DRAFT' }`, `after: { status: 'PENDING_APPROVAL' }`. metadata `{ voucherId }`.
- Atomicity: audit commits/rolls back with the voucher mutation (in-tx), the B3/B2.3 D2 precedent.

Merchant-path non-regression pins (REQUIRED, the audit upgrade changes merchant-path behaviour):
1. `tests/api/merchant/voucher-rmv.test.ts` MUST be updated: mock `app.prisma.$transaction` (`mockImplementation(async (fn) => fn(tx))` with a `tx` exposing `voucher.update` + `auditLog.create`), assert the PATCH still writes `merchantFields` with the merged value, assert the submit still flips to PENDING_APPROVAL, AND assert the audit row now carries `actorType: 'MERCHANT_ADMIN'` + `actorId` (the merchant admin id) + NO reason.
2. Add a positive pin that the merchant PATCH still rejects disallowed fields (`RMV_FIELD_NOT_ALLOWED`) unchanged.
3. Any other suite that exercises the merchant RMV update/submit indirectly (search the wider voucher suites) must keep passing after the `$transaction` wrap; update mocks where they assert on `voucher.update` being called outside a transaction.

---

## 8. Validation / gate preservation plan

No gate is added or weakened. Explicitly preserved:
- DRAFT-only edit (`VOUCHER_NOT_EDITABLE`) and DRAFT-only submit (`VOUCHER_NOT_SUBMITTABLE`).
- allowedFields KEY validation (`RMV_FIELD_NOT_ALLOWED`); values remain unvalidated by type (symmetric with the merchant path; flagged below as a pre-existing symmetric follow-up, NOT fixed here).
- `merchantFields` merge semantics (top-level columns untouched).
- merchantId-scoped `findFirst` (cross-merchant safety; mismatched voucher -> `RMV_NOT_FOUND`).
- No completeness gate on submit.
- Go-live / actioner approve path (`approval:action`) untouched; it remains the only path that flips RMVs to ACTIVE.
- `handleCategoryChange` / category-change RMV reprovisioning untouched.

Pre-existing symmetric follow-up (NOT in B5.1): `merchantFields` values are unvalidated on both paths. If ever tightened, it must be a shared change to both the merchant and admin paths with its own owner sign-off.

---

## 9. B5.1-web admin-web plan (separate PR, after B5.1-core)

A small RMV-focused card on `/merchants/[id]`, modelled on the B4 documents card.

- `apps/admin-web/lib/api/vouchers.ts` (new): `vouchersApi.listRmv(merchantId)`, `vouchersApi.updateRmv(merchantId, voucherId, { fields, reason })`, `vouchersApi.submitRmv(merchantId, voucherId, reason)` + Zod response schemas (RMV row: `id, code, title, type, estimatedSaving, status, approvalStatus, merchantFields, allowedFields`). Use the shared `client` (no FormData; plain JSON).
- `apps/admin-web/lib/merchants/useRmvVouchers.ts` (new): `useRmvVouchers(merchantId, enabled)` query + `useUpdateRmvVoucher` / `useSubmitRmvVoucher` mutations. Dedicated read endpoint -> invalidate ONLY the RMV query (NOT `getMerchantDetail`) on success AND error (B4 pattern). Note: a submit DOES change `rmv_configured`, which the SubmitForReviewCard checklist reads from `getMerchantDetail`; invalidate the merchant-detail query too on submit success so the submit-on-behalf checklist refreshes (small deliberate addition over the documents precedent; document it in the hook).
- `apps/admin-web/features/merchants/RmvVouchersCard.tsx` (new): lists the 2 RMVs (title, type, `estimatedSaving`, status chip). When `canManage` (the page passes `can('merchant:manage-vouchers')`): per-RMV "Edit" (DRAFT only) + "Submit for review" (DRAFT only) affordances; read-only otherwise. Show a calm inline note that category changes can discard/reprovision DRAFT RMVs, so the normal flow is set category, co-build DRAFT RMVs, then submit.
- `apps/admin-web/features/merchants/EditRmvDialog.tsx` (new): a reason-required dialog rendering ONE input per `allowedFields` entry read from the row (`terms` -> textarea, `expiryDate` -> date, generic text fallback), pre-filled from `merchantFields`. Submits `{ fields, reason }`. The UI MAY advise when fields are empty but MUST NOT block submit (Q5). `NamedGateBanner` on error.
- `apps/admin-web/features/merchants/SubmitRmvDialog.tsx` (new): a reason-required confirm dialog. Submits `{ reason }`. `NamedGateBanner` on error.
- `apps/admin-web/features/review/NamedGateBanner.tsx`: add to `CODE_MESSAGES`:
  - `RMV_NOT_FOUND` -> "This mandatory voucher no longer exists. The list has refreshed."
  - `VOUCHER_NOT_EDITABLE` -> "This voucher can no longer be edited (it has been submitted or is live). The page has refreshed."
  - `RMV_FIELD_NOT_ALLOWED` -> "One or more of those fields cannot be edited on this mandatory voucher."
  - `VOUCHER_NOT_SUBMITTABLE` -> "This voucher cannot be submitted (it is not a draft). The page has refreshed."
- `apps/admin-web/app/(app)/merchants/[id]/page.tsx`: `const canManageVouchers = can('merchant:manage-vouchers')`; mount `<RmvVouchersCard merchantId={data.merchant.id} canManage={canManageVouchers} />` near the Documents card (after Documents). The card itself is visible to any `merchant:read` admin (read-only); affordances gate on `canManage`.

Build note: `next build` MUST be run in the MAIN checkout for the web PR (worktree implementers cannot run it).

---

## 10. Test plan

Backend (vitest):
- New `tests/api/admin/admin-merchant-rmv-routes.test.ts`:
  - GET list: returns redacted RMV shape incl. `allowedFields`; 403 without `merchant:read`.
  - PATCH: happy path (writes merged `merchantFields`, actor `ADMIN` + reason audit); `RMV_FIELD_NOT_ALLOWED` on disallowed key; `VOUCHER_NOT_EDITABLE` on non-DRAFT; `RMV_NOT_FOUND` on cross-merchant voucher / missing; 403 without `merchant:manage-vouchers`; missing/empty `reason` -> 400; OPERATIONS allowed, FINANCE/CONTENT/SUPPORT denied; SUPER_ADMIN allowed.
  - SUBMIT: happy path (DRAFT -> PENDING_APPROVAL, `publishedAt` stamped, actor `ADMIN` + reason audit); `VOUCHER_NOT_SUBMITTABLE` on non-DRAFT; no completeness gate (empty `merchantFields` still submits); cap + reason pins as above.
  - `MERCHANT_NOT_FOUND` when `:id` is unknown.
- Capability unit: `merchant:manage-vouchers` in `ALL_SLICE1_CAPS`; OPERATIONS holds it; FINANCE/CONTENT/SUPPORT do not; SUPER_ADMIN superuser holds it.
- Merchant-path non-regression: updated `tests/api/merchant/voucher-rmv.test.ts` (Section 7 pins) - `$transaction` mock, `MERCHANT_ADMIN` actor audit, unchanged behaviour.
- Optional core-level unit tests for `updateRmvVoucherCore` / `submitRmvVoucherCore` (both actor types).

Admin-web (jest/vitest as the project uses):
- `vouchers.ts` client: request shape + Zod parse (incl. `allowedFields`).
- `useRmvVouchers` hooks: invalidation on success AND error; submit also invalidates merchant-detail.
- `RmvVouchersCard`: read-only vs `canManage`; DRAFT-only affordances; category-interaction note present.
- `EditRmvDialog`: dynamic fields from `allowedFields`; reason required; does NOT block on empty fields; `NamedGateBanner` on error.
- `SubmitRmvDialog`: reason required; `NamedGateBanner` on error.
- `NamedGateBanner`: the 4 new codes map.
- Capability mirror: `merchant:manage-vouchers` reaches OPERATIONS + SUPER_ADMIN.

Gates:
- Backend `npx vitest run` (focused suites green; then relevant full sweep).
- Backend `tsc --noEmit` (zero NEW errors; the 4 pre-existing baseline errors in `tests/api/customer/savings.service.test.ts` remain).
- Admin-web `tsc --noEmit` clean; admin-web test suite green.
- Admin-web `next build` in the MAIN checkout (web PR).
- Em-dash scan of all ADDED lines (`grep -nP '\x{2014}'`); none permitted.
- CI green before any SHA-bound merge.

---

## 11. PR sequencing

1. B5.1-core (backend): capability + cores + admin read service + 3 routes + tests + merchant-path non-regression. Open PR, pause for review (Codex), SHA-bound merge.
2. B5.1-web (admin-web): client + hooks + card + 2 dialogs + NamedGateBanner codes + capability mirror + page wiring + tests + `next build`. Open PR, pause for review, SHA-bound merge.

Each PR: plan-first done (this doc); implement only on explicit approval; no push/PR until asked.

---

## 12. Closed-scope exclusions + stop conditions

Out of scope for B5.1 (do NOT touch):
- Custom RCV voucher create/edit/delete/submit (that is B5.2).
- Live/ACTIVE or PENDING_APPROVAL RMV editing; any live-RMV correction lane.
- RMV create/delete (templates provision them; `provisionRmvVouchers` untouched).
- Voucher image upload / `imageUrl` (not an allowedField; overlaps B1 photo-apply).
- Any change to the actioner approve / go-live gates or `handleCategoryChange`.
- Any schema/Prisma/migration.
- Owner notification (none in B5.1).

Stop-and-report conditions (pause, do not work around):
- If implementation appears to need a schema/migration, a new error code, or a new `NotificationType`/`AuditEvent` value: STOP and report exact SQL/enum/rollback first.
- If the `$transaction` audit upgrade breaks a merchant-path test in a way that implies a behavioural change beyond "audit now carries an actor": STOP and report before adjusting the test.
- If live-code inspection during implementation contradicts any anchor in this plan: STOP and amend the plan before coding.

Do NOT start (held): B5.2 custom-voucher CRUD, Merchant Portal Phase 4, B1 photo-apply, PR3 branchCount, stash restore, the §B24-TIMELINE item, or any unrelated cleanup.

---

## 13. B5.2 product/legal anchor (pin; later decision, NOT B5.1)

Custom vouchers / material public-offer changes need a merchant ACCEPTANCE or
approval/consent trail before they can go live. The existing custom-voucher approval is
ADMIN approval, NOT merchant consent: an admin-CREATED custom voucher would have no
merchant-acceptance record today. Do NOT silently implement custom-voucher admin CRUD as
direct, go-live-capable changes. Before B5.2 implementation, resolve (owner decision):
likely a pending-review/acceptance lane (B2.5-style) so the merchant accepts an
admin-built public offer before activation, to avoid disputes where a merchant says they
never created or accepted a voucher a customer tries to redeem. This is an explicit open
product/legal decision, not part of B5.1.

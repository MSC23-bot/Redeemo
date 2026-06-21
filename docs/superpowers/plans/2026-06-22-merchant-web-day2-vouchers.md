# Day-2 Vouchers (Voucher Management) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan PR-by-PR / slice-by-slice (fresh implementer subagent + fresh adversarial reviewer subagent per slice, no self-certify). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the merchant Day-2 Vouchers module + a real Redeemo admin VOUCHER approval lane (which the platform lacks today), so merchants can create/manage/submit custom vouchers of all 7 types from registration onward; admins review/approve/correct them; and approved customs go customer-visible only when the merchant + flagship vouchers are live. No schema.

**Architecture:** Three owner-gated PRs. PR-A is the backend enabler (the VOUCHER `AdminApproval` lane mirroring the Option B `editApplier`; Model 1 approve-early/activate-delayed; the `VOUCHER_APPROVAL_UPDATE` producer; the concierge `merchantFields.adminProposed` write; the `voucherId` redemptions filter + voucher `_count` additives; custom `merchantFields`/`askHelp` storage). PR-B is the merchant-web Vouchers module (list page + per-state detail pages + the decoupled day-2 builder + create/edit-draft/submit/delete/duplicate + concierge diff/apply). PR-C is the admin-web VOUCHER review panel + queue + action bar. PR-B/PR-C stack on PR-A.

**Tech Stack:** Backend Fastify + Prisma 7 + vitest. merchant-web + admin-web Next 15 App Router + React Query + zod + jest/RTL. No schema/migration.

**Source of truth:** the spec `docs/superpowers/specs/2026-06-22-merchant-web-day2-vouchers-design.md` (commit 9d33eaa7). Read it before each PR.

**No-schema proof (spec §5):** reuses `ApprovalType.VOUCHER`, `Voucher.merchantFields Json?`, `ApprovalStatus`/`VoucherStatus`, the customer-visibility gate, the onboarding-approve transaction, `NotificationType.VOUCHER_APPROVAL_UPDATE`. **If any task needs a column/enum/model, STOP and report exact SQL + rollback (spec §8).**

**Two honesty-note assumptions to verify in PR-A (spec §11):** (1) no existing query assumes `status:PENDING_APPROVAL` implies `approvalStatus:PENDING`; (2) the admin actionable queue keys "needs review" off `AdminApproval.status`, not voucher status, so approved-waiting vouchers never re-surface.

---

## File structure

### PR-A backend (`feat/day2-vouchers-backend`)
- Modify `src/api/merchant/voucher/routes.ts` - custom create/update schemas accept an optional `merchantFields` bag.
- Modify `src/api/merchant/voucher/service.ts` - `createVoucher`/`updateVoucher` store `merchantFields`; `submitVoucher` creates/reopens the `AdminApproval{VOUCHER}`; never let the merchant set `status`/`approvalStatus`/`isRmv`/`merchantId`.
- Modify `src/api/merchant/redemptions/routes.ts` + `service.ts` - add a `voucherId` filter (additive).
- Modify `src/api/merchant/voucher/service.ts` `listVouchers` (+ `listRmvVouchers`) - curated select + `_count: { select: { redemptions: true } }`.
- Create `src/api/admin/approvals/voucherApprover.ts` - `getVoucherReviewContext`, `approveVoucher`, `rejectVoucher`, `requestVoucherChanges` (mirror `editApplier.ts`), incl. the `VOUCHER_APPROVAL_UPDATE` producer + Model 1 activation-for-live-merchant.
- Modify `src/api/admin/approvals/routes.ts` - 4 voucher routes: GET `/:id/voucher-review` gated `approval:read`; the 3 action routes (`/:id/approve-voucher`, `/:id/reject-voucher`, `/:id/request-voucher-changes`) gated `approval:action`.
- Modify `src/api/admin/approvals/service.ts` `listApprovals` - enrich VOUCHER rows (voucher title + merchant businessName + type/status/approvalStatus + the go-live-now-vs-waiting hint), mirroring the MERCHANT_ONBOARDING merchant enrichment.
- Modify `src/api/admin/approvals/service.ts` `approveApproval` (onboarding) - second `updateMany` to activate approved customs + per-voucher `now-live` notification.
- Tests under `tests/api/merchant/voucher/`, `tests/api/merchant/redemptions/`, `tests/api/admin/approvals/`.

### PR-B merchant-web (`feat/day2-vouchers-merchant-web`, stacked on PR-A)
- Modify `apps/merchant-web/lib/api/voucher.ts` - add the RCV custom client (list/get/create/update/submit/delete) + zod.
- Create `apps/merchant-web/app/(app)/vouchers/page.tsx` - the Vouchers list page.
- Create `apps/merchant-web/app/(app)/vouchers/[id]/page.tsx` - the per-state detail page.
- Create `apps/merchant-web/components/vouchers/{VouchersList,VoucherCard,VoucherStatusFilter,VoucherDetail,ConciergeDiff}.tsx`.
- Create `apps/merchant-web/components/vouchers/builder/**` - the decoupled day-2 builder (reuses `apps/merchant-web/lib/voucher/*`).
- Modify `apps/merchant-web/components/shell/navItems.ts` - Vouchers `href:'#'` -> `/vouchers`.
- Tests under each `__tests__/`.

### PR-C admin-web (`feat/day2-vouchers-admin-web`, stacked on PR-A)
- Create `apps/admin-web/lib/api/voucherReview.ts` + `apps/admin-web/lib/review/useVoucherReview.ts`.
- Create `apps/admin-web/features/review/VoucherReviewPanel.tsx` (mirror `EditReviewPanel.tsx`).
- Modify the admin queue LIST page (`apps/admin-web/app/(app)/queue/page.tsx` or the queue-row component) - render VOUCHER rows with the PR-A `listApprovals` enrichment (voucher title + business name + type/status/approvalStatus + the go-live-vs-waiting hint) so a VOUCHER row shows context before opening.
- Modify `apps/admin-web/app/(app)/queue/[id]/page.tsx` - a `type==='VOUCHER'` branch rendering `VoucherReviewPanel` (replaces the current `NonOnboardingNotice` for VOUCHER) + the action bar wiring.
- Tests under each `__tests__/`.

---

## PR-A - Backend enabler (no schema)

> Branch: `git checkout main && git pull --ff-only origin main && git checkout -b feat/day2-vouchers-backend`. Backend only. Strict TDD. Mirror harnesses: `tests/api/merchant/voucher-rmv.test.ts` (buildApp + prisma-mock + merchant JWT), `tests/api/admin/approvals/*` (admin JWT).

### Task A1: `voucherId` filter on the merchant redemptions list

**Files:** Modify `src/api/merchant/redemptions/routes.ts` (the `filterSchema`), `src/api/merchant/redemptions/service.ts` (`buildRedemptionWhere`); Test `tests/api/merchant/redemptions/list.test.ts`.

- [ ] **Step 1: failing test** - `GET /api/v1/merchant/redemptions?voucherId=v1` adds `voucherId:'v1'` to the `where` (AND the existing `branch:{merchantId}` scoping, so a cross-tenant voucher yields empty).

```ts
it('voucherId filter scopes to that voucher (AND branch.merchantId)', async () => {
  await get('/api/v1/merchant/redemptions?voucherId=v1')
  const where = findManyArg().where
  expect(where.voucherId).toBe('v1')
  expect(where.branch).toEqual({ merchantId: 'm1' })
})
```

- [ ] **Step 2: run, expect fail.** `npx vitest run tests/api/merchant/redemptions/list.test.ts`
- [ ] **Step 3: implement** - add `voucherId: z.string().optional()` to `filterSchema` in `routes.ts`; in `buildRedemptionWhere` add `if (f.voucherId) where.voucherId = f.voucherId`.
- [ ] **Step 4: run, expect pass. Step 5: commit** (`src/api/merchant/redemptions/** + the test`).

### Task A2: per-voucher `_count` + curated select on the voucher lists

**Files:** Modify `src/api/merchant/voucher/service.ts` (`listVouchers`, `listRmvVouchers`); Test `tests/api/merchant/voucher/list.test.ts` (new).

- [ ] **Step 1: failing test** - `listVouchers` returns rows with a curated select (no blind `findMany`) and `redemptionCount` derived from `_count.redemptions`; never selects `merchantFields` raw or any internal-only field beyond what the list needs.

```ts
it('listVouchers uses a curated select + _count redemptions', async () => {
  app.prisma.voucher.findMany = vi.fn().mockResolvedValue([
    { id:'v1', title:'T', type:'BOGO', status:'ACTIVE', approvalStatus:'APPROVED', estimatedSaving: 5, isRmv:false, publishedAt:new Date(), expiryDate:null, createdAt:new Date(), _count:{ redemptions: 3 } },
  ])
  const rows = await listVouchers(app.prisma, 'ma1')
  const arg = (app.prisma.voucher.findMany as any).mock.calls[0][0]
  expect(arg.select._count).toEqual({ select: { redemptions: true } })
  expect(rows[0].redemptionCount).toBe(3)
})
```

- [ ] **Step 2: run, expect fail. Step 3: implement** - replace the blind `findMany` with a curated `select` (id/title/type/status/approvalStatus/estimatedSaving/description/terms/isRmv/publishedAt/expiryDate/createdAt + `_count:{select:{redemptions:true}}`) and map `redemptionCount = r._count.redemptions`. Same for `listRmvVouchers`. Confirm the `redemptions` relation name on `Voucher` (grep `redemptions` in the Voucher model; if the relation is named differently, use that name).
- [ ] **Step 4: run, expect pass. Step 5: commit.**

### Task A3: custom create/update store `merchantFields` (for `askHelp` + later `adminProposed`)

**Files:** Modify `src/api/merchant/voucher/routes.ts` (`createVoucherSchema`/`updateVoucherSchema`), `src/api/merchant/voucher/service.ts` (`createVoucher`/`updateVoucher`); Test `tests/api/merchant/voucher/create-update.test.ts` (new).

- [ ] **Step 1: failing tests** - (a) `POST /vouchers` with `merchantFields:{askHelp:true,builderType:'bogo'}` stores it in `Voucher.merchantFields`; (b) the create/update **ignore** client-supplied `status`/`approvalStatus`/`approvedBy`/`isRmv`/`merchantId` (server sets `status:'DRAFT', approvalStatus:'PENDING', isRmv:false`); (c) `PATCH /:id` (DRAFT) merges `merchantFields`.

- [ ] **Step 2: run, expect fail. Step 3: implement** - add `merchantFields: z.record(z.string(), z.unknown()).optional()` to `createVoucherSchema` + `updateVoucherSchema`; in `createVoucher`/`updateVoucher` write `merchantFields` (merge on update). Ensure the create/update `data` NEVER spreads the body blindly (only the allow-listed fields); `status`/`approvalStatus`/`isRmv`/`merchantId` are set by the server, never from the body. (Security invariant spec §6.1.)
- [ ] **Step 4: run, expect pass. Step 5: commit.**

### Task A4: `submitVoucher` creates/reopens the `AdminApproval{VOUCHER}`

**Files:** Modify `src/api/merchant/voucher/service.ts` (`submitVoucher`); Test `tests/api/merchant/voucher/submit-approval.test.ts` (new).

- [ ] **Step 1: failing tests** - on submit of a DRAFT custom voucher: status -> PENDING_APPROVAL (unchanged) AND an `AdminApproval{type:'VOUCHER', referenceId:voucherId, referenceType:'voucher', status:'PENDING'}` is created; on resubmit (a voucher whose VOUCHER approval exists in CHANGES_REQUESTED), the SAME approval row is REOPENED to PENDING (not a duplicate) - mirror the onboarding `submitForApprovalCore` reopen.

- [ ] **Step 2: run, expect fail. Step 3: implement** - wrap the submit in a `$transaction`; after the voucher update, `upsert`/find-or-create the VOUCHER approval (find by `type:'VOUCHER', referenceId:voucherId`; if none create PENDING; if exists set status PENDING + clear `claimedById`). Audit unchanged. Reference the onboarding `submitForApprovalCore` reopen pattern (`src/api/merchant/onboarding/service.ts:237`).
- [ ] **Step 4: run, expect pass. Step 5: commit.**

### Task A5: `voucherApprover.ts` - review context + approve (Model 1) + reject + request-changes (concierge)

**Files:** Create `src/api/admin/approvals/voucherApprover.ts`; Test `tests/api/admin/approvals/voucher-approver.test.ts` (new).

- [ ] **Step 1: failing tests** (mirror `editApplier` tests):
  - `getVoucherReviewContext(id)` returns the voucher (curated: title/type/status/approvalStatus/description/terms/estimatedSaving/merchantFields incl `askHelp`/`adminProposed`) + the merchant (id/businessName/status) - no PII/redemptionPin.
  - `approveVoucher(id, adminId)`: if `merchant.status==='ACTIVE'` AND the flagship RMVs are ACTIVE -> voucher `status:'ACTIVE', approvalStatus:'APPROVED', approvedBy, approvedAt`; else `approvalStatus:'APPROVED'` + KEEP `status:'PENDING_APPROVAL'` (approved-waiting). The `AdminApproval` -> APPROVED. Audit. Notify (live -> "approved and now live"; waiting -> "approved, waiting").
  - `rejectVoucher(id, adminId, reason)`: voucher `status:'INACTIVE', approvalStatus:'REJECTED'`; AdminApproval REJECTED; audit; notify.
  - `requestVoucherChanges(id, adminId, { proposed?, note })`: writes `merchantFields.adminProposed = proposed` (only present keys) + `merchantFields.adminNote = note`; voucher `status:'DRAFT', approvalStatus:'CHANGES_REQUESTED'`; AdminApproval CHANGES_REQUESTED; audit; notify. With no `proposed`, `adminProposed` is not written (comment-only).
  - All gate on `approval.type==='VOUCHER'` (else `APPROVAL_NOT_ACTIONABLE`) + `ACTIONABLE_STATUSES`.

- [ ] **Step 2: run, expect fail. Step 3: implement** `voucherApprover.ts` mirroring `editApplier.ts` structure. Pseudocode for `approveVoucher` (write the real code):

```ts
// inside a $transaction
const voucher = await tx.voucher.findFirst({ where: { id: approval.referenceId, isRmv: false } })
if (!voucher) throw new AppError('VOUCHER_NOT_FOUND')
const merchant = await tx.merchant.findUnique({ where: { id: voucher.merchantId }, select: { status: true } })
const flagshipLive = (await tx.voucher.count({ where: { merchantId: voucher.merchantId, isRmv: true, status: { not: 'ACTIVE' } } })) === 0
const goLive = merchant?.status === 'ACTIVE' && flagshipLive
await tx.voucher.update({ where: { id: voucher.id }, data: {
  approvalStatus: 'APPROVED', approvedBy: adminId, approvedAt: new Date(),
  ...(goLive ? { status: 'ACTIVE' } : {}),  // else keep PENDING_APPROVAL (approved-waiting)
} })
await tx.adminApproval.update({ where: { id: approval.id }, data: { status: 'APPROVED', adminUserId: adminId } })
// audit + notify (VOUCHER_APPROVAL_UPDATE, copy = goLive ? 'approved-and-live' : 'approved-waiting')
```

`requestVoucherChanges` writes only present proposed keys into `merchantFields.adminProposed` (never blind-spread); validate each proposed value type defensively (string fields are strings; estimatedSaving is a finite number) so a malformed proposal can never poison the bag.

- [ ] **Step 4: run, expect pass. Step 5: commit.**

### Task A6: the `VOUCHER_APPROVAL_UPDATE` notification producer

**Files:** Modify `voucherApprover.ts` (fold into the A5 handlers) + add the now-live notify in A7; Test `tests/api/admin/approvals/voucher-notify.test.ts` (new).

- [ ] **Step 1: failing tests** - approve fires the `inApp` `VOUCHER_APPROVAL_UPDATE` (`recipientType:MERCHANT_ADMIN`, `recipientId`: the owner adminId, `referenceType:'voucher'`, `referenceId:voucherId`) with copy distinguishing approved-and-live vs approved-waiting; reject + request-changes fire the same in-app `type` with their copy; the now-live activation (A7) fires the now-live in-app copy; no notification on submit. (Resolve the owner adminId + email via the existing `getMerchantOwner` helper used by the onboarding notify.)
- [ ] **Step 2: run, expect fail. Step 3: implement** - use **`safeNotify`** (the actioner-safe wrapper used by `approveApproval`/`rejectApproval`/`requestChanges` at `src/api/admin/approvals/service.ts:316`+, which never fails the admin action if notify errors), passing the SAME shape: `{ to: owner.email, recipientType:'MERCHANT_ADMIN', recipientId: owner.adminId, type:'<voucher_*>', email: {...}, inApp: { notificationType:'VOUCHER_APPROVAL_UPDATE', title, body, referenceType:'voucher', referenceId:voucherId }, ip }`. **`notify()` requires the `email` payload, so it MUST be provided** - construct voucher email templates mirroring the existing merchant email templates (e.g. `merchantChangesRequestedEmail`); **email DELIVERY stays dark/deferred (not part of this milestone)** - the only user-visible notification requirement here is the in-app `VOUCHER_APPROVAL_UPDATE`. Tests assert the in-app row; do NOT assert email send. Copy variants: voucher_approved_live / voucher_approved_waiting / voucher_now_live / voucher_changes_requested / voucher_rejected.
- [ ] **Step 4: run, expect pass. Step 5: commit.**

### Task A7: Model 1 activation - extend onboarding-approve to activate approved customs

**Files:** Modify `src/api/admin/approvals/service.ts` (`approveApproval`, after the flagship `updateMany` at ~line 521); Test `tests/api/admin/approvals/voucher-activation.test.ts` (new).

- [ ] **Step 1: failing tests** - onboarding approve of a merchant with an approved-waiting custom voucher (`isRmv:false, approvalStatus:'APPROVED', status:'PENDING_APPROVAL'`) flips it to `status:'ACTIVE'` in the SAME transaction (after flagship), and fires a `now-live` `VOUCHER_APPROVAL_UPDATE` per activated voucher; a merchant with NO approved-waiting customs sees no extra updates (no-op); a SUBMITTED-not-approved custom (`approvalStatus:'PENDING'`) is NOT activated.

- [ ] **Step 2: run, expect fail. Step 3: implement** - after the flagship `updateMany`:

```ts
const activatedCustoms = await tx.voucher.findMany({
  where: { merchantId: merchant.id, isRmv: false, approvalStatus: 'APPROVED', status: 'PENDING_APPROVAL' },
  select: { id: true },
})
if (activatedCustoms.length > 0) {
  await tx.voucher.updateMany({
    where: { merchantId: merchant.id, isRmv: false, approvalStatus: 'APPROVED', status: 'PENDING_APPROVAL' },
    data: { status: 'ACTIVE' },
  })
  // fire one now-live VOUCHER_APPROVAL_UPDATE per activated id via safeNotify (same
  // shape as A6: to owner.email, recipientType MERCHANT_ADMIN, type 'voucher_now_live',
  // email payload provided but delivery dark, inApp VOUCHER_APPROVAL_UPDATE + referenceType
  // 'voucher'), using the post-commit notify pattern this file already uses for onboarding.
}
```

Keep the flagship `updateMany` first; this addition must be a strict no-op when there are no approved customs (verify the onboarding-approve tests still pass). The now-live notify uses `safeNotify` (never fails the onboarding-approve transaction).

- [ ] **Step 4: run, expect pass; run `npx vitest run tests/api/admin/approvals` to confirm onboarding-approve unregressed. Step 5: commit.**

### Task A8: admin VOUCHER routes (review/approve/reject/request-changes)

**Files:** Modify `src/api/admin/approvals/routes.ts`; Test `tests/api/admin/approvals/voucher-routes.test.ts` (new).

- [ ] **Step 1: failing tests** - `GET /:id/voucher-review` (gated `approval:read`), `POST /:id/approve-voucher`, `POST /:id/reject-voucher` (reason body), `POST /:id/request-voucher-changes` (`{ proposed?, note }` body), all gated `approval:action`; each dispatches to the matching `voucherApprover` fn with `req.user.sub`; a non-VOUCHER approval id returns `APPROVAL_NOT_ACTIONABLE`.
- [ ] **Step 2: run, expect fail. Step 3: implement** - mirror the editApplier route registrations (`routes.ts:80-88`) with the 4 voucher routes calling `voucherApprover`.
- [ ] **Step 4: run, expect pass. Step 5: commit.**

### Task A8b: VOUCHER queue enrichment in `listApprovals`

**Files:** Modify `src/api/admin/approvals/service.ts` (`listApprovals`); Test `tests/api/admin/approvals/voucher-queue-enrichment.test.ts` (new).

- [ ] **Step 1: failing tests** - `listApprovals` enriches each VOUCHER row with enough context to show in the queue BEFORE opening: the voucher `title` + `type` + `status` + `approvalStatus`, the merchant `businessName`, and a `goLiveHint` (`'live-now' | 'waiting-for-go-live'` derived from `merchant.status==='ACTIVE' && flagship-live`). MERCHANT_ONBOARDING rows keep their existing merchant enrichment (unregressed); edit-type rows unchanged.
- [ ] **Step 2: run, expect fail. Step 3: implement** - mirror the MERCHANT_ONBOARDING enrichment block in `listApprovals` (~line 95): collect VOUCHER `referenceId`s, batch-load the vouchers (curated select: id/title/type/status/approvalStatus/merchantId) + their merchants (businessName/status), and attach a `voucher` + `goLiveHint` summary to each VOUCHER row (mirroring how `merchant:` is attached to onboarding rows). No PII/redemptionPin.
- [ ] **Step 4: run, expect pass; run `npx vitest run tests/api/admin/approvals` to confirm onboarding/edit queue rows unregressed. Step 5: commit.**

### Task A9: honesty-note regression guards (spec §11)

**Files:** Test `tests/api/merchant/voucher/approved-waiting-invariants.test.ts` (new).

- [ ] **Step 1: tests** - (1) an approved-waiting voucher (`status:PENDING_APPROVAL, approvalStatus:APPROVED`) is correctly **immutable to the merchant** (PATCH/submit/delete throw `VOUCHER_NOT_EDITABLE`/`NOT_SUBMITTABLE`/`NOT_DELETABLE` because they gate on `status:DRAFT`), and **excluded from customer queries** (a customer voucher query with `status:ACTIVE` does not return it - assert via the customer-visibility filter unit if reachable, else document the cross-check). (2) The admin queue's actionable listing keys off `AdminApproval.status` (PENDING/CLAIMED) - assert an approved voucher's `AdminApproval` is `APPROVED` so a `listApprovals({status:'PENDING'})` does not return it. Add a code comment in `voucherApprover.ts` pinning both invariants.
- [ ] **Step 2: run, expect pass (these encode already-true invariants). Step 3: commit.**

### PR-A gate + open

- [ ] **Full gate:** `npx vitest run tests/api/merchant tests/api/admin` green; `npm run test:unit` green; `npx tsc --noEmit` clean; dash-clean staged.
- [ ] **Scope guard:** only `src/api/merchant/voucher/**`, `src/api/merchant/redemptions/**` (the voucherId filter), `src/api/admin/approvals/**`, and the new tests. NO `prisma/**`, NO `apps/**`, NO customer/other-service edits.
- [ ] **Adversarial review checklist (PR-A):** merchant cannot set `status:ACTIVE`/`approvalStatus`/`isRmv`/`merchantId` (body ignored); approve activates only when merchant ACTIVE + flagship ACTIVE, else approved-waiting; the onboarding-approve activation is a strict no-op with no customs; cross-merchant voucher id -> not-found; `requestVoucherChanges` never blind-spreads `proposed`; notifications fire server-side with `referenceType:'voucher'`; no PII/redemptionPin in the review context; the actioner dispatch does not regress MERCHANT_ONBOARDING / edit lanes; the `voucherId` filter ANDs `branch.merchantId`; NO schema.
- [ ] **Rollback notes:** PR-A is additive (new files + additive route fields + one additive `updateMany`). Revert = revert the PR; no data migration; the new `AdminApproval{VOUCHER}` rows + `merchantFields.adminProposed`/`askHelp` are inert if the lane is reverted (no customer effect; customs without activation stay non-ACTIVE).
- [ ] **Stop-and-report triggers:** any schema/migration need; the `redemptions` relation name on `Voucher` differs from assumed; the actioner dispatch cannot avoid touching other lanes; the activation extension cannot be a no-op; a merchant route can set ACTIVE/APPROVED.
- [ ] **Open PR-A**, run CI, PAUSE at the SHA-bound merge gate.

---

## PR-B - merchant-web Vouchers module + detail (stacked on PR-A)

> Branch off PR-A: `feat/day2-vouchers-merchant-web`. Run jest from `apps/merchant-web`. Mirror conventions: `lib/api/client.ts` `apiFetch`, React Query flat keys, `components/ui/*`, jest/RTL with `QueryClientProvider`. House style: no em dashes; no emojis; icons via `@/lib/icons`. Reuse `apps/merchant-web/lib/voucher/*` logic (config/terms/scoring/compose/typeMeta) for the builder - do NOT import the onboarding builder components.

### Task B1: RCV custom voucher client

**Files:** Modify `apps/merchant-web/lib/api/voucher.ts`; Test `apps/merchant-web/lib/api/__tests__/voucher-custom.test.ts` (new).

- [ ] **Step 1: failing tests** - `listCustomVouchers()` GET `/api/v1/merchant/vouchers` (parses curated rows incl `redemptionCount`); `getVoucher(id)`; `createVoucher(body)` POST; `updateVoucher(id, body)` PATCH; `submitVoucher(id)` POST `/:id/submit`; `deleteVoucher(id)` DELETE; plus `listFlagshipVouchers()` (the existing `listRmvVouchers`). Zod schemas with `.passthrough()`.
- [ ] **Step 2: implement** the client fns + a `customVoucherSchema` (id/title/type/status/approvalStatus/estimatedSaving/description/terms/isRmv/publishedAt/expiryDate/createdAt/redemptionCount/merchantFields-with-adminProposed). **Step 3: run jest, expect pass. Step 4: commit.**

### Task B2: the decoupled day-2 builder (reuse `lib/voucher/*`)

**Files:** Create `apps/merchant-web/components/vouchers/builder/{DayTwoBuilder,TypePicker,BuilderFields,BuilderPreview,BuilderScore}.tsx`; Test `__tests__/DayTwoBuilder.test.tsx`.

- [ ] **Step 1: failing tests** - the builder renders a type picker with ALL 8 types (incl TIME_LIMITED + REUSABLE enabled); selecting a type + filling fields computes the live score + composed title/description from `lib/voucher/*` (assert via the pure logic); save (create) calls `createVoucher`; the builder carries NO onboarding state (no 2-RMV gate / voucherIndex / flagship template).
- [ ] **Step 2: implement** the builder consuming `lib/voucher/{config,terms,scoring,compose,typeMeta}.ts` (the validated logic) with a new UI in the merchant-web design system. Submit path: create-or-update the draft (`createVoucher`/`updateVoucher`) then optionally `submitVoucher`. **Step 3: run jest, expect pass. Step 4: commit.**

### Task B3: Vouchers list page

**Files:** Create `apps/merchant-web/app/(app)/vouchers/page.tsx`, `components/vouchers/{VouchersList,VoucherCard,VoucherStatusFilter}.tsx`; Modify `components/shell/navItems.ts`; Test `app/(app)/vouchers/__tests__/page.test.tsx`.

- [ ] **Step 1: failing tests** - flagship vouchers render pinned/locked at top (read-only, no edit/delete); custom vouchers render grouped by status (Live=ACTIVE / In review=PENDING_APPROVAL / Draft=DRAFT / Finished=INACTIVE|EXPIRED / Rejected=INACTIVE+approvalStatus REJECTED) with the All/Live/In review/Draft/Finished filter; the "Create a voucher" action opens the builder; a row click routes to `/vouchers/[id]`; `navItems.ts` Vouchers -> `/vouchers`; the approved-waiting state (PENDING_APPROVAL + approvalStatus APPROVED) renders a distinct "Approved, goes live when your business is live" label; owner-only (non-owner = view-only - design the seam, no role-branch in v1).
- [ ] **Step 2: implement** the page (React Query `['vouchers']` from `listCustomVouchers` + `['flagshipVouchers']`), the list grouping/filtering (client-side), the card (type chip, status badge incl the derived approved-waiting/changes-requested states, redemptionCount, kebab actions per status), loading/empty/error. **Step 3: run jest, expect pass. Step 4: commit.**

### Task B4: voucher detail page (per-state, safe fields)

**Files:** Create `apps/merchant-web/app/(app)/vouchers/[id]/page.tsx`, `components/vouchers/VoucherDetail.tsx`; Test `app/(app)/vouchers/[id]/__tests__/page.test.tsx`.

- [ ] **Step 1: failing tests** - the detail renders for each state (live / approved-waiting / in-review / draft / changes-requested / rejected / inactive-expired) showing ONLY safe core fields (title, type, status incl derived states, description, saving, terms, customer-preview card, where-applies merchant-wide, submission/review state) + a per-voucher redemption count (from `redemptionCount`) + a "View redemptions" link to `/redemptions?voucherId=<id>`; NEVER customer PII or redemptionPin; suspended/in-review render read-only.
- [ ] **Step 2: implement** the detail (React Query `['voucher', id]` from `getVoucher`); the per-state rendering; the View-redemptions deep-link (uses the PR-A `voucherId` filter). **Step 3: run jest, expect pass. Step 4: commit.**

### Task B5: create / edit-draft / submit / delete / duplicate

**Files:** Modify `components/vouchers/VoucherCard.tsx` + the detail; Create `components/vouchers/DuplicateAction.tsx`; Test in the page/detail tests.

- [ ] **Step 1: failing tests** - DRAFT actions: Edit (opens builder prefilled via `getVoucher`), Submit (`submitVoucher` -> invalidate `['vouchers']`), Delete (DRAFT-only, confirm). Duplicate (any state): client-orchestrated - `getVoucher(source)` -> prefill the builder with the source fields -> `createVoucher` a new DRAFT titled "<title> (copy)"; no backend duplicate route. Non-DRAFT vouchers hide Edit/Submit/Delete (server also enforces).
- [ ] **Step 2: implement** the action wiring + the Duplicate prefill mapping. **Step 3: run jest, expect pass. Step 4: commit.**

### Task B6: concierge diff + apply (CHANGES_REQUESTED)

**Files:** Create `components/vouchers/ConciergeDiff.tsx`; Modify the builder to accept `adminProposed`; Test `__tests__/ConciergeDiff.test.tsx`.

- [ ] **Step 1: failing tests** - opening a CHANGES_REQUESTED voucher (with `merchantFields.adminProposed = {title:'Better title', estimatedSaving: 6}` + `adminNote`) in the builder renders a proposed-vs-current diff + the admin note; "Apply Redeemo's suggestions" writes the proposed values into the form fields (so the next save persists them); the merchant can edit further or ignore; on resubmit (`submitVoucher`) the applied values persist via `updateVoucher` then submit; a comment-only changes request (no `adminProposed`) shows the note only.
- [ ] **Step 2: implement** the diff (read `adminProposed` vs the current voucher fields), the Apply action (set the form state to the proposed values), and ensure resubmit goes through `updateVoucher` (validated). **Step 3: run jest, expect pass. Step 4: commit.**

### PR-B gate + open

- [ ] `cd apps/merchant-web && npx tsc --noEmit` clean; `npx jest --forceExit` green; `npm run lint` clean; `npm run build` succeeds; dash-clean; scope = `apps/merchant-web/**` only.
- [ ] **Adversarial review checklist (PR-B):** no customer PII/redemptionPin rendered anywhere (list/detail/builder); the merchant UI never sends `status`/`approvalStatus` (server-set); flagship is read-only (no edit/delete); approved-waiting + changes-requested derived states render correctly; the builder is decoupled (no onboarding imports/state, all 8 types); Apply-suggestions resubmits via the validated `updateVoucher`; the View-redemptions deep-link uses `voucherId`; owner-only gating seam present; `/vouchers` reachable from the sidebar.
- [ ] **Rollback notes:** frontend-only; revert = revert the PR; no data effect.
- [ ] **Stop-and-report triggers:** any contract mismatch with the PR-A endpoints (report, do not patch the backend); any need to render a field that requires a backend change; scope creep beyond `apps/merchant-web`.
- [ ] **Open PR-B** stacked on PR-A, PAUSE at the SHA-bound merge gate.

---

## PR-C - admin-web VOUCHER review lane (stacked on PR-A)

> Branch off PR-A: `feat/day2-vouchers-admin-web`. Run jest from `apps/admin-web`. Mirror `features/review/EditReviewPanel.tsx` + `lib/review/useEditReview.ts` + `lib/api/editReview.ts` + the `queue/[id]/page.tsx` type-branch.

### Task C1: voucher-review client + hook

**Files:** Create `apps/admin-web/lib/api/voucherReview.ts`, `apps/admin-web/lib/review/useVoucherReview.ts`; Test `lib/api/__tests__/voucherReview.test.ts`.

- [ ] **Step 1: failing tests** - `getVoucherReview(id)` GET `/:id/voucher-review`; `approveVoucher(id)` POST `/:id/approve-voucher`; `rejectVoucher(id, reason)` POST `/:id/reject-voucher`; `requestVoucherChanges(id, {proposed?, note})` POST `/:id/request-voucher-changes`; `useVoucherReview(id)` React Query hook. Mirror `editReview.ts`/`useEditReview.ts`.
- [ ] **Step 2: implement. Step 3: run jest, expect pass. Step 4: commit.**

### Task C2: `VoucherReviewPanel`

**Files:** Create `apps/admin-web/features/review/VoucherReviewPanel.tsx`; Test `features/review/__tests__/VoucherReviewPanel.test.tsx`.

- [ ] **Step 1: failing tests** - renders the voucher (title/type/status/description/saving/terms/customer-preview) + the `askHelp` flag when set; the action bar (Approve / Reject-with-reason / Request-changes); the request-changes form lets the admin enter corrected fields (title/description/terms/estimatedSaving + windows/cooldown) as `proposed` + a note; Approve shows the Model 1 outcome hint (will go live now vs waiting for go-live based on the voucher's merchant status in the review context).
- [ ] **Step 2: implement** mirroring `EditReviewPanel.tsx` (+ `EditReviewDiff` for the proposed-fields display). **Step 3: run jest, expect pass. Step 4: commit.**

### Task C3: queue page VOUCHER branch + action wiring

**Files:** Modify `apps/admin-web/app/(app)/queue/[id]/page.tsx`; Test `app/(app)/queue/[id]/__tests__/page.test.tsx` (update the existing VOUCHER test).

- [ ] **Step 1: failing tests** - for a VOUCHER approval, the page renders `VoucherReviewPanel` (NOT `NonOnboardingNotice`); the action bar calls the C1 client fns; the existing MERCHANT_ONBOARDING + edit-type rendering is unchanged (the current "shows the non-onboarding notice for VOUCHER" test is updated to assert the panel instead).
- [ ] **Step 2: implement** - add a `data.approval.type === 'VOUCHER'` branch (before the `NonOnboardingNotice` fallback) rendering `VoucherReviewPanel`. **Step 3: run jest, expect pass. Step 4: commit.**

### Task C4: VOUCHER queue-list row rendering

**Files:** Modify `apps/admin-web/app/(app)/queue/page.tsx` (or its queue-row component); Test `app/(app)/queue/__tests__/page.test.tsx`.

- [ ] **Step 1: failing tests** - a VOUCHER queue row renders the enriched context from PR-A `listApprovals` (voucher title, business name, type/status/approvalStatus, the go-live-now-vs-waiting hint) and links to `/queue/[id]`; a VOUCHER row no longer falls into the generic non-onboarding placeholder; MERCHANT_ONBOARDING + edit-type rows are unchanged. An end-to-end queue->detail pin: a VOUCHER row is clickable and routes to its review screen.
- [ ] **Step 2: implement** - render the VOUCHER row using the enriched fields (mirror how MERCHANT_ONBOARDING rows render their merchant summary). **Step 3: run jest, expect pass. Step 4: commit.**

### PR-C gate + open

- [ ] `cd apps/admin-web && npx tsc --noEmit` clean; `npx jest --forceExit` green; `npm run lint` clean; `npm run build` succeeds; dash-clean; scope = `apps/admin-web/**` only.
- [ ] **Adversarial review checklist (PR-C):** the VOUCHER panel + actions are admin-capability-gated (the 3 action routes are `approval:action`; the GET review is `approval:read`); approve/reject/request-changes call the right endpoints; the proposed-corrections form sends only the allow-listed fields; the **queue list renders VOUCHER rows with the enriched context** (title/business/type/status/go-live-hint), VOUCHER is **usable queue -> detail** and **no longer hits the generic non-onboarding placeholder**; the onboarding + edit review panels AND queue rows are unregressed; no PII/redemptionPin shown.
- [ ] **Rollback notes:** admin-web-only; revert = revert the PR.
- [ ] **Stop-and-report triggers:** any backend contract mismatch (report, do not patch backend); scope creep beyond `apps/admin-web`.
- [ ] **Open PR-C** stacked on PR-A, PAUSE at the SHA-bound merge gate.

---

## Execution model

Per slice: fresh implementer subagent (TDD, explicit COMMIT step, scope-locked) -> fresh adversarial reviewer subagent (against the spec, this plan, live code, the prototype, the no-schema proof, the security invariants, the closed-scope exclusions, and the per-PR adversarial checklist). Fix confirmed blockers. Per PR: `/code-review` + Codex SHA-bound before the merge gate. Never merge without explicit SHA-bound owner approval; pause at each merge gate with PR URL, head SHA, exact files, CI status, review verdict, scope confirmation. Stop-and-report on any of the triggers above.

---

## Self-review (plan vs spec)

- **Spec coverage:** merchant Vouchers list page (B3) · voucher detail pages (B4) · create/edit-draft/submit/delete/duplicate (B5) · admin VOUCHER approval lane + queue enrichment (A4/A5/A8/A8b + C1/C2/C3/C4) · Model 1 approve-early/activate-delayed (A5 approve + A7 activation) · `VOUCHER_APPROVAL_UPDATE` in-app notifications via `safeNotify` with the required (dark) email payload (A6 + A7 now-live) · concierge admin-proposed + merchant apply-diff (A5 requestVoucherChanges + B6) · per-voucher redemption count + View-redemptions deep-link (A1 + A2 + B4) · no-schema proof + the two §11 honesty assumptions (A9). All mapped.
- **No-schema:** every task is additive endpoints/fields/UI over existing schema; A9 pins the two honesty assumptions; stop-and-report on any schema need.
- **Type consistency:** `redemptionCount` (A2 backend -> B1 client -> B3/B4 UI); `merchantFields.adminProposed`/`adminNote` (A5 write -> B6 read -> C2 write); the VOUCHER routes (A8) match the C1 client; `approvalStatus`/`status` derived display states consistent across B3/B4.
- **Placeholder scan:** none - each step has real code/tests or a concrete test list + the exact files.

---

**Next step:** owner review of this plan. On approval, execute PR-A -> PR-B -> PR-C subagent-driven (fresh implementer + fresh adversarial review per slice), opening each PR and pausing at its SHA-bound merge gate. No implementation until approved.

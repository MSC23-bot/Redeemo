# Day-2 Vouchers (Voucher Management) - Design Spec

**Status:** Draft (for owner review before the implementation plan)
**Tier:** 3 (new cross-surface backend flow: a VOUCHER approval lane + a concierge correction loop), plan-first, owner-gated per PR. NO schema.
**Date:** 2026-06-22
**Milestone goal:** Let a merchant manage vouchers end-to-end from the portal: see their flagship + custom vouchers, and create / edit / submit / duplicate custom (RCV) vouchers of all 7 customer-facing types. Submitted custom vouchers go through a real Redeemo admin review/approval lane (which the platform does not have today), with a concierge correction loop where the admin proposes field corrections the merchant accepts. Custom vouchers can be created and submitted from registration onward (pre-live), but never become customer-visible until the merchant is live and the mandatory flagship vouchers are live. All of this is no-schema and server-enforced.

**Predecessor:** M0-M4 are complete on main (`2e0015f4`). Day-2 Vouchers was chosen via the 2026-06-22 post-M4 reassessment + a full grill-me decision tree (every decision below was approved decision-by-decision).

---

## 0. Resolved decisions (grill-me, owner-approved)

| # | Decision | Outcome |
|---|---|---|
| Milestone | Scope | **Day-2 Vouchers, cross-surface** (backend + merchant-web + admin-web + a notification producer). **No schema.** |
| Model 1 | Pre-live approval | **Approve early, activation delayed.** `approvalStatus:APPROVED + status:PENDING_APPROVAL` = "approved, waiting for go-live". Activated server-side at onboarding-approve (after the flagship RMVs) or immediately for an already-live merchant. |
| Early creation | Lifecycle | Merchants can **create + submit custom vouchers from registration onward**, including pre-live. No minimum-onboarding gate on create/submit. |
| Customer visibility | Server gate | A custom voucher is customer-visible only when `status:ACTIVE + approvalStatus:APPROVED + merchant.status:ACTIVE` (the existing customer-query gate). Never auto-activated before the merchant + flagship are live. |
| Notifications | What fires | Server-side `VOUCHER_APPROVAL_UPDATE` on **Approved** (copy distinguishes already-live vs waiting), **Changes requested**, **Rejected**, and **Now-live** (only on the delayed pre-live to live activation). **No submit bell.** `referenceType:'voucher'`, `referenceId:voucherId`. Merchant email deferred. |
| Builder | Approach | **Reuse the validated `lib/voucher/*` logic** (config/terms/scoring/compose/typeMeta) + a **new decoupled day-2 builder UI** (all 8 types incl TIME_LIMITED + REUSABLE, RCV routes). Preserve the logic; improve the visual; do not drag in onboarding coupling. |
| Concierge | Admin help / corrections | **Admin proposes** corrected fields into `Voucher.merchantFields.adminProposed` + a note, sets the voucher `DRAFT/CHANGES_REQUESTED`, notifies. The merchant sees a **proposed-vs-current diff** and applies suggestions or edits further before resubmitting. The merchant's content is the source of truth until they accept. Comment-only request-changes still works. |
| Defaults | Module + states | List (flagship locked at top + custom grouped/filtered) · read-only detail · create/edit-draft/submit/delete · Duplicate (client-orchestrated) · View-redemptions deep-link · per-voucher count on detail. **Reject -> INACTIVE/REJECTED** (recoverable via Duplicate). **Flagship display-only/locked.** **Owner-only management** in v1. |
| Slice sequence | PRs | **PR-A backend enabler -> PR-B merchant-web -> PR-C admin-web** (PR-B/PR-C stack on PR-A). Fresh implementer + fresh adversarial reviewer + SHA-bound merge gate per PR. |

---

## 1. Verified current state (live-code cross-check)

| Capability | Live reality (cited) | Bucket / decision |
|---|---|---|
| Custom (RCV) CRUD | `src/api/merchant/voucher/routes.ts`: `GET/POST /api/v1/merchant/vouchers`, `GET/PATCH /:id` (DRAFT-only), `POST /:id/submit` (DRAFT->PENDING_APPROVAL), `DELETE /:id` (DRAFT-only). `service.ts` `EDITABLE_STATUSES=['DRAFT']`. | BUILD-NOW (backend done) |
| Voucher fields | `Voucher`: `status` (`VoucherStatus`: DRAFT/PENDING_APPROVAL/ACTIVE/INACTIVE/EXPIRED), `approvalStatus` (`ApprovalStatus`: PENDING/APPROVED/REJECTED/CHANGES_REQUESTED), `approvedBy?`, `approvedAt?`, `isRmv`, `merchantFields Json?`, `publishedAt?`, `expiryDate?`. Two independent state fields. | Foundation for Model 1 |
| Customer-visibility gate | Every customer voucher query filters `status:ACTIVE + approvalStatus:APPROVED + merchant.status:ACTIVE + isTestData:false` (`src/api/customer/discovery/service.ts` 335/985/1935/2778/...; defensive detail check 2455-2456). | The server gate Model 1 relies on |
| Custom voucher types | `VoucherTypeEnum` (`routes.ts`) = all 8 (BOGO/SPEND_AND_SAVE/DISCOUNT_FIXED/DISCOUNT_PERCENT/FREEBIE/PACKAGE_DEAL/TIME_LIMITED/REUSABLE). TIME_LIMITED windows + REUSABLE cooldown validated server-side. | BUILD-NOW (all types) |
| `listVouchers` | blind `findMany({where:{merchantId,isRmv:false}})`, no curated select, no `_count`. | PARTIAL: add `_count` + curated select (no schema) |
| custom `createVoucher` storage | writes TOP-LEVEL columns (title/estimatedSaving/description/terms/type/...); `status:DRAFT, approvalStatus:PENDING`. Does NOT write `merchantFields`. | PARTIAL: add a `merchantFields` bag to the custom create/update payload (column exists) for `askHelp` + `adminProposed` |
| Submit -> approval | `submitVoucher` flips status + audits only. **No `AdminApproval` row, no notify.** | NEEDS-BACKEND (PR-A): create/reopen `AdminApproval{type:VOUCHER}` |
| `ApprovalType.VOUCHER` | exists in the enum but is **unimplemented** in the actioner. `listApprovals` lists all types (enriches only MERCHANT_ONBOARDING). All actioner handlers (`approveApproval`/`rejectApproval`/`requestChanges`/`getReviewContext`) hard-gate on `type==='MERCHANT_ONBOARDING'` (else `APPROVAL_NOT_ACTIONABLE`); edit types dispatch to `editApplier`. `claimApproval`/`releaseApproval` are generic. | NEEDS-BACKEND (PR-A): a `voucherApprover` dispatched on `type==='VOUCHER'`, mirroring `editApplier` |
| Voucher activation | only the onboarding-approve path sets vouchers ACTIVE, and only `isRmv:true` (flagship): `updateMany({where:{merchantId,isRmv:true,status:{in:['PENDING_APPROVAL','ACTIVE']}}, data:{status:'ACTIVE',approvalStatus:'APPROVED',approvedBy,approvedAt}})` (`src/api/admin/approvals/service.ts:521`). **No code activates `isRmv:false` customs.** | NEEDS-BACKEND (PR-A): second `updateMany` in the same transaction for approved customs |
| Admin co-build precedent | B5.1 `updateRmvVoucherCore` is actor-aware (ADMIN+reason / MERCHANT_ADMIN); wired to admin route `admin/merchants/routes.ts:419 PATCH /:id/vouchers/:voucherId/rmv` ("admin co-build card") for flagship. | Precedent for the concierge admin-edit (custom needs its own no-schema proposal write) |
| Notification | approve/reject/changes fire `notify(recipientType:'MERCHANT_ADMIN', notificationType:'MERCHANT_VERIFICATION_UPDATE', referenceType:'merchant')`. `NotificationType.VOUCHER_APPROVAL_UPDATE` exists, **unused**. M4 bell consumes MERCHANT_ADMIN rows + deep-links via `resolveDestination`. | NEEDS-BACKEND (PR-A): a `VOUCHER_APPROVAL_UPDATE` producer (no schema; enum value exists) |
| redemptions filter | M3 list filters `branchId/status/from/to/voucherType/code` - **no `voucherId`**. Per-row already selects `voucher:{id,title,type}`. | PARTIAL: add a `voucherId` filter (one-line additive, no schema) |
| admin-web actioner | `apps/admin-web/app/(app)/queue/[id]/page.tsx` renders MERCHANT_ONBOARDING + `EditReviewPanel` (edit types) + a `NonOnboardingNotice` fallback - a current test asserts VOUCHER hits the fallback. | NEEDS-ADMIN-WEB (PR-C): a `VoucherReviewPanel` mirroring `EditReviewPanel` |
| merchant-web | no `/vouchers` route; `lib/api/voucher.ts` is flagship-only. M2 builder in `components/onboarding/vouchers/**` is coupled to onboarding. `lib/voucher/*` holds the pure logic. | NEEDS-MERCHANT-WEB (PR-B): the Vouchers module + RCV client + decoupled builder |
| `askHelp` toggle | persisted in the flagship `merchantFields` bag (`BuilderForm.tsx:290`, a Switch "Ask the Redeemo team to help with this offer"). | Reuse for custom (store in `merchantFields`) |
| CHANGES_REQUESTED reopen | onboarding "reopens the SAME approval on resubmit"; `ApprovalStatus.CHANGES_REQUESTED` ("merchant edits + resubmits, reopens the same approval"). | Mirror for the VOUCHER approval reopen |
| Type guards | `assertSavingSane` + `RMV_SAVING_COLUMN_MAX` rounding + string-type guards (the bridge); `updateVoucherSchema` = `.partial()` of `createVoucherSchema` (validates title string, estimatedSaving positive). | The merchant "apply adminProposed" path flows through this validated update |

---

## 2. Prototype cross-check (Claude Design - structure/flow first-class; visual not final)

Source-extracted from the prototype handoff (`/tmp/mp-handoff/.../Redeemo for Business.dc.html`); structure + behaviour are the anchors, visual execution is improved within the merchant-web design system.

| Prototype capability | M5 decision |
|---|---|
| Vouchers page: header + stat strip + Create button | BUILD (PR-B) |
| Flagship section pinned at top; "Always live, edits go to review, cannot be deleted" | BUILD display-only/locked (PR-B). Flagship live "request a change" DEFERRED |
| Custom vouchers grouped Live / In review / Draft / Finished + filters (All/Live/In review/Draft/Finished) | BUILD (PR-B), client-side from `status` (Live=ACTIVE, In-review=PENDING_APPROVAL, Draft=DRAFT, Finished=INACTIVE/EXPIRED). The prototype's `changes`/`changes_review`/`end_review`/`ended` sub-states map to (status, approvalStatus) combinations or are DEFERRED |
| Voucher row: type, status, value/summary, days-live/review-state, redemption count, action menu | BUILD (PR-B). Per-row redemption count DEFERRED (per-voucher count is on detail only) |
| Read-only detail (hero, customer preview, type-adaptive rows, terms, where-applies, how-redeemed) | BUILD (PR-B) from `getVoucher` |
| Create flow: type picker -> guided builder -> confirm | BUILD (PR-B), reuse `lib/voucher/*` logic + new UI |
| Action: Edit voucher (draft) | BUILD (PR-B), DRAFT-only |
| Action: View redemptions | BUILD (PR-B) via the new `voucherId` redemptions filter |
| Action: Duplicate | BUILD (PR-B), client-orchestrated |
| Action: Request a change (admin->merchant, with changed-fields / in-review / cancel) | BUILD as the **concierge correction loop** (PR-A backend + PR-B diff/apply + PR-C admin propose). The merchant-initiated change of a LIVE voucher is DEFERRED |
| Action: Request to end | DEFERRED (needs a lane/schema) |
| Action: Run again (lineage/runIndex) | DEFERRED (needs columns) |
| Per-voucher analytics/charts/totals/branch-breakdown/validated-rate | DEFERRED (Insights, aggregation) |
| Customer-preview / terms / where-applies (merchant-wide, "new branches inherit") | BUILD display (PR-B); vouchers are intentionally merchant-wide (no per-voucher branch model) |
| Role/lifecycle view-only collapse | BUILD owner-only gating (PR-B); branch-manager/staff variants DEFERRED (Staff & access unbuilt) |

---

## 3. Scope

### 3.1 In scope
- **PR-A backend enabler:** the VOUCHER approval lane (submit creates/reopens `AdminApproval{VOUCHER}`; `voucherApprover` approve/reject/request-changes; review context; actioner type-dispatch); Model 1 activation (onboarding-approve extension + immediate-for-live-merchant); the `VOUCHER_APPROVAL_UPDATE` producer; the concierge `merchantFields.adminProposed` write + the `askHelp`/`merchantFields` custom-create support; the two thin additives (`voucherId` redemptions filter, `_count` on the voucher lists).
- **PR-B merchant-web:** the merchant-facing **Vouchers module page + voucher detail pages** (see §3.3) + the decoupled day-2 builder + create/edit-draft/submit/delete + duplicate + the approved-waiting display + the concierge proposed-vs-current diff/apply. Owner-only management.
- **PR-C admin-web:** the VOUCHER review panel + queue enrichment + the action bar (claim/approve/reject/request-changes-with-proposed-corrections).

### 3.2 Out of scope (deferred - see section 10)
Live-voucher change-request lane (`VoucherPendingEdit` schema) · flagship live "request a change" · request-to-end · run-again + lineage · rich per-voucher analytics/charts/per-row totals · merchant email producer · branch-manager/staff role-gated management.

### 3.3 Merchant-facing Vouchers module + detail (explicit, PR-B)
This milestone explicitly includes the merchant-facing Vouchers UI:
- **Vouchers list page** (`app/(app)/vouchers/page.tsx`): **flagship vouchers pinned/locked at the top** (read-only), then **custom vouchers grouped + filterable by status** - Live (`ACTIVE`), In review (`PENDING_APPROVAL`), Draft (`DRAFT`), Finished (`INACTIVE`/`EXPIRED`), and a "Rejected" grouping (`INACTIVE` + `approvalStatus:REJECTED`). Filters: All / Live / In review / Draft / Finished. A header stat strip (totals) + the "Create a voucher" action.
- **Clickable rows/cards -> a voucher detail page** (`app/(app)/vouchers/[id]/page.tsx`), available for **every safe state** the backend can represent (live, approved-waiting, in review, draft, changes-requested, rejected, inactive/expired). Suspended/in-review lifecycles render read-only.
- **Detail page shows safe core voucher information only:** title, type, status (incl. the approved-waiting and changes-requested derived states), description, saving/amount, terms, the customer-preview card, "where it applies" (merchant-wide), submission/review state (incl. the concierge proposed-vs-current diff when `CHANGES_REQUESTED`), and a **per-voucher redemption count + "view redemptions" deep-link** (the no-schema `_count` + `voucherId`-filter additives). No customer PII, no `redemptionPin`.
- **Custom voucher actions:** create / edit-draft / submit-for-review / delete-draft / duplicate (client-orchestrated) + apply-Redeemo-suggestions (concierge).
- **Explicitly DEFERRED on the detail/list (recorded in §10):** per-row redemption totals on the list; per-voucher analytics/charts/trends/branch-breakdown/validated-rate; the live-voucher "request a change" / "request to end" / "run again" row actions; the prototype `ended`-vs-`expired` and `end_review`/`changes_review` sub-states beyond what (status, approvalStatus) can represent.

---

## 4. Architecture: Model 1 + the customer-visibility gate

### 4.1 The two-field state model (no schema)
A custom voucher's lifecycle uses the two existing independent fields:
- **submitted:** `status:PENDING_APPROVAL, approvalStatus:PENDING`
- **approved, waiting for go-live (pre-live merchant):** `status:PENDING_APPROVAL, approvalStatus:APPROVED` (+ approvedBy/approvedAt). **Not customer-visible** (customer queries require `status:ACTIVE`).
- **approved + live:** `status:ACTIVE, approvalStatus:APPROVED`. Customer-visible.
- **changes requested:** `status:DRAFT, approvalStatus:CHANGES_REQUESTED` (+ optional `merchantFields.adminProposed`).
- **rejected:** `status:INACTIVE, approvalStatus:REJECTED`.

### 4.2 Activation (server-side, two triggers)
- **At merchant go-live:** the existing onboarding-approve transaction, immediately after it activates the flagship RMVs, runs a second `updateMany({where:{merchantId,isRmv:false,approvalStatus:'APPROVED',status:'PENDING_APPROVAL'}, data:{status:'ACTIVE'}})`. Both prerequisites (merchant live + flagship live) are satisfied by construction in that one transaction. Fires a `now-live` notification per activated voucher.
- **For an already-live merchant:** `voucherApprover.approve` sets the voucher straight to `status:ACTIVE, approvalStatus:APPROVED` (the merchant + flagship are already live), and the `approved` notification copy reads "approved and now live".

### 4.3 The approval lane (PR-A, mirrors the Option B `editApplier` pattern)
- `submitVoucher` (RCV): on submit, in addition to the status flip, **create or reopen** an `AdminApproval{type:'VOUCHER', referenceId:voucherId, referenceType:'voucher', status:PENDING}` (reopen the same row on resubmit-after-changes, like onboarding).
- `voucherApprover.ts` (new, beside `editApplier.ts`): `getVoucherReviewContext`, `approveVoucher`, `rejectVoucher`, `requestVoucherChanges`. The actioner routes dispatch to it when `approval.type==='VOUCHER'` (mirroring the edit-type dispatch). `claimApproval`/`releaseApproval` already work generically.
- All four write audit logs and (approve/reject/changes) fire the `VOUCHER_APPROVAL_UPDATE` producer.

### 4.4 The concierge correction loop (no schema)
- `requestVoucherChanges` accepts an optional structured `proposed` object + a `note`. It writes `merchantFields.adminProposed = {<changed fields>}` + `merchantFields.adminNote`, sets the voucher `status:DRAFT, approvalStatus:CHANGES_REQUESTED`, the `AdminApproval` to `CHANGES_REQUESTED`, audits, notifies. With no `proposed`, it is a plain comment-only changes request.
- The merchant-web builder, opening a `CHANGES_REQUESTED` voucher, renders the proposed-vs-current diff (from `merchantFields.adminProposed` vs the live columns) with "Apply Redeemo's suggestions" (writes the proposed values into the form) and free editing. On resubmit, the merchant's normal `PATCH` (`updateVoucherSchema`, validated) persists the accepted values; `merchantFields.adminProposed` is cleared; submit reopens the approval.
- **Editable `adminProposed` field set:** `title, description, terms, estimatedSaving`, plus `availabilityWindows` (TIME_LIMITED) and `cooldownSeconds` (REUSABLE), and any relevant structured fields the builder composes. Values are only ever applied through the validated `updateVoucher` path (type-guarded).

---

## 5. No-schema proof

Every piece reuses existing schema:
1. **Approved-waiting state** = `approvalStatus:APPROVED + status:PENDING_APPROVAL` - both existing enum fields; no new value, no new column.
2. **Customer visibility** = the existing customer-query gate (`status:ACTIVE + approvalStatus:APPROVED + merchant ACTIVE`) - excludes the waiting state with zero new code.
3. **Activation** = a second `updateMany` in the existing onboarding-approve transaction - additive query, no schema; no-op until approved customs exist.
4. **The approval lane** = `AdminApproval{type:VOUCHER}` (the `VOUCHER` enum value already exists; `referenceId`/`referenceType`/`status`/`claimedById`/`adminUserId` all exist) + a `voucherApprover` mirroring the existing `editApplier`.
5. **Concierge proposed edits** = `Voucher.merchantFields` (an existing `Json?` column, already used by the flagship bridge) holding `adminProposed` + `adminNote`. Merchant accept = a normal validated `updateVoucher` PATCH.
6. **`askHelp` + custom `merchantFields`** = add a `merchantFields` field to the custom create/update payload, stored in the existing `Voucher.merchantFields Json?` column.
7. **Notifications** = `NotificationType.VOUCHER_APPROVAL_UPDATE` (existing enum value), `referenceType:'voucher'` - no schema; M4 bell already consumes MERCHANT_ADMIN rows.
8. **The two thin additives** = a `voucherId` filter on the redemptions Zod + where, and `_count`/curated select on the voucher lists - query-only, no schema.

**If, during implementation, any of these is found to need a column/enum/migration, STOP and report (see section 11).**

---

## 6. Security invariants (server-side, test-pinned)

1. **Merchant can never set `ACTIVE` or `APPROVED`.** Merchant voucher routes only create-DRAFT / edit-DRAFT / submit(->PENDING_APPROVAL) / delete-DRAFT; no merchant route writes `status:ACTIVE` or `approvalStatus`. The create/update payloads must reject/ignore client-supplied `status`/`approvalStatus`/`approvedBy`/`isRmv`/`merchantId` (server sets them).
2. **Activation + approval are admin/server only.** `status:ACTIVE`/`approvalStatus:APPROVED` are set only by the admin-authenticated `voucherApprover` and the onboarding-approve transaction.
3. **Customer queries return only approved-live vouchers** - already enforced; the waiting state is excluded; PR adds no customer-side code that could leak it.
4. **Admin authority required** - the VOUCHER actioner handlers live under the admin plugin (`authenticateAdmin`) + the existing `approval:action` capability.
5. **Merchant scoping on every voucher route** - `resolveAdminMerchant(req.user.sub)`; a cross-merchant voucher id yields not-found.
6. **`adminProposed` is a proposal with no live effect** - applied only via the merchant's validated `updateVoucher`; the admin write is server-side + audited.
7. **Type guards before applying any proposed value** - the validated `updateVoucher`/`createVoucher` path (string fields, `assertSavingSane`, the Decimal rounding guard) is the only write path; `adminProposed` is never blind-spread into columns.
8. **Audit logs** on submit (approval created/reopened), approve, reject, request-changes, and activation.
9. **Notifications produced server-side from real state transitions** - never from UI state.
10. **No PII / redemptionPin** in any voucher or review payload (curated selects).

---

## 7. Deferred set (recorded, not dropped)

| Item | Why | When |
|---|---|---|
| Live-voucher change-request lane (edit an ACTIVE voucher) | needs a `VoucherPendingEdit` model + status lane | follow-up (schema) |
| Flagship live "request a change" | same lane | follow-up (schema) |
| Request-to-end a live voucher | needs an end/deactivate review lane | follow-up (schema) |
| Run-again (re-run a finished voucher) | needs `runLineage`/`runIndex` columns | follow-up (schema) |
| Rich per-voucher analytics/charts/totals + per-row redemption totals + branch breakdown + validated-rate | aggregation; `VoucherRedemption` has no `merchantId` | Insights (Tier-3) |
| Merchant email on voucher decisions | email dark (provider go-live gated) | notification-email slice |
| Branch-manager / staff role-gated voucher management | capability model unbuilt | Staff & access milestone |

---

## 8. Stop-and-report triggers

Halt and report (with exact SQL + rollback + rationale) if any of these is hit:
- Any schema/migration is found necessary (a new column/enum value/model) for the in-scope items above.
- The `voucherApprover` cannot dispatch without changing the MERCHANT_ONBOARDING or pending-edit (`editApplier`) lanes' behaviour.
- The onboarding-approve activation extension cannot be made a strict no-op for existing flows (regression to M2/RMV approval).
- The customer-visibility gate is found NOT to require `status:ACTIVE` on some path (a visibility leak risk for the waiting state).
- The concierge `adminProposed` cannot be applied through a validated path (a type-safety/injection risk).
- Any merchant route can be made to set `ACTIVE`/`APPROVED` server-side.

---

## 9. PR sequence + execution model

- **PR-A (backend enabler)** off `main`: the approval lane + activation + producer + concierge `adminProposed` write + custom `merchantFields`/`askHelp` + the `voucherId` filter + `_count`. Backend-only. Owner-gated SHA-bound merge gate.
- **PR-B (merchant-web)** stacked on PR-A: the `/vouchers` module + decoupled builder + concierge diff/apply. May sub-split (page/list -> builder -> concierge) if it grows.
- **PR-C (admin-web)** stacked on PR-A: the `VoucherReviewPanel` + queue enrichment + action bar.
- Per PR: fresh implementer subagent + fresh adversarial reviewer subagent (no self-certify); `/code-review` + Codex SHA-bound before each merge; cross-check against live code, this spec, the prototype, the no-schema proof, and the security invariants; never merge without SHA-bound owner approval; pause at each merge gate.

---

## 10. Testing strategy (per PR)

- **PR-A (backend, vitest):** submit creates/reopens the VOUCHER approval; approve sets approvalStatus APPROVED + status ACTIVE-only-if-live else PENDING_APPROVAL; the onboarding-approve activation extension flips approved customs to ACTIVE (and is a no-op with none); reject -> INACTIVE/REJECTED; request-changes writes `merchantFields.adminProposed` + sets DRAFT/CHANGES_REQUESTED; the VOUCHER_APPROVAL_UPDATE producer fires on each decision + on now-live; merchant routes cannot set ACTIVE/APPROVED (rejected/ignored); cross-merchant scoping; the customer-visibility gate excludes the waiting state; the `voucherId` filter + `_count`; the actioner dispatch does not regress MERCHANT_ONBOARDING / edit lanes.
- **PR-B (merchant-web, jest/RTL):** list/grouping/filters; flagship locked; create/edit-draft/submit/delete via the decoupled builder (all 8 types); duplicate (prefill->create DRAFT); detail read incl per-voucher count; the concierge diff renders proposed-vs-current and "apply" writes the form; view-redemptions deep-link; owner-only gating; no `status:ACTIVE` settable from the client.
- **PR-C (admin-web, jest/RTL):** the queue lists VOUCHER rows; the `VoucherReviewPanel` renders the voucher + customer preview; approve/reject/request-changes-with-proposed-corrections call the right endpoints; does not break onboarding / edit review panels.
- Gates: backend `vitest` + merchant-web `jest` + admin-web `jest` green; `tsc --noEmit` clean per app; dash-clean; scope-clean per PR.

---

## 11. Open questions / self-review

- **Prototype `changes_review`/`end_review`/`ended`-vs-`expired` sub-states** are richer than the backend enum; M5 maps what it can to (status, approvalStatus) and DEFERS the rest (end/run-again). The plan should pin the exact status-to-display mapping.
- **`adminProposed` structured fields** beyond title/description/terms/estimatedSaving/windows/cooldown: the plan confirms the exact composable field set per voucher type from `lib/voucher/*`.
- **Duplicate** is client-orchestrated (no route) - confirmed; the plan pins the prefill mapping.
- **Assumptions to verify in the plan (honesty notes on the no-schema model):** (1) the "approved-waiting" state is the NEW combination `status:PENDING_APPROVAL + approvalStatus:APPROVED`; the plan must add a regression check that **no existing query assumes `PENDING_APPROVAL` implies `approvalStatus:PENDING`** (customer queries gate on `status:ACTIVE` so they are safe; merchant edit/submit/delete gate on `status:DRAFT` so an approved-waiting voucher is correctly immutable to the merchant; verified, but pin it). (2) the **admin actionable queue must key "needs review" off the `AdminApproval.status` (PENDING/CLAIMED), NOT the voucher status**, so an approved-waiting voucher (its `AdminApproval` is `APPROVED`) never re-surfaces as actionable. Both are plan-verification items; if either turns out to need a new status value or column, that is a **stop-and-report** (section 8).
- **Self-review:** every section maps to an owner-approved decision; the no-schema proof covers each backend touch-point; the security invariants are server-side + test-pinned; the deferred set is explicit; no placeholders; the only schema-bearing ideas (live change-request, request-to-end, run-again, analytics) are deferred with their re-entry path; the cross-surface scope is decomposed into PR-A/B/C, each independently reviewable.

---

**Next step:** owner review of this spec. On approval, the Tier-3 implementation plan (`docs/superpowers/plans/2026-06-22-merchant-web-day2-vouchers.md`) will break PR-A/B/C into bite-sized slices. No implementation code, schema, or PRs until the plan is approved.

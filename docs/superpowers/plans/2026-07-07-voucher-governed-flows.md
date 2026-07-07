# Plan + Decision Packet: Voucher Governed Flows (flagship + custom lifecycle)

Status: APPROVED (owner, 2026-07-07): D1 = ONE shared pipe (`VoucherPendingEdit` + kind CHANGE|END + single `ApprovalType VOUCHER_EDIT`); D2 = withdraw-submission is INSTANT self-service back to draft while pending; D3 = ADD `ApprovalStatus.WITHDRAWN` (not Rejected-reuse); D4 = CONFIRMED end is custom-only, flagship never endable by merchants; D5 = "Run this again" DEFERRED to a later separate slice. Safety model: schema/migration = local-dev only (staging/prod migration needs separate approval); unmerged PRs; reuse existing approval patterns; Opus adversarial review on the new lane. Tier-3.
Owner direction (2026-07-07): build toward the prototype; flagship interactive but no direct edit/delete/remove (governed review); custom live/destructive changes go through a request/governed flow. This packet resolves *how*, then a staged build follows.

## 0. Why this is a decision, not a build
The voucher features the prototype shows split into: some that are buildable now with no schema (per-voucher analytics; flagship interactivity wiring), and some that need a **new data model + approval type** (the governed "request a change" / "request to end" lanes). Per the Tier-3 rule and the owner's "queue the schema/product decision rather than guess," the schema shape is settled here first.

## 1. Current-state findings (source-verified 2026-07-07)
- **Flagship edits do NOT go through review today.** `updateRmvVoucherCore` (`src/api/merchant/voucher/service.ts:763-799`) is DRAFT-only (`status !== 'DRAFT'` -> `VOUCHER_NOT_EDITABLE`); it never creates an `AdminApproval`. Once a flagship is ACTIVE it is entirely uneditable. "Request a change" is net-new end-to-end.
- **The admin `AdminApproval{type:'VOUCHER'}` lane is first-submission-only** (`voucherApprover.ts`), state machine flips DRAFT<->PENDING_APPROVAL; incompatible with a live-voucher change-request (voucher must stay ACTIVE while reviewed). Reusing it would conflate two state machines.
- **The reusable template is Option B's `editApplier.ts`**: per-entity `*PendingEdit` model + a dedicated `ApprovalType` + `approveEdit`/`rejectEdit`/`getEditReviewContext` dispatched on `approval.type`, applying only an allow-list (`pickAllowed`, never blind-spread). Merchant writer half = `createMerchantEditRequestCore`; self-service withdraw precedent = `withdrawMerchantEditRequest` (flips own PENDING edit to WITHDRAWN, no admin).
- **Custom-voucher end**: no merchant-triggered deactivation of an ACTIVE custom voucher exists anywhere. `VoucherStatus` enum already has INACTIVE (no enum change needed for "ended").
- **Withdraw submission**: `ApprovalStatus` enum has NO `WITHDRAWN` value (unlike `PendingEditStatus` which does).
- **Per-voucher analytics**: NO schema change needed. `VoucherRedemption` already carries `voucherId/branchId/userId/redeemedAt/isValidated/estimatedSaving`; reuse `insights/london.ts` TZ bucketing scoped to one voucherId + the `isTestData` exclusion convention.

## 2. Decisions needed (Fable recommendation in bold)
- **D1 - One model vs two.** `VoucherPendingEdit` with a `kind: CHANGE | END` discriminator for BOTH flagship-change and custom-end, **vs** two models/approval types.
  **Recommend: ONE shared `VoucherPendingEdit` (kind CHANGE/END)** + one `ApprovalType = VOUCHER_EDIT`. B and C share ~90% of the writer/applier/queue-row shape; a kind discriminator in the applier ('CHANGE' applies allow-listed fields, 'END' sets status INACTIVE) is minimal + honest. Splitting doubles the surface for little gain.
- **D2 - Withdraw semantics.** Self-service-immediate (merchant pulls back their OWN not-yet-reviewed submission, no admin) **vs** governed-through-admin.
  **Recommend: SELF-SERVICE-IMMEDIATE.** The prototype (vouchers-11) shows a plain one-click kebab item next to "Duplicate" (no reason field); the `withdrawMerchantEditRequest` precedent is exactly this; you are withdrawing your own PENDING submission, not a live/destructive change. (Decision-5's "governed" wording targets live/destructive changes; a withdraw of your own pending submission is neither.)
- **D3 - Withdraw status signal.** Add `WITHDRAWN` to `ApprovalStatus` **vs** reuse `REJECTED` + comment marker.
  **Recommend: ADD `WITHDRAWN`** (small additive enum) - honest signal in the admin queue/audit, consistent with the existing `PendingEditStatus.WITHDRAWN`. (This is the only enum change; the model addition is D1.)
- **D4 - End scope.** Confirm "request to end" applies ONLY to custom (isRmv:false) vouchers; flagship can never be ended (business rule #6: mandatory RMVs, non-deletable).
  **Recommend: YES, custom-only.** The applier's END branch must reject `isRmv:true`.
- **D5 - "Run this again" (vouchers-9).** The prototype shows a "Run this again" affordance on finished/expired vouchers. It was NOT in the five owner decisions.
  **Recommend: OUT OF SCOPE for this build** (treat as a separate later item - it is a re-activate/duplicate-to-draft flow, distinct from the governed lanes). Confirm.

## 3. Schema additions (only if D1/D3 approved as recommended) - Tier-3, migration required
- New model `VoucherPendingEdit { id, voucherId, merchantId, kind (CHANGE|END), proposedChanges Json, reason String?, status PendingEditStatus, reviewedBy String?, reviewNote String?, createdAt, reviewedAt }` (mirrors `MerchantPendingEdit`/`BranchPendingEdit`). Index `[voucherId, status]`.
- New `ApprovalType = VOUCHER_EDIT` (single type, dispatched by the applier on `approval.type`, then branched on `VoucherPendingEdit.kind`).
- Add `WITHDRAWN` to `ApprovalStatus` enum (D3).
- NO change to `VoucherStatus` (INACTIVE already exists), no change to `VoucherRedemption`.
- Migration applied to LOCAL dev DB only during build; staging/prod via normal `prisma migrate deploy` (owner/deploy-gated, NOT done autonomously).

## 4. Staged build plan (post-decision)
- **Slice E - per-voucher analytics (NO schema, buildable independent of decisions).** New read module scoped to voucherId (redemptions-over-time, when/where used, confirmed-in-person, distinct customers, total saved), reuse `insights/london.ts` + `isTestData` exclusion. New route `GET /vouchers/:id/analytics` (or fold into flagship detail read). Frontend charts reuse Insights primitives. CAN SHIP BEFORE the schema decision.
- **Slice A - flagship interactivity (frontend, needs E + B).** `VouchersList.tsx` pass `onOpen`+`actions` for flagship rows (card machinery already generic); flagship detail page (analytics from E + View-redemptions + Duplicate); kebab "Request a change" -> B.
- **Slice B - flagship "request a change" (governed, needs schema).** Merchant writer mirrors `createMerchantEditRequestCore` (allow-list = the RMV template's `allowedFields`), creates `VoucherPendingEdit{kind:CHANGE}` + `AdminApproval{type:VOUCHER_EDIT}` atomically, one-pending guard; admin applier = extend `editApplier.ts` with a 'voucher' kind (pickAllowed onto Voucher columns); admin-web queue diff reuses `EditReviewPanel`. Voucher stays ACTIVE while reviewed.
- **Slice C - custom "request to end" (governed, needs schema).** Same writer/applier, `kind:END`, mandatory reason, applier flips ACTIVE->INACTIVE on approve, rejects isRmv:true (D4).
- **Slice D - withdraw submission (self-service if D2).** New merchant route `POST /vouchers/:id/withdraw` - require PENDING_APPROVAL, flip to DRAFT, flip the `AdminApproval{VOUCHER}` row to WITHDRAWN (D3). No admin. (Independent of the VoucherPendingEdit model.)
- **Adversarial review**: Opus pass on the new approval lane (allow-list can't write non-permitted fields; END can't touch flagship; withdraw can't affect a claimed/actioned row; atomic; audit correctness) before returning for merge.

## 5. Order + what ships when
1. Slice E (no schema) can ship first as an unmerged PR even before decisions - queued now if useful.
2. On D1-D5 approval: schema migration (local dev) + Slices A/B/C/D + Opus review, returned as unmerged PR(s) for SHA-bound approval.

## 6. Boundaries respected
No provider/DB/deploy; migration only to local dev during build; no staging/prod migrate; no auto-merge; the schema decision (D1/D3) is queued here, not guessed.

## 7. As-built addendum: backend core (this PR, 2026-07-07)
Implements the BACKEND half of slices B + C + D (schema, merchant writer, admin applier); frontend
(merchant-web + admin-web) are separate follow-on PRs. Slice E (per-voucher analytics) shipped earlier (#408).
- Schema (migration `20260707135148_voucher_governed_flows`, LOCAL dev DB only): enum `VoucherEditKind {CHANGE END}`;
  model `VoucherPendingEdit` (+ `Voucher.pendingEdits` / `Merchant.voucherPendingEdits` back-relations,
  indexes `[voucherId,status]` + `[merchantId,status]`); `ApprovalType += VOUCHER_EDIT`; `ApprovalStatus += WITHDRAWN`.
- Merchant writer (`src/api/merchant/voucher/`): `POST /vouchers/rmv/:id/request-change` (LIVE flagship only;
  allow-list = RmvTemplate.allowedFields ∩ [title, description, estimatedSaving, terms, imageUrl]; mandatory reason;
  one-PENDING guard), `POST /vouchers/:id/request-end` (LIVE custom only, D4 flagship rejected; mandatory reason),
  `POST /vouchers/:id/withdraw` (D2 instant: PENDING_APPROVAL custom -> DRAFT + open VOUCHER approval -> WITHDRAWN;
  approved-waiting NOT withdrawable), `POST /vouchers/pending-edits/:id/withdraw` (edit + its approval -> WITHDRAWN).
  Reads (custom list/detail + flagship list) gain a curated `pendingEdit` summary.
- Admin applier: `editApplier.ts` extended with kind `voucher` (CHANGE applies pickAllowed fields with the
  saving/type guards; END re-verifies isRmv:false + ACTIVE then flips INACTIVE); review context returns the
  current-vs-proposed diff + kind + reason + voucher identity; claim/release audit resolution added
  (VOUCHER_EDIT -> real voucher id, entityType 'voucher'). Capabilities unchanged
  (`approval:apply-edit` / `approval:read`). WITHDRAWN is terminal by construction (allow-list guards).
- Deviation from §4 slice D as written: withdraw-submission additionally refuses an approved-waiting voucher
  (approvalStatus APPROVED / no open approval row) — an already-reviewed submission has nothing to pull back.

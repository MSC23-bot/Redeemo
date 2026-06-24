# PR-4 mini-spec: Opening Hours 2-hour customer cool-off

Status: DRAFT for owner + Codex review. Docs-only. No implementation until approved.

Programme: Merchant Portal Branches (PR-1 to PR-8). Source of truth: `docs/superpowers/specs/2026-06-23-merchant-web-branches-programme-design.md` (umbrella, D1 to D9) + `docs/superpowers/plans/2026-06-23-merchant-web-branches-pr1-surface-spine.md` (PR-1) + `docs/superpowers/plans/2026-06-23-merchant-web-branches-pr3-photos-mini-spec.md` (PR-3 mini-spec pattern).

Locked decision being implemented: D4. "Opening-hours 2-hour cool-off built as its own schema/governance slice using a durable pending/staging model. The merchant edits hours, which creates a pending staging record holding the proposed hours plus `effectiveAt = now + 2h`. The UI shows the pending change and when it goes live; the merchant can cancel/withdraw before `effectiveAt`. Customer reads continue using the live `BranchOpeningHours` until promotion; a delayed worker/job promotes after `effectiveAt`. Multi-window remains a separate later slice. No delayed-job-only without a durable record."

This mini-spec is grounded in a five-subsystem live-code inspection (backend hours model/writer/validator; customer `isOpenNow`; queue/worker infra; merchant-web surface + authz; admin-involvement + migration). Where the inspection corrected an assumption, it is called out inline.

BASELINE NOTE (read before checking any anchor): all live-code file:line anchors in this mini-spec are against the PR-1/PR-2/PR-3 STACK (PRs #309 surface-spine, #310 BM-scoped writes, #313 photos), NOT `main`. PR-4 stacks on top of that stack (section 13), so the stack tip is its real baseline. Specifically: `assertCanManageBranch` (src/api/merchant/shared.ts:161) and the `setAmenities` migration to `resolveMerchantContext + assertCanManageBranch` (src/api/merchant/branch/service.ts:808-809) land in PR-2 (#310) and do NOT exist on `main` yet; the merchant-web `OpeningHoursCard`/`PendingEditsList`/`LockedAffordance` files land in PR-1 (#309) and are not on `main` yet; and the stack adds code that shifts `service.ts` line numbers up versus `main` (e.g. `setOpeningHours` is at 770 on the stack vs ~553 on `main`). A reviewer must resolve anchors against the stack tip (`feat/merchant-web-branches-pr3-photos`), not `main`, or they will read as fabricated. Verified against the stack tip: `assertCanManageBranch` at shared.ts:161; `setOpeningHours` at service.ts:770 (still OWNER-only `resolveAdminMerchant`); `setAmenities` at service.ts:799 (already on `assertCanManageBranch`, the precedent PR-4 mirrors).

---

## 1. Live-code reality (what exists today)

- Live storage: `BranchOpeningHours` (prisma/schema.prisma:578-589). Single period per day, enforced by `@@unique([branchId, dayOfWeek])`. Fields: `id`, `branchId`, `dayOfWeek Int` (0=Sun..6=Sat), `openTime String?`, `closeTime String?` (both `HH:MM` strings, NOT DateTime), `isClosed Boolean @default(false)`. Closed day = `isClosed:true` + null times. `onDelete: Cascade` from `Branch`.
- Writer: `setOpeningHours` (src/api/merchant/branch/service.ts:770-797). Today it is INSTANT-APPLY: (1) `validateOpeningHours(hours)`; (2) `resolveAdminMerchant(prisma, adminId)` (OWNER-ONLY); (3) `resolveBranch(prisma, branchId, merchantId)` (filters `deletedAt:null`, must belong to merchant); (4) `Promise.all` of `prisma.branchOpeningHours.upsert` keyed on `branchId_dayOfWeek`, one per day; (5) returns `{ ok: true }`. The change is live and customer-visible immediately.
- Validator: `validateOpeningHours` (src/api/merchant/branch/openingHours.ts:48). Pure, IO-free, single-period-per-day. Rules: `dayOfWeek` integer 0-6; duplicate-day reject; closed day must carry no times; open day requires BOTH times; `openTime` must match `/^([01]\d|2[0-3]):[0-5]\d$/` (so `24:00` is NOT a valid open); `closeTime` allows `HH:MM` OR the `24:00` sentinel; `open === close` (zero-length) reject; overnight `close < open` is ACCEPTED. Throws `AppError('OPENING_HOURS_INVALID')` (400). Reusable verbatim for the staged payload.
- Route: `POST /api/v1/merchant/branches/:id/hours` (src/api/merchant/branch/routes.ts:136-142). Zod `openingHoursBody` (routes.ts:55-62): `{ hours: Array<{ dayOfWeek: 0-6, openTime?: string, closeTime?: string, isClosed: boolean }> }`. Calls `setOpeningHours(app.prisma, req.user.sub, id, hours)`.
- Customer read: `isOpenNow` (src/api/shared/isOpenNow.ts:16). Pure, server-side, Europe/London (Intl en-GB numeric+weekday parts). Reads ONLY today's row (`hours.find(h => h.dayOfWeek === dayOfWeek)`, line 36) and returns `nowMins >= openMins && nowMins < closeMins` (line 46). Consumed by customer discovery (src/api/customer/discovery/service.ts:1220, 2065, 2191, 2372, 2896) and favourites (src/api/customer/favourites/service.ts:116, 507), always against the LIVE `branch.openingHours` relation. The customer app consumes the server boolean verbatim (apps/customer-app `smartStatus.ts:73` takes `isOpenNow` as input; `useOpenStatus.ts` reads `selectedBranch.isOpenNow`; `londonNow.ts` supplies only day/minute for highlighting). There is NO staging field in any customer select.
- Queue/worker infra: BullMQ ^5.78.0 on a SHARED Redis (`ioredis`, `maxRetriesPerRequest:null`, `noeviction` operational requirement). Queues: `EMAIL_QUEUE`, `MAINTENANCE_QUEUE`, `MODERATION_QUEUE` (src/api/queues/index.ts). Dedicated worker process `src/worker.ts` (Procfile `worker: node dist/src/worker.js`). At boot the worker registers TWO `MAINTENANCE_QUEUE` repeatables: `scheduleReconcile()` (outbox reconcile, every 60s) and `scheduleClaimStaleSweep()` (claim-stale, hourly, PR #243). ONE worker (`startReconcileWorker`, src/api/queues/processors/outboxReconciler.ts:115) dispatches by `job.name`. `claimStaleSweep.ts` is the durable-sweep reference: pure `sweepStaleClaims(prisma, now)`, index-backed bounded `findMany`, DB-timestamp dedup, per-row try/catch. `enqueue(name, data, opts)` (index.ts:75) accepts arbitrary `JobsOptions` (so `{ delay, jobId }` is supported), but NO per-record delayed job exists in the repo yet.
- Merchant-web surface: `apps/merchant-web/components/branches/sections/OpeningHoursCard.tsx`. Renders the read-only Mon..Sun table + London Today highlight. The Edit control is a DISABLED `LockedAffordance` (line 88) and the multi-window control is a disabled affordance (line 124). The "2 hour customer cool off" chip is OMITTED ENTIRELY (comment lines 9-12: cool-off ships in PR-4, must not render even statically). `PendingEditsList.tsx` is the existing pending-banner + owner Withdraw pattern (for identity edits). `lib/api/branch.ts` has `branchSchema.openingHours` + `setBranchHours -> POST /branches/:id/hours` but NO pending-hours schema and NO `useSetBranchHours` hook (hours editing was never wired). `apps/merchant-web/components/onboarding/branch/lib/hoursModel.ts` is a reusable client single-window model/validator.
- Admin lane: `BranchPendingEdit` (schema.prisma:625-642) + an `AdminApproval` row (`type BRANCH_IDENTITY_EDIT`) actioned via `editApplier.ts` is the ADMIN-REVIEWED lane, scoped to identity fields + photos. `editKindOf` (editApplier.ts:52) handles only `MERCHANT_IDENTITY_EDIT`/`BRANCH_IDENTITY_EDIT`; the `ApprovalType` enum (schema.prisma:1493) has NO hours value. Nothing routes hours through `AdminApproval`.
- Onboarding: the onboarding service + routes have ZERO references to opening hours (grep-verified). Onboarding never writes hours through any path; `setOpeningHours` is the sole writer. (Seed scripts write `branchOpeningHours` directly via Prisma, bypassing the service.)

Two assumptions in the task prompt are corrected by the live code:
- CORRECTION 1 (authz): the prompt says PR-4 authz "is" `assertCanManageBranch`. Today `setOpeningHours` uses OWNER-only `resolveAdminMerchant` (service.ts:783). PR-4 must MIGRATE it to `resolveMerchantContext + assertCanManageBranch`. This is a deliberate behaviour change (assigned BRANCH_MANAGERs newly gain hours-edit), consistent with `setAmenities` (already on `assertCanManageBranch`, service.ts:808-809) and with D3 ("a Branch Manager may edit opening hours once the 2-hour cool-off slice exists").
- CORRECTION 2 (schema): PR-4 CANNOT be no-schema. There is no pending-hours model and no `effectiveAt` field anywhere. A net-new additive Prisma model + migration is required.

---

## 2. Prototype behaviour being targeted

Prototype `03-branch-detail-map-contact-hours.png`: the opening-hours card carries a "2 hour customer cool off" chip. PR-1 deliberately omits this chip (the behaviour is not live). PR-4 makes the chip a live behaviour: a merchant edits hours; the edit does NOT go live immediately; a pending change is shown with its go-live time; the merchant can cancel before it goes live; customers keep seeing the current live hours until the change promotes 2 hours later.

---

## 3. Schema change (additive, net-new) - REQUIRED, flagged for owner

New model `BranchOpeningHoursPending` (additive; NO change to `BranchOpeningHours`, which keeps its single-window `@@unique`). Holds ONE proposed weekly single-window schedule per outstanding change:

```prisma
model BranchOpeningHoursPending {
  id          String                @id @default(uuid())
  branchId    String
  merchantId  String
  // The full proposed weekly schedule as a single-window-per-day JSON payload,
  // shaped EXACTLY like the setOpeningHours OpeningHoursInput
  // (Array<{ dayOfWeek, openTime?, closeTime?, isClosed }>). Validated by
  // validateOpeningHours BEFORE persistence. Single-window only (multi-window = PR-8).
  proposedHours Json
  effectiveAt   DateTime              // = stage time + 2h (the cool-off boundary)
  status        PendingHoursStatus    @default(PENDING)
  createdBy     String                // adminUserId (MerchantMembership actor) who staged it
  createdAt     DateTime              @default(now())
  promotedAt    DateTime?
  cancelledAt   DateTime?
  branch        Branch                @relation(fields: [branchId], references: [id], onDelete: Cascade)

  @@index([status, effectiveAt])      // cheap due-row scan for the promotion sweep
  @@index([branchId, status])         // at-most-one-PENDING lookup + merchant-web read
}

enum PendingHoursStatus {
  PENDING
  PROMOTED
  CANCELLED
}
```

Design notes (recorded defaults, no owner fork):
- `proposedHours` is a JSON snapshot of the whole weekly schedule (mirrors the existing `BranchPendingEdit.proposedChanges Json` shape, schema.prisma:625), NOT per-day rows. Rationale: promotion replaces the whole week (the current `setOpeningHours` upserts every day), and a single JSON payload keeps the staging table at most one row per outstanding change. It is validated through `validateOpeningHours` before write, so it can never hold an invalid schedule.
- DISTINCT enum `PendingHoursStatus` (PENDING/PROMOTED/CANCELLED), NOT the admin `PendingEditStatus` (PENDING/APPROVED/REJECTED/WITHDRAWN). PR-4 is self-promoting, not admin-reviewed; reusing the review enum would imply an approval step that does not exist.
- The new model name does not collide with any existing model (verified: `BranchOpeningHours`, `BranchPendingEdit`, `BranchPhoto`, `MerchantPendingEdit` are all distinct).
- NO `ApprovalType` value for hours; NO `AdminApproval` row; NO `editApplier` path. Hours never enter the admin queue.

Migration + deploy: one additive dated dir under `prisma/migrations` (a single `CREATE TABLE` + the enum, no drops). Per the established project convention (cf. the `canManageVouchers` migration), the implementing PR applies it to the LOCAL dev DB only via `prisma migrate dev`; staging/prod require an explicit `prisma migrate deploy` before the new code serves traffic (the Procfile has no `release:` line by design). The migration is purely additive and safe under the documented additive-rollback story.

---

## 4. Backend behaviour (stage-not-apply + cancel + promotion)

### 4a. `setOpeningHours` becomes STAGE-not-apply (src/api/merchant/branch/service.ts:770)

New body, keeping the existing entry route `POST /branches/:id/hours`:
1. `validateOpeningHours(hours)` (UNCHANGED, verbatim). Single-window rules + overnight-accept stay exactly as today.
2. Auth: swap `resolveAdminMerchant` -> `resolveMerchantContext(prisma, adminId)` + `assertCanManageBranch(ctx, branchId)` (OWNER any branch / assigned BRANCH_MANAGER / STAFF denied; preserves the SEC-M2 suspended-merchant guard). This mirrors `setAmenities` exactly.
3. `resolveBranch(prisma, branchId, merchantId)` (UNCHANGED; confirms the branch is owned + not soft-deleted).
4. STAGE, do NOT upsert `BranchOpeningHours`: write/replace the `BranchOpeningHoursPending` row with `proposedHours = hours`, `effectiveAt = now + PROMOTION_WINDOW_MS` (= 2h), `status = PENDING`, `createdBy = ctx.adminId`. Re-staging semantics below.
5. Enqueue a delayed promotion nudge (see 4c): `enqueue(MAINTENANCE_QUEUE, { pendingId }, { jobId: 'promote-hours:<branchId>', delay: PROMOTION_WINDOW_MS })`. The stable `jobId` keyed on `branchId` makes a re-stage replace the prior delayed job cleanly (BullMQ same-jobId dedup).
6. Return the staged pending record (so the merchant-web response shows the pending change + go-live time immediately).

Re-staging semantics (recorded default, no owner fork): a NEW stage while a PENDING row already exists for the branch SUPERSEDES it (the prior PENDING is overwritten/marked CANCELLED and the new one takes a fresh `effectiveAt = now + 2h`). Rationale: a self-service cool-off should let a merchant correct a staged typo without first cancelling; each stage still carries its own full 2h cool-off, so supersede does not weaken the safety window. At-most-one PENDING per branch is enforced (`@@index([branchId, status])` + an upsert-or-replace in a transaction). Alternative considered and NOT chosen: reject a second stage with a `PENDING_HOURS_EXISTS` error (mirrors the identity lane's `PENDING_EDIT_EXISTS`); rejected because it forces a cancel-then-restage dance for a routine correction. If the owner prefers reject-semantics, this is a one-line flip at review.

### 4b. Cancel/withdraw before promotion (new route)

New route `DELETE /api/v1/merchant/branches/:id/hours/pending` (or `POST .../hours/cancel`) + service `cancelPendingHours(prisma, adminId, branchId)`:
- Auth: `resolveMerchantContext + assertCanManageBranch(ctx, branchId)` (same boundary as the stage write).
- Marks the branch's PENDING row `status = CANCELLED`, `cancelledAt = now` (before `effectiveAt`). Idempotent: cancelling when there is no PENDING row returns a clean no-op or a `PENDING_HOURS_NOT_FOUND` (404), matching the existing not-found conventions.
- Does NOT touch `BranchOpeningHours` (the live hours are unchanged by a cancel; the live hours only ever change on promotion).
- The outstanding delayed job becomes a no-op because the promotion handler re-reads the row and skips any non-PENDING / cancelled record (never trusts `job.data`; mirrors the email-worker reconstruct-from-DB pattern).

### 4c. Promotion mechanism (durable record + delayed nudge + durable sweep)

Two layers, both inside the existing worker, NO new queue/process:
- DELAYED NUDGE (prompt latency): the delayed `MAINTENANCE_QUEUE` job (4a step 5) fires ~2h after staging and promotes the row if still PENDING and `effectiveAt <= now`. This is the FIRST per-record delayed job in the repo; the infra supports it (`enqueue` accepts arbitrary `JobsOptions` incl. `{ delay, jobId }`, index.ts:75), but no existing test enqueues a delayed job, so PR-4 adds the first delayed-job pin (section 8). It is a NUDGE only.
- DURABLE SWEEP (correctness guarantee): a new repeatable `PROMOTE_PENDING_HOURS_JOB` on `MAINTENANCE_QUEUE`, cadence ~60s (aligned with the outbox reconciler; tighter than the hourly claim-stale sweep so the 2h target is not overshot when the sweep is the only thing that fires). A pure `promotePendingHours(prisma, now)` (modelled verbatim on `sweepStaleClaims`): index-backed `findMany` of `WHERE status = PENDING AND effectiveAt <= now` (bounded LIMIT), per-row promote, per-row try/catch.
- PROMOTION (atomic, idempotent): inside a `prisma.$transaction`, RE-READ the pending row and promote only if still `status = PENDING` (so a cancel that landed just before the sweep wins); then upsert each day of `proposedHours` into the LIVE `BranchOpeningHours` (the same per-day upsert `setOpeningHours` does today) AND set the pending row `status = PROMOTED`, `promotedAt = now`. The status flip + the live upsert are in ONE transaction so a crash mid-promotion cannot half-apply or double-apply.

Why both layers (D4 "no delayed-job-only"): the shared Redis is MVP-mode with `noeviction` precisely because a dropped key = a lost job; a delayed job can be lost on a Redis restart/blip, an eviction misconfig, or simply never fire if the worker was down at the 2h mark. The durable `BranchOpeningHoursPending` record + the periodic sweep guarantee promotion regardless. The delayed job is the prompt nudge; the sweep is the guarantee. Both read the durable row as the source of truth.

Worker wiring: add the promotion branch to `startReconcileWorker`'s `job.name` dispatch (outboxReconciler.ts:115) and a `schedulePromotePendingHours()` call in `src/worker.ts` alongside the existing two repeatables. No new Worker, no new queue, no new process (the code comments warn that two workers on one queue round-robin and can no-op a tick: keep it ONE worker).

---

## 5. Customer-visible behaviour

ZERO customer-read code changes. The customer open/closed boolean has exactly one producer (`isOpenNow`) reading the LIVE `BranchOpeningHours` relation; the customer app consumes that boolean verbatim. The staging record is invisible to every customer query. New hours appear to customers ONLY after promotion swaps the live rows at `effectiveAt`, which the existing read path reflects with no code change. This is the entire point of the cool-off: customers keep seeing today's live hours for 2 hours after a merchant edits.

Cross-midnight (DEFERRED to PR-8, acknowledged here): `validateOpeningHours` ACCEPTS overnight windows (`close < open`), but `isOpenNow` (line 46, half-open same-day interval; line 36 reads only today's row) renders them as perpetually-closed. PR-4 does NOT touch `isOpenNow`. A merchant MAY stage and promote an overnight window (the validator accepts it); once promoted it will still mis-display as closed - that is pre-existing behaviour, NOT a PR-4 regression, and the fix is PR-8 (multi-row read + wrapping interval + yesterday-row lookup). PR-4 must not "fix it while we are here".

---

## 6. Merchant / admin behaviour

Merchant (merchant-web `OpeningHoursCard`):
- The disabled Edit `LockedAffordance` (line 88) becomes a LIVE edit control (owner + assigned-BM gated client-side; server-enforced). The editor reuses the existing client single-window model `hoursModel.ts` (`validateHoursState` / `toHoursPayload` / copy-Monday / Open-24h).
- On save it calls a new `useStageBranchHours` hook (POST the existing `/branches/:id/hours`); the response is the pending record.
- A pending-hours banner (mirroring `PendingEditsList.tsx`) shows: the proposed hours, a clear "goes live at <go-live time>" line, and a Cancel button wired to a new `useCancelPendingHours` hook (DELETE the pending). The "2 hour customer cool off" chip becomes live here (it was omitted in PR-1).
- The live hours table keeps showing the CURRENT live hours (not the pending) until promotion, with the pending change shown as a distinct banner: the merchant always sees both "what customers see now" and "what will go live and when".
- Data: the pending record is read on the same `useBranch(id)` payload (add a `pendingHours` field to `getBranch` / `branchSchema`) so the banner renders on load and mutations invalidate `['branch', id]` + `['branches']`.

Admin: NONE. PR-4 hours cool-off is merchant SELF-SERVICE DELAYED ACTIVATION, confirmed by the code (no `AdminApproval`, no `ApprovalType` for hours, no `editApplier` path). The admin `BranchPendingEdit` lane stays for identity/photos only and is untouched. This is the explicit answer to the prompt's "confirm whether PR-4 is merchant self-service delayed activation only, not admin-reviewed": YES, self-service only, no admin review.

---

## 7. Authorization (Owner / Branch Manager / Staff), server-enforced

The hours STAGE and CANCEL writes both use `resolveMerchantContext + assertCanManageBranch(ctx, branchId)`:
- OWNER: allowed, any branch.
- BRANCH_MANAGER: allowed, assigned branch only.
- STAFF: denied, even when assigned (`INSUFFICIENT_PERMISSIONS`).
This is server-enforced in the service (before any staging write), not UI-only, mirroring the PR-2/PR-3 management-write boundary. It is a deliberate widening from today's OWNER-only `setOpeningHours` (CORRECTION 1), locked by D3. The promotion worker runs as the system (no per-user auth; it acts on durable rows already authorised at stage time).

---

## 8. Tests

Backend:
- Staging: `setOpeningHours` writes a `BranchOpeningHoursPending` row with `effectiveAt = now + 2h` and does NOT upsert `BranchOpeningHours` (live rows unchanged at stage time). Validation still rejects an invalid schedule (`OPENING_HOURS_INVALID`) before any write.
- Authz matrix on stage + cancel: OWNER any -> allowed; assigned BRANCH_MANAGER -> allowed; unassigned BRANCH_MANAGER -> `INSUFFICIENT_PERMISSIONS`; assigned STAFF -> `INSUFFICIENT_PERMISSIONS` (no staging row written). Suspended merchant -> `MERCHANT_SUSPENDED`.
- Re-stage supersede: a second stage replaces the prior PENDING (at most one PENDING per branch) with a fresh `effectiveAt`.
- Cancel: before `effectiveAt` marks `CANCELLED`; live rows untouched; a subsequent promotion sweep/job is a no-op on the cancelled row.
- Promotion (pure `promotePendingHours(prisma, now)`, injectable `now`): a PENDING row with `effectiveAt <= now` promotes (live `BranchOpeningHours` upserted to the proposed schedule + row `PROMOTED`); a row with `effectiveAt > now` does NOT promote; a CANCELLED row does NOT promote; promotion is idempotent (running the sweep twice does not double-apply or error); a transaction re-check skips a row cancelled between scan and promote.
- Delayed-job pin (first delayed job in the repo): `enqueue(... { delay, jobId })` schedules a delayed job; the handler re-reads the row and skips a withdrawn/promoted record (never trusts `job.data`).
- Customer read regression: customer `isOpenNow` / discovery still returns the LIVE hours while a PENDING record exists (the staging record is invisible) and reflects the new hours only after promotion.
- Cross-midnight: a staged overnight window validates + promotes, and `isOpenNow` still reads it as closed (documents the deferred-to-PR-8 behaviour; pins that PR-4 did not change `isOpenNow`).

Merchant-web (jest/RTL):
- `OpeningHoursCard` test rewrite: the Edit control is now LIVE (was a disabled `LockedAffordance`); the cool-off chip renders (was asserted absent); a pending-hours banner shows the proposed change + the go-live time; owner + assigned-BM see Edit + Cancel, STAFF/non-owner do not (FE gate; backend is the real boundary).
- Stage flow: save calls `useStageBranchHours`, shows the pending banner, invalidates `['branch', id]`.
- Cancel flow: Cancel calls `useCancelPendingHours`, removes the banner, invalidates caches; a calm error on a stale/missing pending.
- Client schema: `branchSchema` parses the new `pendingHours` field (proposed rows + `effectiveAt`).

---

## 9. Rollback plan

- Code rollback: revert the PR. `setOpeningHours` returns to instant-apply; the merchant-web Edit returns to the disabled affordance. No data loss in `BranchOpeningHours` (the live table is never destructively changed by PR-4; promotion only upserts).
- Schema rollback: the migration is purely additive (a new table + enum). Reverting the code leaves an unused empty/idle table; it can be dropped in a follow-up `migrate` or left dormant with no effect on the live hours path. No existing column/constraint is altered.
- In-flight records at rollback: any PENDING rows simply never promote once the worker branch is reverted; the live hours stay as they were (safe-by-default: a rollback cannot push un-promoted hours live). Document this in the PR body.
- Worker rollback: removing the `schedulePromotePendingHours` registration + the dispatch branch stops promotions; no other queue/worker behaviour is affected.

---

## 10. Stop-and-report triggers

- STOP if the staging model cannot be built without coupling to multi-window (report the exact schema/customer-read reason). [Expected NOT to trigger: the staging payload is single-window JSON validated by the existing single-window validator; the live table keeps its `@@unique` single-window constraint.]
- STOP if promotion would require the customer read path to consult the staging record, or to add an `effectiveAt` branch into `isOpenNow` / the discovery selects. The ONLY safe design is promotion = upsert the proposed rows into the LIVE `BranchOpeningHours` + mark the pending PROMOTED; customers read live rows unchanged until then. Anything else breaks the "reads live until promotion" invariant.
- STOP if any plan couples PR-4 to a cross-midnight change in `isOpenNow` (that is PR-8; `isOpenNow.ts` must not be edited in PR-4).
- STOP if the BullMQ pattern cannot guarantee promotion without a durable record (it can: the durable row + the ~60s sweep is the guarantee; the delayed job is only a nudge).
- DEPLOY PREREQUISITE (operational, flagged not blocking): PR-4 promotions (delayed job AND sweep) execute ONLY inside the `src/worker.ts` process. The runbooks (`docs/runbooks/railway-backend-hosting-plan.md`, `docs/runbooks/deploy-security-runbook.md`) list provisioning the second worker service as an owner deploy-time action that is still pending; the whole production deploy is owner-action-pending. A never-running / scaled-to-zero worker means NO promotions (staged hours sit PENDING forever). PR-4 must (a) document worker provisioning as a hard launch prerequisite, and (b) document that the additive migration must be applied to staging/prod via `prisma migrate deploy` before the new code serves traffic, or the worker sweep will error/no-op on a missing table. The merchant portal is pre-launch, so the worker will be provisioned as part of the same launch deploy; this is a launch-checklist item, not a code fork.
- DECISION RECORDED (not a stop): the OWNER-only -> assertCanManageBranch widening (BMs gain hours-edit) is locked by D3 and recorded here as an intentional, coupled change. The re-stage supersede-vs-reject semantics defaults to supersede (section 4a); flip at review if the owner prefers reject.

---

## 11. Explicit deferrals

- Multi-window opening hours: PR-8 (the staging model is single-window only; PR-8 must define how it migrates/handles any in-flight `BranchOpeningHoursPending` records under the multi-row model, per umbrella D9 + the PR-8 section).
- Cross-midnight `isOpenNow` fix: PR-8 (PR-4 does not touch `isOpenNow`).
- Any change to the single-window validation semantics: out of scope (the validator is reused verbatim).
- Onboarding hours: untouched (onboarding never writes hours; multi-window across onboarding + day-2 is PR-8).
- A configurable cool-off duration: out of scope; 2h is a constant (`PROMOTION_WINDOW_MS = 2 * 60 * 60 * 1000`), matching D4.

---

## 12. Cross-check table (existing code -> proposed PR-4)

| # | Existing (live code) | Proposed PR-4 | Note |
|---|---|---|---|
| 1 | `setOpeningHours` INSTANT-APPLY: validate -> `resolveAdminMerchant` (OWNER-only) -> `Promise.all` of `branchOpeningHours.upsert` (service.ts:781-794). Live + customer-visible immediately. | STAGE-not-apply: keep `validateOpeningHours`, swap auth to `resolveMerchantContext + assertCanManageBranch`, write a durable `BranchOpeningHoursPending` row + `effectiveAt = now + 2h`, enqueue a delayed nudge. NO live upsert at write time. | The validate + per-day upsert logic moves into the promotion worker; the write path only persists the staging record. D4: durable record, not delayed-job-only. |
| 2 | Auth = OWNER-only (`resolveAdminMerchant`, service.ts:783). Assigned BM is DENIED hours today (inconsistent with `setAmenities`). | `assertCanManageBranch`: OWNER any / assigned BRANCH_MANAGER / STAFF denied, on BOTH stage + cancel. | Deliberate, locked (D3) permission widening; mirrors `setAmenities` (service.ts:808-809). |
| 3 | `BranchOpeningHours` single-window (`@@unique([branchId,dayOfWeek])`); `validateOpeningHours` single-window; overnight `close<open` accepted. | Staging stays single-window (proposed JSON mirrors `OpeningHoursInput`, reuses `validateOpeningHours` verbatim); promotion is a per-day upsert into the same single-window live model. | No change to the live model cardinality. Multi-window = PR-8. |
| 4 | No durable staging model; no `effectiveAt` anywhere. `BranchPendingEdit` is admin-reviewed (wrong precedent for auto-promote). | New additive `BranchOpeningHoursPending` (proposed JSON + `effectiveAt` + `PendingHoursStatus`) + indexes. Migration local-dev-only; staging/prod via `prisma migrate deploy`. | Modelled on `BranchPendingEdit`'s JSON+status+index shape but self-promoting, not admin-reviewed. No name collision. |
| 5 | Customer `isOpenNow` reads LIVE `BranchOpeningHours` (isOpenNow.ts:46; discovery 1220/2191/2372/2896; favourites 116/507). Client consumes the server boolean verbatim. | UNCHANGED. Staging is invisible to customer queries; new hours appear only after promotion swaps the live rows. Zero customer-read code. | Structural decoupling: one boolean producer, no staging field in any customer select. |
| 6 | Cross-midnight `isOpenNow` bug: overnight windows read closed 24h (half-open same-day interval + today-only row). Validator accepts overnight. | DEFERRED to PR-8. `isOpenNow.ts` NOT touched. PR-4 may stage/promote an overnight window; it still mis-displays until PR-8 (pre-existing, not a regression). | Fixed-now = nothing. |
| 7 | Promotion infra: BullMQ `MAINTENANCE_QUEUE` + ONE `startReconcileWorker` dispatching by `job.name`; `claimStaleSweep` (hourly) + outbox reconcile (60s) repeatables; `enqueue` supports `{ delay, jobId }` (no delayed job used yet). | Add a `PROMOTE_PENDING_HOURS_JOB` repeatable sweep (~60s, copy `sweepStaleClaims`) PLUS a per-record delayed nudge (`{ delay: 2h, jobId: 'promote-hours:<branchId>' }`); add an else-if branch to the existing worker; register in `src/worker.ts`. | No new queue/worker/process. Durable record + sweep = guarantee; delayed job = nudge. First delayed job in the repo (add a pin). |
| 8 | `BranchPendingEdit` + `AdminApproval` (type `BRANCH_IDENTITY_EDIT`) = admin-reviewed lane for identity/photos (editApplier). `ApprovalType` enum has no hours value. | SELF-SERVICE: separate table, NO `AdminApproval`, NO `ApprovalType` value, NO editApplier path, NO admin review. | Confirms "self-service delayed activation, not admin-reviewed". The admin lane stays for identity/photos. |
| 9 | merchant-web `OpeningHoursCard`: Edit = disabled `LockedAffordance` (line 88); cool-off chip omitted (lines 9-12); no `useSetBranchHours` hook; no pending-hours schema in `lib/api/branch.ts`. | Live Edit (reuses `hoursModel.ts`) + pending-hours banner (mirror `PendingEditsList`) with go-live time + Cancel + the now-live cool-off chip; new `useStageBranchHours` / `useCancelPendingHours` hooks; `pendingHours` added to `getBranch`/`branchSchema`. | Owner + assigned-BM gated client-side; server-enforced. |
| 10 | Onboarding service: ZERO hours references (does not write hours). | UNCHANGED. Stage-not-apply cannot break onboarding (no onboarding hours-write path exists). | Resolves the prompt's onboarding stop-and-report concern: non-issue. |

---

## 13. PR shape + sequencing

- PR-4 is Tier-3 (schema). It is stacked AFTER PR-1/PR-2/PR-3 (it uses `assertCanManageBranch` from PR-2). Branch off the current stack tip when implementation is approved.
- Suggested implementation order (each its own commit, fresh implementer + fresh adversarial reviewer per the programme discipline): (1) schema + migration; (2) `setOpeningHours` stage-not-apply + auth swap + cancel route + service; (3) promotion sweep + delayed nudge + worker wiring; (4) `getBranch` `pendingHours` exposure; (5) merchant-web editor + pending banner + cancel + hooks + schema; (6) tests across all layers.
- Out of scope: multi-window (PR-8); lifecycle add/close (PR-5); location lookup (PR-6); alerts (PR-7); any `isOpenNow` change.

No implementation until this mini-spec is owner + Codex approved.

# PR-5 mini-spec: Branch lifecycle (add branch + close branch)

Status: DRAFT for owner + Codex review. Docs-only. No implementation until approved.

Programme: Merchant Portal Branches (PR-1 to PR-8). Source of truth: `docs/superpowers/specs/2026-06-23-merchant-web-branches-programme-design.md` (umbrella, D5 + the PR-5 section). Sibling mini-spec pattern: `2026-06-24-merchant-web-branches-pr4-hours-cooloff-mini-spec.md`.

Locked decision being implemented: D5. "Combined branch-lifecycle approval with status-on-Branch staging, one shared lifecycle model. CREATE: the merchant creates a real Branch in a pending/discovery-excluded state plus an `AdminApproval`; the merchant sees awaiting approval; customers must not see the pending branch until approval; admin approval makes it live, reusing the existing admin location-confirmation flow. CLOSE: the merchant submits a close request with a reason; the branch stays live until approval; approval soft-deletes/deactivates; rejection keeps it live. Reuse `AdminApproval` plus the admin actioner/edit-review panel. Do not use off-Branch pending rows unless live code proves status-on-Branch unsafe."

Grounded in a five-subsystem live-code inspection (create/close model; AdminApproval + ApprovalType + actioner + the location-confirm flow; customer branch-read leak vectors; merchant-web add/close + authz; main-branch rules + migration). Where the inspection corrected an assumption, it is called out inline.

BASELINE NOTE (read before checking any anchor): the BACKEND subsystems (`createBranch`/`softDeleteBranch`, customer reads, `AdminApproval`/`ApprovalType`, the admin confirm-location flow) all live on `main` and were inspected there, so their cited line numbers are `main` line numbers. PR-5 stacks on the open PR-1/PR-2/PR-3 stack (PRs #309/#310/#313), which adds code to `src/api/merchant/branch/service.ts` and shifts its line numbers up (e.g. `setOpeningHours` is at ~553 on `main` but ~770 on the stack). So: LOCATE BY SYMBOL NAME, not the indicative line number. The merchant-web Branches surface (AddBranchButton, CloseBranchSection, MainBranchControl, BranchDetail, PendingEditsList, LockedAffordance) lands in PR-1 (#309) and is NOT on `main`; `assertCanManageBranch` (the BM-allowed management guard) lands in PR-2 (#310) and is NOT on `main`. PR-5 create/close deliberately do NOT use `assertCanManageBranch` (it admits BRANCH_MANAGER, which D3 forbids for create/close); they stay on the OWNER-only `resolveAdminMerchant`.

---

## 1. Live-code reality (what exists today)

- Branch model (prisma/schema.prisma, `model Branch`): lifecycle-relevant fields are `isMainBranch Boolean @default(false)`, `isActive Boolean @default(true)` (the merchant's reversible open/closed/suspend toggle), `deletedAt DateTime?` (permanent soft-delete marker), `locationConfidence LocationConfidence @default(POSTCODE_CENTROID)`, `isTestData`. There is NO lifecycle/status field on Branch today. `@@index` exists on `isActive` but not on any status field.
- `LocationConfidence` enum: `MANUALLY_CONFIRMED`, `ADDRESS_GEOCODED`, `POSTCODE_CENTROID`, `NEEDS_REVIEW`. `CONFIRMED_LOCATION_SET = {MANUALLY_CONFIRMED, ADDRESS_GEOCODED}` (src/api/shared/location.ts) is the go-live-eligible set; `isBranchLocationConfirmed(branch)` is the gate. A freshly postcode-resolved branch is `POSTCODE_CENTROID` (NOT confirmed), so it fails the location gate until an admin confirms.
- `ApprovalType` enum: `MERCHANT_ONBOARDING, VOUCHER, MERCHANT_PROFILE_EDIT, MERCHANT_IDENTITY_EDIT, BRANCH_IDENTITY_EDIT`. No branch-lifecycle value.
- `createBranchCore` (src/api/merchant/branch/service.ts): INSTANT-LIVE today. `existingCount === 0 => isMainBranch` (auto-main); resolves the postcode to a `POSTCODE_CENTROID` location snapshot before the transaction; creates the branch + a `BRANCH_CREATED` audit in one transaction; creates NO `AdminApproval`. `isActive` defaults true.
- `createBranch` (the merchant wrapper): uses `resolveAdminMerchant` (OWNER-only by construction; a non-owner gets `INVALID_CREDENTIALS`). So create is ALREADY OWNER-only, satisfying D3. The SAME merchant route is used for the onboarding first/main branch AND for day-2 subsequent branches.
- `createBranchCore` is ALSO called by the admin create-draft-branch on-behalf route (src/api/admin/merchants/routes.ts). So any change to `createBranchCore`'s default lifecycle must be parameterised so this admin path can stay instant.
- `softDeleteBranchCore` (src/api/merchant/branch/service.ts): IMMEDIATE today. Guards `BRANCH_NOT_FOUND`, `BRANCH_IS_MAIN` (cannot delete the main branch), `BRANCH_LAST_ACTIVE` (cannot delete the last active branch of an ACTIVE merchant) BEFORE the transaction; then deactivates `BranchUser` staff + sets `deletedAt` + `isActive = false` + a `BRANCH_DELETED` audit. NO close-request/approval step. The `BRANCH_IS_MAIN` guard ALREADY enforces "cannot close the main branch".
- `softDeleteBranch` (the merchant wrapper): uses `resolveAdminMerchant` (OWNER-only). So close is ALREADY OWNER-only, satisfying D3.
- `updateBranch` isMainBranch promotion: atomic make-main (clears the prior `isMainBranch`, sets the target) + `BRANCH_MAIN_CHANGED` audit; gated `assertOwner` on the stack. This is the "make another branch main first" mechanism.
- Onboarding: the onboarding service does NOT create branches; it only reads `branchCount >= 1` for the `branch_created` checklist gate. The first/main branch is created via the standard merchant `createBranch`. So PR-5 must NOT route the onboarding first branch through the pending-create-approval lane.
- Admin approval + go-live template: `approveApproval` / the onboarding go-live (src/api/admin/approvals/service.ts) does an atomic compare-and-set Merchant -> ACTIVE + `onboardingStep LIVE`, gated by `isBranchLocationConfirmed(mainBranch)`, with `MERCHANT_VERIFICATION_UPDATE` notify producers. This is the template for branch CREATE-approval.
- Admin actioner / edit-review: `editApplier.ts` (`approveEdit`/`rejectEdit`/`getEditReviewContext`) dispatches by `approval.type` via `editKindOf`; the approvals queue + claim/release also type-switch on `approval.type`. Unknown types are treated as `APPROVAL_NOT_ACTIONABLE`. PR-5's new types must be taught to this dispatch (a new sibling applier).
- Admin location-confirmation flow: `confirmBranchLocation` (src/api/admin/branches/service.ts) sets lat/lng + `locationConfidence = MANUALLY_CONFIRMED` + a `BRANCH_LOCATION_CONFIRMED` audit, gated `branch:confirm-location`. It targets any branch by id and is idempotent. D5's "create-approval reuses the location-confirmation flow" uses this; the inspection assessed the reuse as CLEAN (no second mechanism needed).
- Customer branch reads (the leak vectors): the discovery FEEDS filter `isActive:true` + `merchant.status = ACTIVE` (MERCHANT_TILE_SELECT branches; getCustomerMerchantBranches; searchBranches base; getInAreaBranches; bbox; getCampaignBranches). `enrichBranchTiles` re-fetch is the universal choke point for branch-first surfaces. The customer branch PICKER (`getCustomerMerchant`, src/api/customer/discovery/service.ts ~1953-1981) deliberately does NOT filter `isActive` (it shows suspended branches greyed-out; filters `isTestData:false` only) - THIS is the primary leak vector. `branch-resolver.ts` (`resolveSelectedBranch`/`pickColdOpen`) filters only `b.isActive`. `listFavouriteBranches` + `addFavouriteBranch` (favourites/service.ts) do branch reads; `createReview` + `createRedemption` check `isActive`. Map/bbox paths additionally require `locationConfidence: MANUALLY_CONFIRMED`, giving incidental protection to a `POSTCODE_CENTROID` pending branch.

Corrections to assumptions:
- CORRECTION 1 (authz): create + close are ALREADY OWNER-only (`resolveAdminMerchant`), so D3 is satisfied with NO authz change. PR-5 must KEEP them OWNER-only and must NOT migrate them to the BM-allowed `assertCanManageBranch`.
- CORRECTION 2 (cannot-close-main): the `BRANCH_IS_MAIN` (and `BRANCH_LAST_ACTIVE`) guard already exists in `softDeleteBranchCore`; PR-5 moves the check to close-REQUEST time but reuses the existing guard semantics/messages.
- CORRECTION 3 (create-form location, PR-6 dependency): NOT blocking. `createBranchCore` resolves location server-side from the postcode (`POSTCODE_CENTROID`) and explicitly drops any caller lat/lng; the create body has no lat/lng. PR-5's create form collects a MANUAL ADDRESS ONLY (no Google call, no lat/lng); admin confirms the precise location. PR-6 (Google lookup) is a separate later slice.

---

## 2. Prototype behaviour being targeted

- CREATE: prototype add-branch flow. The merchant adds a branch; it does NOT appear to customers; the merchant sees an "awaiting approval" state; an admin approves (confirming the location) and it goes live; the merchant can cancel a pending create.
- CLOSE: prototype `10`. The merchant requests to close a branch with a reason; the branch STAYS live until an admin approves; the merchant sees a pending-close state and can withdraw; on approval the branch is deactivated; on rejection it stays live. Prototype `06`: cannot close the main branch (make another branch main first).

---

## 3. Schema change (additive) - REQUIRED, flagged for owner

Two additive changes; NO destructive change to any existing column.

(a) New lifecycle status field on Branch (status-on-Branch staging, D5):

```prisma
enum BranchLifecycleStatus {
  PENDING_CREATE   // created by merchant on a LIVE merchant, awaiting admin approval; customer-INVISIBLE
  LIVE             // normal live branch (default; preserves all existing rows + instant onboarding/admin path)
  PENDING_CLOSE    // close-requested; still LIVE/visible until admin approval
  CLOSED           // close approved; soft-deleted (deletedAt set + isActive=false). Terminal.
}

model Branch {
  // ... existing fields unchanged ...
  lifecycleStatus BranchLifecycleStatus @default(LIVE)
  closeReason     String?               // set on a close-REQUEST, audit-only
  // ... existing isMainBranch / isActive / deletedAt / locationConfidence unchanged ...
  @@index([merchantId, lifecycleStatus])  // cheap pending lookups + customer-read status filter
}
```

Orthogonality contract (locked to avoid ambiguity): `lifecycleStatus` is a SEPARATE axis from `isActive` (reversible suspend toggle) and `deletedAt` (permanent soft-delete). The three never collapse onto one flag:
- PENDING_CREATE: branch exists, `isActive=false`, customer-INVISIBLE regardless of `isActive` (the authoritative exclusion is the STATUS, because the picker has no `isActive` filter). The `isActive=false` is belt-and-braces so the `isActive:true` feeds + `createReview`/`createRedemption` are incidentally safe too.
- LIVE: `isActive` is the merchant's normal open/closed toggle (a LIVE branch may be `isActive=false` = temporarily suspended/greyed-out; that is NOT pending-create).
- PENDING_CLOSE: branch stays `LIVE`-visible (`isActive` unchanged, still customer-visible) until approval.
- CLOSED: set on close-approval alongside the existing soft-delete (`deletedAt` + `isActive=false`); `deletedAt != null` remains the operative exclusion every customer read already applies via `resolveBranch`.

(b) Two new ApprovalType values (additive `ALTER TYPE ADD VALUE`): `BRANCH_CREATE`, `BRANCH_CLOSE`.

Naming decision (resolves the umbrella's explicit open item): TWO distinct values `BRANCH_CREATE` + `BRANCH_CLOSE`, NOT a single combined `BRANCH_LIFECYCLE` with a sub-action. Rationale (grounded in the live code): the actioner dispatches purely on `approval.type` (`editKindOf`, the queue type-switches, the claim/release audit-entity arms); a single combined type would force a SECOND discriminator (referenceType or a `proposedChanges` sub-field), exactly the "never dispatch on referenceType" anti-pattern the codebase avoids. CREATE and CLOSE also have genuinely different apply semantics (CREATE = flip to LIVE + reuse the location-confirm gate; CLOSE = run the soft-deactivation), different gates, and different customer-visibility effects, so two single-purpose applier arms are independently testable.

Migration + deploy: one additive dated dir (`ADD COLUMN lifecycleStatus ... DEFAULT 'LIVE'` + the enum, plus the two `ALTER TYPE ADD VALUE`). Default `LIVE` makes every existing row + the onboarding first/main branch unchanged. Per the project convention (cf. `canManageVouchers`), apply to the LOCAL dev DB via `prisma migrate dev` during development; staging/prod require `prisma migrate deploy` before the new code serves traffic.

---

## 4. Backend behaviour

### 4a. CREATE: stage-pending + admin approve-to-live

- `createBranchCore` gains a parameter for the initial lifecycle (e.g. `stageForApproval: boolean`, default false to preserve current behaviour). It is NOT hardcoded.
- Merchant `createBranch` route: compute `stageForApproval = (merchant.status === 'ACTIVE')`. Rationale: during onboarding the merchant is REGISTERED/PENDING_APPROVAL (not ACTIVE), so a branch created then is INSTANT (the merchant onboarding approval covers it); once the merchant is LIVE (ACTIVE), any new branch is a day-2 add that needs its own approval. Auth stays `resolveAdminMerchant` (OWNER-only).
- Admin create-draft-branch on-behalf route (admin/merchants/routes.ts): passes `stageForApproval = false` (instant LIVE). The admin is the approval authority; making the admin approve their own draft would be nonsensical. Recorded default.
- When staging: `createBranchCore` writes `lifecycleStatus = PENDING_CREATE` + `isActive = false`, resolves the postcode to `POSTCODE_CENTROID` as today, and creates an `AdminApproval(type: BRANCH_CREATE, referenceId: branch.id, referenceType: 'branch')`. The branch exists but is customer-invisible (section 5). The merchant sees "awaiting approval".
- Auto-main safety: a PENDING_CREATE branch must NEVER be auto-promoted to main. Since staging only fires for an ACTIVE merchant (which, by the `BRANCH_LAST_ACTIVE` guard, always has at least one LIVE branch), `existingCount` is never 0 for a staged create, so the existing `isMainBranch = existingCount === 0` never makes a pending branch main. PR-5 additionally makes the `existingCount`/main logic count only non-pending, non-deleted branches, and the customer cold-open nearest-branch / `isMainBranch` defaults only ever resolve to LIVE branches. Recorded invariant: main is only ever a LIVE branch.
- Admin approve (a new `branchLifecycleApplier.ts` mirroring `editApplier.ts`, dispatching on `BRANCH_CREATE`): inside a transaction, re-validate, require `isBranchLocationConfirmed(branch)` (so the admin must have confirmed the precise location via the reused `confirmBranchLocation` flow, moving `POSTCODE_CENTROID -> MANUALLY_CONFIRMED`), then exactly-once compare-and-set `lifecycleStatus = LIVE` + `isActive = true`, an in-transaction ADMIN audit, and a best-effort owner notify. The admin actioner UI surfaces the location-confirm step exactly as it does for onboarding. (Notify type/copy: the recorded default is to reuse the existing branch-approval notify producer pattern as a best-effort owner notification; the exact notification type + copy for "branch create approved" / "branch close approved" is a small copy decision deferred to implementation, since a branch-lifecycle change is not strictly a `MERCHANT_VERIFICATION_UPDATE`. Confirm at build.)
- Cancel/withdraw a pending create (merchant, OWNER-only): deletes the PENDING_CREATE branch row + withdraws the `AdminApproval`. The branch never went live, so a hard cleanup is acceptable (no customer or redemption data references it). Mirrors `withdrawBranchEditRequest`.

### 4b. CLOSE: close-request + admin approve-to-deactivate

- New close-REQUEST service (merchant, OWNER-only via `resolveAdminMerchant`; do NOT use `assertCanManageBranch`). Enforce `BRANCH_IS_MAIN` (cannot close the main branch; make another main first) AND `BRANCH_LAST_ACTIVE` (cannot close the last active branch) AT REQUEST-CREATION time, reusing the existing guard semantics/messages. On success: set `lifecycleStatus = PENDING_CLOSE` + `closeReason`, create an `AdminApproval(type: BRANCH_CLOSE)`. The branch STAYS `isActive = true` and customer-visible.
- Admin approve (`branchLifecycleApplier.ts`, `BRANCH_CLOSE`): re-check the not-main / not-last-active invariants at approval time, then run the existing `softDeleteBranchCore` semantics (deactivate `BranchUser` staff + set `deletedAt` + `isActive = false` + `BRANCH_DELETED` audit) and set `lifecycleStatus = CLOSED`.
- Admin reject: revert `lifecycleStatus = LIVE`, clear `closeReason`; the branch stays live (it never left LIVE-visible).
- Withdraw a pending close (merchant, OWNER-only): revert `lifecycleStatus = LIVE` + withdraw the approval; the branch was live throughout.

### 4c. authz (server-enforced)

CREATE, cancel-create, close-request, withdraw-close are ALL OWNER-only (`resolveAdminMerchant`, or `resolveMerchantContext + assertOwner` for symmetry). A BRANCH_MANAGER or STAFF is denied (D3: a Branch Manager may NOT create or close/request-close a branch). This is NOT a change (create/close are already OWNER-only); PR-5 must preserve it and must NOT use `assertCanManageBranch`. The admin approve/reject paths use the existing admin capability gates (`approval:apply-edit` / the actioner capability), plus `branch:confirm-location` for the location step.

---

## 5. Customer-visible behaviour (the load-bearing exclusion)

A PENDING_CREATE branch must be invisible on EVERY customer surface; a PENDING_CLOSE branch must STAY visible (still live); a CLOSED branch is excluded by the existing `deletedAt` filter. The authoritative exclusion is `lifecycleStatus = PENDING_CREATE` (hide), NOT `isActive`. There is no single shared where-builder, so PR-5 adds the status gate to each path. Priority order (per the inspection):
1. The customer branch PICKER `getCustomerMerchant` (~1953-1981) - the PRIMARY leak (no `isActive` filter). Exclude PENDING_CREATE by status.
2. `enrichBranchTiles` re-fetch (~1354) - the universal choke point for branch-first discovery surfaces; centralise the status exclusion here (mirror the existing `isTestData` comment).
3. The `isActive:true` feeds (MERCHANT_TILE_SELECT branches; getCustomerMerchantBranches; searchBranches base; getInAreaBranches; bbox; getCampaignBranches) - add the status exclusion alongside `isActive` (incidentally safe because pending is `isActive=false`, but make the status filter explicit).
4. `branch-resolver.ts` `resolveSelectedBranch`/`pickColdOpen` - filter out PENDING_CREATE so it can never be selected/cold-opened.
5. `listFavouriteBranches` + `addFavouriteBranch` (favourites) - exclude PENDING_CREATE / refuse to favourite a non-LIVE branch.
6. `createReview` + `createRedemption` - defence: a PENDING_CREATE branch must not accept reviews/redemptions even if a branch id leaked.

`PENDING_CLOSE` branches are NOT excluded by any of the above (they are still LIVE until approval). On close-approval the branch gets `deletedAt` set, which every customer read already excludes via `resolveBranch(... deletedAt: null)`.

---

## 6. Merchant / admin behaviour

Merchant (merchant-web, OWNER-only controls):
- CREATE: the `AddBranchButton` `LockedAffordance` becomes a live owner-only create form/modal (mirror the onboarding `BranchStepForm` field set: name / addressLine1 / addressLine2 / city / postcode / phone / email / websiteUrl / about; MANUAL ADDRESS ONLY, no lat/lng, no Google call). Gate the CTA on `isOwner` (via `useBranchCapability()`). On submit a new `useCreateBranch` hook posts to the create route; the response shows an "awaiting approval" pending-create banner (mirror the review-state banners) + a withdraw/cancel control (mirror `PendingEditsList`).
- CLOSE: the `CloseBranchSection` `LockedAffordance` (already `isOwner`-gated, already carries the D5 copy) becomes a live close-request flow: a reason-collecting modal (prototype `10`) -> a new `useCloseBranchRequest` hook -> the close-request route; the branch stays live; show a pending-close banner + withdraw. The "make another branch main first" UX uses the existing `MainBranchControl` (the `BRANCH_IS_MAIN` guard fires server-side; the UI explains it).
- `branchSchema` gains `lifecycleStatus` + the pending info (so the banners render on load); mutations invalidate `['branch', id]` + `['branches']`.

Admin (admin-web actioner): the actioner gains BRANCH_CREATE + BRANCH_CLOSE review using the EXISTING `AdminApproval` queue + the edit-review/actioner pattern + the location-confirmation flow. CREATE review shows the proposed branch + the location-confirm step (reuse `confirmBranchLocation`); approve flips to LIVE. CLOSE review shows the branch + the close reason; approve runs the deactivation. The queue type-switches + `editKindOf` (or a sibling `branchLifecycleApplier`) learn the two new types so they are actionable and reviewable (else `APPROVAL_NOT_ACTIONABLE`).

ACTIONER DISPATCH COMPLETENESS (do NOT leave a default arm): `claimApproval` and `releaseApproval` (src/api/admin/approvals/service.ts) ALSO type-switch on `approval.type` and DEFAULT to `entityType: 'merchant'`, `entityId = approval.referenceId` for any unhandled type. Because a branch-lifecycle approval's `referenceId` is the BRANCH id, the default arm would write an audit row mislabelled `entityType: 'merchant'` with a branch id - exactly the audit-entity mismatch Option B B1 fixed for the edit rows. PR-5 MUST add a `BRANCH_CREATE`/`BRANCH_CLOSE` arm to BOTH `claimApproval` and `releaseApproval` resolving `entityType: 'branch'`, `entityId = branch.id` (mirroring the existing `BRANCH_IDENTITY_EDIT` arm). It MUST also leave merchant lifecycle untouched for the branch types: the `MERCHANT_ONBOARDING`-only side-effect (`claimApproval` sets `onboardingStep: 'UNDER_REVIEW'`; `releaseApproval` reverts it) must NOT be copied to the branch arms - claiming/releasing a branch approval changes no merchant `onboardingStep`/`status`.

---

## 7. Authorization summary (Owner / Branch Manager / Staff)

| Action | OWNER | BRANCH_MANAGER | STAFF |
|---|---|---|---|
| Create branch (+ cancel pending create) | Allowed | Denied | Denied |
| Close-request (+ withdraw pending close) | Allowed | Denied | Denied |
| Make-another-main (to free the main before closing) | Allowed (existing OWNER-only) | Denied | Denied |
| Admin approve/reject create or close | admin capability (`approval:apply-edit` + `branch:confirm-location`) | n/a | n/a |

Server-enforced via `resolveAdminMerchant` (OWNER-only) on the merchant side; NOT `assertCanManageBranch`. D3-faithful.

---

## 8. Tests

Backend:
- CREATE on an ACTIVE merchant -> branch `lifecycleStatus = PENDING_CREATE`, `isActive = false`, an `AdminApproval(BRANCH_CREATE)` created, NOT auto-main, customer-INVISIBLE on BOTH the feeds AND the picker AND the resolver AND favourites AND review/redemption.
- CREATE during onboarding (merchant not ACTIVE) -> INSTANT LIVE (no pending, no approval), first branch auto-main as today.
- Admin create-draft-branch on-behalf -> INSTANT LIVE (no pending).
- Approve create -> requires `isBranchLocationConfirmed` (reused confirm-location), then flips to LIVE + `isActive = true`, customer-visible; idempotent (double-approve is a no-op); owner notified.
- Cancel pending create -> row + approval removed; nothing customer-visible ever existed.
- CLOSE-request on a non-main branch of an ACTIVE merchant -> branch STAYS LIVE + `isActive = true` + customer-visible; `lifecycleStatus = PENDING_CLOSE`; `AdminApproval(BRANCH_CLOSE)` created.
- CLOSE-request on the main branch -> `BRANCH_IS_MAIN` (rejected at request time, no approval created); on the last active branch -> `BRANCH_LAST_ACTIVE`.
- Approve close -> soft-deactivated (`deletedAt` + `isActive = false`) + `lifecycleStatus = CLOSED`; reject close -> reverts to LIVE; withdraw close -> reverts to LIVE.
- authz matrix: create + close + cancel + withdraw: OWNER allowed; assigned BRANCH_MANAGER denied; STAFF denied; suspended merchant -> `MERCHANT_SUSPENDED`.
- Auto-main invariant: a pending branch is never main; the `existingCount`/main logic counts only LIVE non-deleted branches; customer cold-open nearest-branch never resolves to a pending branch.
- Customer exclusion regression: enumerate EVERY read path (picker, enrich, each feed, resolver, favourites add/list, review, redemption) and pin that a PENDING_CREATE branch is excluded and a PENDING_CLOSE branch is still visible.

admin-web (jest/RTL): the actioner renders + actions BRANCH_CREATE and BRANCH_CLOSE (queue type-switch, review screen, the create location-confirm step, approve/reject); unknown-type safety unaffected.

Backend actioner-dispatch pins: `claimApproval` + `releaseApproval` on a `BRANCH_CREATE`/`BRANCH_CLOSE` approval resolve `entityType: 'branch'`, `entityId = branch.id` (NOT the default `entityType: 'merchant'` arm) so the audit row is correctly labelled; and claiming/releasing a branch approval does NOT mutate the merchant's `onboardingStep`/`status` (the `MERCHANT_ONBOARDING`-only side-effect is not applied to the branch types).

merchant-web (jest/RTL): create form (owner-only, manual-address, no lat/lng) -> awaiting-approval banner + withdraw; close-request modal (reason) -> pending-close banner + withdraw; the make-another-main-first UX; non-owner sees neither create nor close; `branchSchema` parses `lifecycleStatus`.

---

## 9. Rollback plan

- Code rollback: revert the PR. `createBranch` returns to instant-live; `softDeleteBranch` returns to immediate delete; the merchant-web add/close affordances return to disabled. The customer reads drop the status filter (harmless: with the column defaulting to LIVE, no branch is excluded).
- Schema rollback: the migration is purely additive (a new column defaulting LIVE + two enum values + an index). Reverting the code leaves the column/enum dormant with no behavioural effect (every row is LIVE). The enum values cannot be dropped trivially in Postgres but are inert if unused. No existing column/constraint is altered.
- In-flight records at rollback: any PENDING_CREATE branches are `isActive=false` + (after rollback) no longer status-excluded, but they would then surface in the `isActive:true`-keyed feeds only if flipped active - they stay `isActive=false` so they remain hidden from the feeds; the picker would show them (greyed). Document that any in-flight pending-create branches should be cancelled (deleted) before a rollback, OR flip them to LIVE+approved. Pending-close branches are unaffected (still live). This is a documented operational step, not silent.

---

## 10. Stop-and-report triggers

- STOP if status-on-Branch proves unsafe and an off-Branch pending row is genuinely required (report the exact customer-read or `isActive`/`deletedAt` coexistence reason). [Expected NOT to trigger: the three state axes stay orthogonal; the inspection confirmed a clean additive column.]
- STOP if a SECOND lifecycle mechanism seems necessary (D5 forbids two mechanisms without a source-verified reason).
- STOP if the auto-main + pending-create interaction cannot be cleanly prevented (e.g. a path where a pending branch becomes main or breaks customer cold-open defaults).
- STOP if any customer branch read path cannot be cleanly status-filtered (a leak that survives the status gate).
- DECISION RECORDED (not a stop): ApprovalType naming resolved to TWO values `BRANCH_CREATE` + `BRANCH_CLOSE` (section 3b). The pending-vs-instant create discriminator is `merchant.status === 'ACTIVE'` (merchant self-create) with admin-on-behalf always instant (section 4a). The status enum is `PENDING_CREATE / LIVE / PENDING_CLOSE / CLOSED` (default LIVE). Pending-create is `isActive=false` + status-excluded (defence-in-depth). Flip any of these at review if the owner prefers.
- DEPLOY: the additive migration must be applied to staging/prod via `prisma migrate deploy` before the new code serves traffic.

---

## 11. Explicit deferrals

- PR-6 (Google business/address lookup): PR-5's create form collects a manual address only; admin confirms the precise location. The merchant-side Google lookup is PR-6.
- Make-main governance changes beyond what exists (the existing OWNER-only atomic make-main is reused as-is).
- Multi-window hours (PR-8); redemption alerts (PR-7); hours cool-off (PR-4).
- Any richer close workflow (e.g. scheduled close dates) - out of scope; close is request -> admin approve -> deactivate.

---

## 12. Cross-check table (existing code -> proposed PR-5)

| # | Existing (live code) | Proposed PR-5 | Note |
|---|---|---|---|
| 1 | `createBranchCore` INSTANT-LIVE: auto-main on `existingCount===0`, postcode->`POSTCODE_CENTROID`, no `AdminApproval`. `createBranch` is OWNER-only (`resolveAdminMerchant`). | Parameterised: merchant self-create on an ACTIVE merchant stages `lifecycleStatus=PENDING_CREATE` + `isActive=false` + `AdminApproval(BRANCH_CREATE)`; onboarding (merchant not ACTIVE) + admin-on-behalf stay INSTANT LIVE. Auth unchanged (OWNER-only). | Onboarding first/main branch stays instant; auto-main never promotes a pending branch. |
| 2 | `softDeleteBranchCore` IMMEDIATE: guards `BRANCH_IS_MAIN` + `BRANCH_LAST_ACTIVE`, sets `deletedAt`+`isActive=false`. `softDeleteBranch` OWNER-only. | Close-REQUEST (OWNER-only): re-use the guards at request time, set `lifecycleStatus=PENDING_CLOSE`+`closeReason`, create `AdminApproval(BRANCH_CLOSE)`, branch STAYS live. Approve runs the existing deactivation + `CLOSED`; reject/withdraw revert to LIVE. | The cannot-close-main guard already exists; it moves to request time. |
| 3 | Branch has no status field; `isActive` = reversible suspend; `deletedAt` = soft-delete. | New `BranchLifecycleStatus` (default LIVE) orthogonal to `isActive`/`deletedAt`: PENDING_CREATE (hidden) / LIVE / PENDING_CLOSE (visible) / CLOSED. | Status-on-Branch (D5). Three axes never collapse onto one flag. |
| 4 | `ApprovalType` = ONBOARDING/VOUCHER/PROFILE_EDIT/IDENTITY_EDIT/BRANCH_IDENTITY_EDIT; `editApplier`/queue dispatch on `approval.type`. | Add `BRANCH_CREATE` + `BRANCH_CLOSE` (two values, not one combined); a new `branchLifecycleApplier` + queue type-switch arms. | Two values avoid a second discriminator (the codebase's "dispatch on type only" rule). Resolves the umbrella's open naming item. |
| 5 | `confirmBranchLocation` (admin) sets `MANUALLY_CONFIRMED`; `isBranchLocationConfirmed` gates onboarding go-live. | CREATE-approval REUSES `confirmBranchLocation` + the `isBranchLocationConfirmed` gate; no second confirmation mechanism. | Assessed clean (the flow targets any branch by id, idempotent). |
| 6 | Customer picker `getCustomerMerchant` (~1953) has NO `isActive` filter; resolver/favourites/review/redemption key on `isActive`; feeds filter `isActive:true`+merchant ACTIVE. | Add a `lifecycleStatus = PENDING_CREATE` exclusion to the picker, `enrichBranchTiles`, each feed, the resolver, favourites, review, redemption. PENDING_CLOSE stays visible; CLOSED excluded by `deletedAt`. | The picker is the primary leak; status (not `isActive`) is the authoritative gate. |
| 7 | `createBranchCore` is shared by the merchant route AND admin create-draft-on-behalf. | The `stageForApproval` param keeps the admin path instant; only the merchant self-create on an ACTIVE merchant stages. | Prevents the admin from approving their own draft. |
| 8 | Migrations are additive dated dirs; applied local-dev-first, staging/prod via `migrate deploy` (canManageVouchers precedent). | One additive migration: `lifecycleStatus` column (default LIVE) + `closeReason` + index + two `ALTER TYPE ADD VALUE`. | Purely additive; existing rows default LIVE. |

---

## 13. PR shape + sequencing

- PR-5 is Tier-3 (schema). It stacks AFTER PR-1/PR-2/PR-3 (it uses the PR-1 merchant-web surface; it reuses, but does NOT adopt, the PR-2 guard). It MAY split into create / close sub-PRs if the diff is large (D5 allows "staged across separate PRs if needed but one shared lifecycle model"); a recommended split is (5a) schema + CREATE backend + admin create-review + customer-exclusion + merchant create UI; (5b) CLOSE backend + admin close-review + merchant close UI. Both share the one `BranchLifecycleStatus` model.
- Suggested order within each: schema/migration; backend service + applier + auth; customer-exclusion across all read paths; admin-web actioner; merchant-web UI; tests.
- Out of scope: PR-6 (Google lookup), PR-7 (alerts), PR-8 (multi-window), and any change to the customer redemption/review semantics beyond the pending-create exclusion.

No implementation until this mini-spec is owner + Codex approved.

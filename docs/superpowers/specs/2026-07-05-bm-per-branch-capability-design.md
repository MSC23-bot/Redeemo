# Design spec: Branch-Manager per-branch capability signal (D-BM1)

Status: DRAFT design spec for owner approval. IMPLEMENTATION IS OWNER-GATED - D-BM1 changes a merchant-facing API contract and roughly twelve permission-adjacent UI gates; per repository governance it requires this spec + the companion plan to pass review, then explicit owner approval, before any code.
Companion implementation plan: `docs/superpowers/plans/2026-07-05-bm-per-branch-capability-signal.md`.
Provenance: source inspection ran at `aaf7f382`; this PR is based on main `8831e55a`. Proven equivalent: `git diff aaf7f382..8831e55a` touches exactly one file (`docs/runbooks/r1-key-rotation-activation-runbook.md`) - zero overlap with any anchor cited below, so every file:line citation remains byte-accurate at the base.

## 1. Problem and scope

The backend authorizes assigned Branch Managers per-branch; merchant-web hides BM-eligible actions behind a blunt owner signal, and derives that signal two different ways on different surfaces. This spec defines ONE additive capability signal, its exact contract, and the complete flip matrix. Photo-Remove BM parity and staff-list widening are SEPARATE OWNER DECISIONS and remain untouched (confirmed at §13).

## 2. Current authorization predicates (verified source of truth)

`MerchantContext` (`src/api/merchant/shared.ts:124-131`): `{ adminId, merchantId, role: 'OWNER'|'BRANCH_MANAGER'|'STAFF', allBranches: boolean, allowedBranchIds: string[], canManageVouchers: boolean }`, computed by `resolveMerchantContext` (`:134-142`) from the single ACTIVE membership (`getActiveMembership`, `src/api/shared/merchantMembership.ts:74-95`; >1 ACTIVE membership throws MULTI_MEMBERSHIP_UNSUPPORTED; SUSPENDED merchant throws).

The four asserts (`src/api/merchant/shared.ts:144-165`):
- `assertOwner`: role === OWNER.
- `assertCanManageVouchers`: OWNER || canManageVouchers.
- `assertBranchAllowed(ctx, branchId)`: allBranches || allowedBranchIds includes branchId (READ scope; admits STAFF).
- `assertCanManageBranch(ctx, branchId)`: OWNER, or BRANCH_MANAGER with (allBranches || assigned). STAFF always denied. THIS is the predicate the new signal mirrors.

`resolveAdminMerchant` (`shared.ts:72-91`) is the separate OWNER-only resolver (safe default-deny); routes on it have no per-branch concept and are owner-only by construction.

### Role/assignment matrix per branch route (verified against routes.ts + service asserts)

| Route | Gate | OWNER | assigned BM | unassigned BM | STAFF (assigned) |
|---|---|---|---|---|---|
| GET /branches (list) | scoped query | all rows | allowed rows | allowed rows (their set) | allowed rows |
| GET /branches/:id | assertBranchAllowed | yes | yes | NO (403) | yes |
| PATCH /branches/:id entry | assertCanManageBranch | yes | yes | no | no |
| PATCH `isActive` / `isMainBranch` sub-gates | + assertOwner | yes | no | no | no |
| PATCH sensitive fields, DRAFT WINDOW (merchant REGISTERED / NEEDS_CHANGES) | + assertOwner (service.ts:603) | yes | no | no | no |
| PATCH sensitive fields, LIVE -> edit-request lane | assertCanManageBranch | yes | yes | no | no |
| hours / amenities / redemption-alerts / photo add+upload / edit-request create+withdraw | assertCanManageBranch | yes | yes | no | no |
| PIN reveal / change / send | assertCanManageBranch | yes | yes | no | no |
| create / pending-create cancel / close request+withdraw / soft-delete / photo instant-REMOVE | resolveAdminMerchant (owner-only; photo-remove = explicit D-PR3-4 exception) | yes | no | no | no |
| GET /merchant/staff family | assertOwner | yes | no | no | no |

## 3. The defect being fixed (two divergent FE derivations)

- Branch pages: `useBranchCapability` (`apps/merchant-web/lib/branches/useBranchCapability.ts`) derives owner-ness from a 403-vs-200 PROBE against the assertOwner-gated `GET /merchant/staff`. Its justifying comment ("no membership role on the session today") is STALE - `viewerCapabilities.role` has existed since #364.
- Quick-Actions: reads `viewerCapabilities.role` directly (`QuickActionsMenu.tsx:82`) and gates the PIN row on OWNER, with the in-code comment naming this exact deferral.
The same conceptual decision has two independent sources that can silently diverge; and the blunt owner signal hides BM-eligible actions (most visibly the whole PinCard: `if (!isOwner) return null`).

## 4. The contract: additive viewerCapabilities on GET /merchant/branches/:id

Response gains an additive block:

```text
viewerCapabilities: { canManage: boolean }
```

- Computed in `getBranch` from the `MerchantContext` ALREADY in memory (zero extra queries): `canManage = role === 'OWNER' || (role === 'BRANCH_MANAGER' && (allBranches || allowedBranchIds.includes(branchId)))`.
- SHARED PREDICATE OWNERSHIP: the boolean is produced by a new exported pure helper (e.g. `canManageBranchPredicate(ctx, branchId)`) and `assertCanManageBranch` is REWRITTEN to call the same helper (assert = throw-on-false wrapper). One function body; the emitted capability and the backend assertion CANNOT drift. Pinned by a matrix test that drives both the helper and the assert across all role/assignment combinations.
- Composed AFTER `toMerchantBranch` (the #377 pin-hygiene sanitizer) so the wire-hygiene chain is preserved; the block is additive and never carries ids or assignment lists (a boolean only - no allowedBranchIds leak).
- `listBranches` is NOT extended in v1: no consumer needs per-row canManage (the list is already scope-filtered server-side for non-owners, and Quick-Actions gating needs only the coarse role - §8).

## 5. merchant-web schema, types and data threading

- `apps/merchant-web/lib/api/branch.ts` `branchSchema` gains an explicit optional block: `viewerCapabilities: z.object({ canManage: z.boolean() }).optional()` (explicit, not passthrough-reliant - the #377 correction round's lesson).
- Threading: `useBranch(branchId)` (existing hook, unchanged query) -> `BranchDetail` computes `canManage` ONCE via a new `useBranchViewerCapability(branch)` accessor and threads it to sections alongside the retained `isOwner` where owner-only gates persist. Components take honest named props (`canManage`, `isOwner`) - no overloading.
- `useBranchCapability`'s `GET /staff` probe is RETIRED: the hook's owner signal re-derives from `viewerCapabilities.role` on the profile (the same source Quick-Actions uses). External hook shape preserved where owner-ness is genuinely needed.

## 6. Fail-closed behaviour (missing / malformed / stale)

- Block ABSENT (older backend during deploy skew, or loading): `canManage` resolves FALSE -> BM-eligible controls stay hidden, exactly today's behaviour. Skew can only under-show, never over-show. `isOwner` (profile-role-derived) is independently available, so OWNERS retain full controls even against an older branch payload - owner experience is skew-immune.
- Block malformed: the explicit zod field fails closed to absent (optional) via safeParse-compatible shape; no throw path renders a broken page.
- Stale mid-session (membership changed after fetch): the UI hint may lag until refetch; the backend asserts remain the boundary - a revoked BM gets a 403 on submit with the standard error surface. This is the standing, accepted pattern (identical to `viewerCapabilities` on the profile and `useVoucherCapability`).

## 7. Frontend/backend version-skew behaviour (explicit)

- OLD backend + NEW frontend: no `viewerCapabilities` block on branch payloads -> `canManage` false -> assigned BMs keep today's (restricted) experience; OWNERS unaffected (§6). NO functional regression for any role; strictly no over-grant. No compatibility bridge is required (unlike #377's pin field, where absence LOST existing owner-visible state; here absence merely delays a new grant).
- NEW backend + OLD frontend: the additive block is ignored by the old FE. Fully compatible.
- Ship order therefore free, but one PR carrying both sides remains the recommended shape.

## 8. LIVE vs onboarding-draft gate behaviour

BranchDetailsCard / LocationCard edit affordances are state-aware: the LIVE-merchant path routes to the BM-eligible edit-request lane, but the SAME buttons drive an assertOwner direct write during the onboarding draft window (merchant REGISTERED / onboardingStep NEEDS_CHANGES - `service.ts:603`). FE gate: `canManage && (!isDraftWindow || isOwner)`, with `isDraftWindow` read from the merchant profile lifecycle the surface already has. Pinned by a draft-window matrix (owner-in-draft: enabled; BM-in-draft: hidden; BM-live: enabled).

## 9. Flip / must-not-flip matrix (verified against §2)

FLIP to `canManage`: PinCard (reveal/change/send); ContactCard edit; OpeningHoursCard edit/cancel; AmenitiesCard edit; RedemptionAlertsCard toggle (recipients sub-list does NOT - it reads the assertOwner-gated staff family); PendingEditsList withdraw; BrandingPhotosCard ADD-photo; BranchDetailsCard/LocationCard edit per §8.

MUST NOT FLIP (stay `isOwner` or absent): MainBranchControl; any future isActive toggle; Add-branch CTA; BranchLifecycleBanner cancel/withdraw; CloseBranchSection; BrandingPhotosCard per-photo REMOVE (explicit D-PR3-4 owner-only exception + open owner decision); StaffAtBranchCard; the alerts recipients sub-list. Regression-pinned: an assigned BM must NOT see any of these render.

## 10. Quick-Actions assignment safety

The PIN row gate widens from `role === 'OWNER'` to `role === 'OWNER' || role === 'BRANCH_MANAGER'`. Safety chain: (1) the branch list Quick-Actions fetches is scope-filtered server-side, so a BM sees ONLY assigned branches (allBranches or the assigned set); (2) every listed branch therefore satisfies assertCanManageBranch for that BM; (3) the PIN reveal itself remains assertCanManageBranch-gated server-side, so even a defect in (1) cannot over-reveal. STAFF keeps no PIN row (role gate) and is server-denied regardless. Pinned by BM-with-assignment (row present, scoped list) and STAFF (row absent) cases.

## 11. Rollback and compatibility

Revert-the-PR rollback: the additive block disappears; the FE falls back to `canManage=false` + profile-role owner signal - no data, schema or migration involved; no stored state. The retired staff-probe is deleted, so a rollback restores it via git revert only (acceptable; the probe is stateless). No provider/env change.

## 12. Test and mutation matrix

- Backend: shared-predicate matrix (helper vs assert, all role/assignment cells - drift impossible without a red test); getBranch emit pins (OWNER true / assigned BM true / STAFF false / unassigned BM unreachable pinned as 403 via assertBranchAllowed); sanitizer-chain pin (block present AND redemptionPin still absent, composing with #377).
- Frontend: hook pins (absent block -> false; malformed -> false; boolean passthrough); per-flipped-section BM-true/STAFF-false pairs; §8 draft-window matrix; §9 must-not-flip regression pins for an assigned BM; Quick-Actions §10 pair; retirement pin (no network call to /merchant/staff from the branch surfaces).
- Mutation probes (adversarial review): (a) couple emit and assert by re-inlining the predicate in one of them -> matrix test must fail; (b) flip the helper's BM arm to ignore assignment -> unassigned-BM cells fail; (c) FE: swap a must-not-flip gate to canManage -> its regression pin fails; (d) remove the draft-window guard -> BM-in-draft pin fails.
- Smoke lane: one BM-role journey follows as a SEPARATE slice (serialized on the shared e2e support files behind open smoke PRs).

## 13. Security boundary and untouched owner decisions

Frontend capability hints NEVER replace backend authorization - the asserts run on every request regardless of what the UI shows (standing invariant, restated in-code at the emit site). Photo-Remove BM parity (PR-3 mini-spec: unresolved owner decision) and widening the assertOwner-gated staff-list family remain SEPARATE OWNER DECISIONS, explicitly out of scope and unchanged by this design.

## 14. Source-to-design cross-check table

| Design element | Source anchor | Verified |
|---|---|---|
| MerchantContext shape + resolver | shared.ts:124-142; merchantMembership.ts:74-95 | yes |
| Four asserts incl. assertCanManageBranch predicate | shared.ts:144-165 | yes |
| Route matrix (§2 table) | routes.ts + service asserts (incl. isActive :548, isMainBranch :560, draft-window :603, photo-remove D-PR3-4) | yes |
| Stale probe + its stale comment | lib/branches/useBranchCapability.ts | yes |
| Quick-Actions role gate + deferral comment | QuickActionsMenu.tsx:82, :9-15, :198-208 | yes |
| PinCard owner-only hide | PinCard.tsx:63 region | yes |
| viewerCapabilities merchant-wide emit precedent | src/api/merchant/profile/service.ts:18-48 | yes |
| PR-3 mini-spec prior direction ("additive viewerCapabilities on GET /branches/:id") | 2026-06-23-...pr3-photos-mini-spec.md:69,124 | yes |
| Roadmap residual (twice) + PR-2 BM writes shipped server-side | roadmap :32/:50/:49 | yes |
| #377 sanitizer composition point | src/api/merchant/branch/service.ts toMerchantBranch | yes (this session's PR) |
| Base provenance | git diff aaf7f382..8831e55a = 1 runbook file, 0 anchors | yes |

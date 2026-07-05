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
- SHARED PREDICATE OWNERSHIP: the boolean is produced by a new exported pure helper (e.g. `canManageBranchPredicate(ctx, branchId)`) and `assertCanManageBranch` is REWRITTEN to call the same helper (assert = throw-on-false wrapper). One function body; the emitted capability and the backend assertion CANNOT drift.
- STRUCTURAL CONTRACT GUARD (corrected round 3 - a behavioural assert-vs-helper comparison is tautological once the assert delegates): two-layer guard instead. (a) Delegation pin: the helper module export is spied (vi.spyOn on the module namespace the assert imports) and `assertCanManageBranch` is proven to CALL it (spy invoked with the same ctx/branchId; assert throws exactly when the spy returns false). (b) Single-definition-site pin: a static source guard test reads `src/api/merchant/shared.ts` (+ the emit site) and asserts the FULL BM authorization combination - `role === 'BRANCH_MANAGER'` adjacent to `allowedBranchIds.includes` in one predicate expression - appears in EXACTLY ONE function body, the helper, and that both `assertCanManageBranch` and the `getBranch` capability emit reference the helper by name with no inlined duplicate of that combination. IMPLEMENTER NOTE: the bare `allowedBranchIds.includes` token alone is NOT unique and must not be the match target - `assertBranchAllowed` (shared.ts:151) legitimately uses it for the separate role-free READ-scope predicate and stays untouched; the guard matches the role-qualified combination only. Layer (b) is what makes silent re-inlining (the drift the guard exists to prevent) a red test even though (a) alone would still pass a copy-then-also-call mutation. The helper itself keeps the full role/assignment matrix unit suite.
- Composed AFTER `toMerchantBranch` (the #377 pin-hygiene sanitizer) so the wire-hygiene chain is preserved; the block is additive and never carries ids or assignment lists (a boolean only - no allowedBranchIds leak).
- `listBranches` is NOT extended in v1: no consumer needs per-row canManage (the list is already scope-filtered server-side for non-owners, and Quick-Actions gating needs only the coarse role - §8).

## 5. merchant-web schema, types and data threading

- `apps/merchant-web/lib/api/branch.ts` `branchSchema` gains an explicit typed block with a NON-THROWING malformed-to-absent contract (corrected round 3 - a plain `.optional()` object would THROW under `branchSchema.parse()` when the block is present but malformed, contradicting §6):

```text
viewerCapabilities: z.object({ canManage: z.boolean() }).optional().catch(undefined)
```

  `.catch(undefined)` is zod's per-field fallback: a missing block parses to `undefined`; a valid block parses typed; a malformed block (wrong shape, `canManage` of the wrong type, or an explicit `null`) resolves to `undefined` INSTEAD of throwing, so the page renders and the capability simply reads absent. The contract stays explicitly typed (`{ canManage: boolean } | undefined`). Pinned by a seven-case parse suite: block missing; valid `true`; valid `false`; malformed object (e.g. `{ canManage: "yes" }`); wrong-type block (e.g. a string); explicit `null`; and a page-level render pin proving the branch page stays usable (no throw) when the backend sends a malformed block.
- Threading: `useBranch(branchId)` (existing hook, unchanged query) -> `BranchDetail` computes the EFFECTIVE capability ONCE via a new `useBranchViewerCapability(branch)` accessor and threads it to sections alongside the retained `isOwner` where owner-only gates persist. Components take honest named props (`canManage`, `isOwner`) - no overloading.
- EFFECTIVE UI CAPABILITY (corrected round 3 - flipping components solely to the branch block would hide OWNER controls whenever an older backend omits it):

```text
effectiveCanManage = role === 'OWNER' || (role === 'BRANCH_MANAGER' && branchCapability?.canManage === true)
```

  where `role` is the profile-derived `viewerCapabilities.role` (the same fail-closed source the shell nav uses) and `branchCapability` is the parsed branch block. Owner authorization is independently established by the profile role, so the branch block can NEVER subtract from an owner (absent, malformed, even an explicit `false` - the block is a per-branch BM grant signal, not an owner revocation channel). The role qualifier simultaneously closes the untrusted-widening question: a `true` block cannot widen STAFF or an unknown/null role because the formula requires BRANCH_MANAGER explicitly - defence-in-depth on top of the fact that a STAFF `true` is impossible-by-construction server-side (the emit uses the shared assertCanManageBranch predicate, which denies STAFF). Backend authorization remains authoritative regardless.
- `useBranchCapability`'s owner signal re-derives from `viewerCapabilities.role` on the profile (the same source Quick-Actions uses); external hook shape preserved. SKEW AMENDMENT (correction round, #381): the `GET /staff` probe is NOT yet fully retired - it survives as a TEMPORARY OWNER-ONLY fallback that fires only when the profile SUCCEEDED and carries no role (a pre-#364 backend). Probe 200 establishes OWNER only; 403 or any error fails closed to null (never Branch Manager - STAFF receives the same denial); modern roles never invoke it; disabled/unauthenticated performs no requests. Removal trigger: a confirmed Railway backend deployment carrying the #364 profile-role contract. The long-term design remains probe-free.
- FRESH-SESSION AMENDMENT (second correction round, #381): BOTH the modern profile-role path and the legacy probe require a result freshly settled for the CURRENTLY MOUNTED, currently authenticated session - cached React Query success is NEVER trusted for a capability decision. The merchant-web QueryClient is not cleared on logout/login and the `['merchantProfile']` / `['staff']` keys are identity-unscoped, so a non-owner signing in after an owner could otherwise briefly inherit cached OWNER data. Mechanism (TanStack v5.100.6 semantics verified from installed query-core source): capability-grade fresh-variant observers (`useMerchantProfileFresh` / `useStaffFresh`, same key + queryFn as the shared hooks; per-observer options leave other consumers untouched) with `staleTime: 0` + `refetchOnMount: 'always'` + focus/reconnect refetch disabled; a role is granted only when `isFetchedAfterMount && isSuccess` (`isFetchedAfterMount` compares data/error update counts against those captured at observer mount - queryObserver.ts:580 - so pre-mount cached success can never set it). `staleTime: 0` is load-bearing: a disabled-to-enabled flip fetches via `shouldFetchOptionally`, which requires staleness and IGNORES `refetchOnMount:'always'` - without it the late-enabling staff probe would not fetch over fresh-in-cache staff data and the hook would hang not-ready. While any required fresh request is outstanding (initial load OR the pre-settle refetch over cached data): `ready=false`, `role=null`, no owner/BM controls. A fresh error settles to `ready=true`, `role=null`. A post-settle background refetch does not revoke an already-fresh grant (revocation would flicker owner controls). IN-FLIGHT-ADOPTION HARDENING (adversarial review, same round): `isFetchedAfterMount` alone is NOT sufficient when the cache entry is EMPTY and a pre-mount request is still in flight - react-query dedups at the query level, so even a `refetchOnMount:'always'` observer ADOPTS the in-flight retryer promise (`query.fetch` returns it whenever `state.data` is undefined; the cancelRefetch branch requires data to exist), and the foreign resolution bumps the update counts post-mount, forging freshness off a request that may carry a PREVIOUS session's bearer (empirically proven: hook settled OWNER with the observer having issued zero fetches). Closure: an own-fetch gate - on mount/enable the hook first `cancelQueries` on the key (killing anything potentially adopted), then issues its OWN `refetch`, and the grant additionally requires that own fetch to have settled; every request starting after the cancel is post-mount and therefore carries the current session's bearer (apiFetch reads the token at issue time). Both gates are ANDed (`ownFetchSettled && isFetchedAfterMount`). Pinned by in-flight-adoption tests on both the profile and staff vectors plus cancel-removal mutation evidence. The broader unscoped-cache issue (all other consumers of the shared cached profile/staff, and cross-user cached-list display generally) is explicitly OUT OF SCOPE here and recorded as a separate auth/session hardening follow-up with a prepared source-grounded risk note; #381 does not redesign global session caching.

## 6. Fail-closed behaviour (missing / malformed / stale)

- Block ABSENT (older backend during deploy skew, or loading): `branchCapability` reads `undefined` -> the BM arm of `effectiveCanManage` is false -> BM-eligible controls stay hidden, exactly today's behaviour. Skew can only under-show, never over-show. The OWNER arm is role-driven and independent of the branch payload - CORRECTED CLAIM (#381): that makes owners skew-immune only once the PROFILE role exists (a #364+ backend). Against a pre-#364 backend the profile carries no role either, so the temporary owner-only probe fallback (§5) is what preserves the existing owner experience until the gated backend deployment; without it an absent role would read as settled non-owner and strip real owner controls.
- Block MALFORMED-PRESENT: `.catch(undefined)` resolves it to absent WITHOUT throwing (corrected round 3 - the earlier `.optional()`-only shape would have thrown under `parse()` and contradicted this section); the page renders normally and the capability reads absent.
- Stale mid-session (membership changed after fetch): the UI hint may lag until refetch; the backend asserts remain the boundary - a revoked BM gets a 403 on submit with the standard error surface. This is the standing, accepted pattern (identical to `viewerCapabilities` on the profile and `useVoucherCapability`).

## 7. Frontend/backend version-skew behaviour (explicit)

- OLD backend + NEW frontend: no `viewerCapabilities` block on branch payloads -> the BM arm of `effectiveCanManage` is false -> assigned BMs keep today's (restricted) experience. OWNERS: unaffected by formula ONLY when the profile role exists; a pre-#364 backend omits the profile role too, so the CORRECTED design ships the temporary owner-only probe fallback (§5) - absence of the probe WOULD have lost existing owner-visible state, the same regression class #377's pin bridge closed. The fallback can never over-grant (200=OWNER only; 403/error=null; BM/STAFF never inferred; the BM arm additionally requires the branch block an old backend cannot emit).
- NEW backend + OLD frontend: the additive block is ignored by the old FE. Fully compatible.
- Ship order therefore free, but one PR carrying both sides remains the recommended shape.

## 8. LIVE vs onboarding-draft gate behaviour

BranchDetailsCard / LocationCard edit affordances are state-aware: the LIVE-merchant path routes to the BM-eligible edit-request lane, but the SAME buttons drive an assertOwner direct write during the onboarding draft window (merchant REGISTERED / onboardingStep NEEDS_CHANGES - `service.ts:603`). FE gate: `effectiveCanManage && (!isDraftWindow || isOwner)` (the §5 effective formula, never the raw block), with `isDraftWindow` read from the merchant profile lifecycle the surface already has. Pinned by a draft-window matrix (owner-in-draft: enabled; BM-in-draft: hidden; BM-live: enabled).

## 9. Flip / must-not-flip matrix (verified against §2)

FLIP (all via `effectiveCanManage`, never the raw block): PinCard (reveal/change/send); ContactCard edit; OpeningHoursCard edit/cancel; AmenitiesCard edit; RedemptionAlertsCard toggle (recipients sub-list does NOT - it reads the assertOwner-gated staff family); PendingEditsList withdraw; BrandingPhotosCard ADD-photo; BranchDetailsCard/LocationCard edit per §8.

MUST NOT FLIP (stay `isOwner` or absent): MainBranchControl; any future isActive toggle; Add-branch CTA; BranchLifecycleBanner cancel/withdraw; CloseBranchSection; BrandingPhotosCard per-photo REMOVE (explicit D-PR3-4 owner-only exception + open owner decision); StaffAtBranchCard; the alerts recipients sub-list. Regression-pinned: an assigned BM must NOT see any of these render.

## 10. Quick-Actions assignment safety

The PIN row gate widens from `role === 'OWNER'` to `role === 'OWNER' || role === 'BRANCH_MANAGER'`. Safety chain: (1) the branch list Quick-Actions fetches is scope-filtered server-side, so a BM sees ONLY assigned branches (allBranches or the assigned set); (2) every listed branch therefore satisfies assertCanManageBranch for that BM; (3) the PIN reveal itself remains assertCanManageBranch-gated server-side, so even a defect in (1) cannot over-reveal. STAFF keeps no PIN row (role gate) and is server-denied regardless. Pinned by BM-with-assignment (row present, scoped list) and STAFF (row absent) cases.

## 11. Rollback and compatibility

Revert-the-PR rollback: the additive block disappears; the FE falls back to `canManage=false` + profile-role owner signal - no data, schema or migration involved; no stored state. The retired staff-probe is deleted, so a rollback restores it via git revert only (acceptable; the probe is stateless). No provider/env change.

## 12. Test and mutation matrix

- Backend: helper role/assignment unit matrix; STRUCTURAL GUARD two-layer pins per §4 (delegation spy + single-definition-site source guard - replaces the tautological assert-vs-helper behavioural comparison); getBranch emit pins (OWNER true / assigned BM true / STAFF false / unassigned BM unreachable pinned as 403 via assertBranchAllowed); sanitizer-chain pin (block present AND redemptionPin still absent, composing with #377).
- Frontend parse suite (seven cases, §5): missing block; valid true; valid false; malformed object; wrong canManage type; explicit null; page-usable-no-throw render pin.
- Frontend EFFECTIVE-CAPABILITY MATRIX (the §5 formula, pinned cell by cell): OWNER + block absent -> true; OWNER + malformed block -> true; OWNER + explicit false -> true (owner authorization is profile-role-established; the block is a BM grant signal, never an owner revocation channel); assigned BM + explicit true -> true; BM + absent -> false; BM + malformed -> false; BM + explicit false -> false; STAFF + any block including a forged true -> false; unknown/null role + any block -> false.
- Frontend behaviour pins: per-flipped-section BM-true/STAFF-false pairs; §8 draft-window matrix; §9 must-not-flip regression pins for an assigned BM; Quick-Actions §10 pair; retirement pin (no network call to /merchant/staff from the branch surfaces).
- Mutation probes (adversarial review): (a) re-inline the predicate in the assert or the emit -> the single-definition-site guard fails; (b) flip the helper's BM arm to ignore assignment -> unassigned-BM cells fail; (c) FE: swap a must-not-flip gate to effectiveCanManage -> its regression pin fails; (d) remove the draft-window guard -> BM-in-draft pin fails; (e) drop the role qualifier from effectiveCanManage (raw `capability === true`) -> the STAFF-forged-true and OWNER-absent cells fail; (f) swap `.catch(undefined)` for plain `.optional()` -> the malformed-object and null parse cases fail.
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

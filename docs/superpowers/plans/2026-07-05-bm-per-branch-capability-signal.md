# Plan: Branch-Manager per-branch capability signal (merchant-web)

Status: DRAFT implementation plan for review. IMPLEMENTATION IS OWNER-GATED: D-BM1 changes a merchant-facing API contract and ~12 permission-adjacent UI gates, so it requires the companion design spec + this plan to pass review, then explicit owner approval, before any code.
Companion design spec: `docs/superpowers/specs/2026-07-05-bm-per-branch-capability-design.md` (owns the durable design semantics: contract, predicate ownership, fail-closed + skew behaviour, flip matrices, test/mutation matrix; this plan owns execution sequencing).
Provenance (corrected 2026-07-05 round 2): the source inspection ran at `aaf7f382`; this PR is BASED ON main `8831e55a` (main moved via the #376 docs merge from a parallel session). Proven equivalent: `git diff aaf7f382..8831e55a` touches exactly one file (docs/runbooks/r1-key-rotation-activation-runbook.md) - zero overlap with any cited anchor, so every citation remains byte-accurate at the base.
Closes the twice-recorded roadmap residual: "extend the [Quick-Actions] PIN row to eligible assigned Branch Managers when PinCard gains a per-branch capability signal" (roadmap :32, :50). Server-side BM-scoped writes are FULLY SHIPPED (PR-2, `205db89e`); ONLY the frontend signal is outstanding.

## 0. Problem

The backend authorizes assigned Branch Managers per-branch (`assertCanManageBranch`, `src/api/merchant/shared.ts:158-165`), but merchant-web threads a blunt `isOwner` into the entire branch surface, hiding BM-eligible actions (most visibly the whole PinCard). Worse, TWO divergent owner-signal derivations coexist today:
- Branch pages: `useBranchCapability` derives owner-ness from a 403-vs-200 PROBE against the `assertOwner`-gated `GET /merchant/staff` (`apps/merchant-web/lib/branches/useBranchCapability.ts`) - its own comment ("no membership role on the session today") is STALE since #364 shipped `viewerCapabilities.role`.
- Quick-Actions: reads `viewerCapabilities.role` directly (`QuickActionsMenu.tsx:82`).
The same conceptual decision (may this person touch branch PINs) has two independent sources that can silently diverge.

## 1. Design decision (D-BM1): additive per-branch block + probe retirement

Chosen: the PR-3 mini-spec's recorded direction (mini-spec :69, :124) - **option (a) with a coarse-role cleanup**:

1. **Backend additive**: `GET /merchant/branches/:id` gains `viewerCapabilities: { canManage: boolean }` computed from the `MerchantContext` ALREADY in memory in `getBranch` (zero extra queries): `canManage = role === 'OWNER' || (role === 'BRANCH_MANAGER' && (allBranches || allowedBranchIds.includes(branchId)))` - the exact `assertCanManageBranch` predicate, factored into a shared pure helper so the emit and the assert cannot drift (drift-proofing = the spec §4 two-layer STRUCTURAL guard: delegation spy + single-definition-site source pin, NOT a behavioural assert-vs-helper comparison, which is tautological once the assert delegates). Emitted through `toMerchantBranch` composition so the pin-hygiene sanitizer chain (#377) is preserved. `listBranches` is NOT extended in v1 (no consumer needs per-row canManage: the list is already scope-filtered server-side for non-owners).
2. **Probe retirement (AMENDED #381 correction round)**: the modern path reads `viewerCapabilities.role` from the profile (one source of truth with Quick-Actions); the `GET /staff` probe survives ONLY as a temporary owner-only skew fallback (fires solely when the profile succeeded with no role - a pre-#364 backend; 200=OWNER only, 403/error=fail-closed null, never BM/STAFF). Removal trigger: a confirmed Railway deployment carrying the #364 profile-role contract; the probe and its comment die then. FRESH-SESSION AMENDMENT (second #381 correction round): both the modern role path and the legacy probe require a result freshly settled after the current observer mount (`isFetchedAfterMount && isSuccess` on capability-grade fresh observers: `staleTime: 0` + `refetchOnMount: 'always'`, focus/reconnect refetch off) - cached React Query success is NEVER trusted, because the QueryClient survives logout/login and the keys are identity-unscoped. While a required fresh request is outstanding: ready=false, role=null, no controls. `staleTime: 0` is load-bearing for the late-enabling probe (a disabled-to-enabled flip fetches only via staleness; `refetchOnMount:'always'` does not apply there - TanStack v5.100.6, verified from installed source). IN-FLIGHT-ADOPTION HARDENING (same round): with an EMPTY cache entry and a pre-mount in-flight request, react-query dedup lets even a refetchOnMount:'always' observer adopt the foreign promise and `isFetchedAfterMount` flips on ITS resolution - so the hook additionally cancels in-flight fetches on the key at mount/enable and gates on its OWN post-cancel refetch settling (`ownFetchSettled && isFetchedAfterMount`). The broader unscoped-cache issue is a separate auth/session hardening follow-up (prepared risk note); #381 does not redesign global session caching.
3. **UX hints only**: backend asserts remain the boundary (the standing invariant, `profile/service.ts:27-31`). The signal can go stale mid-session on membership change; a 403 on submit remains the honest fallback.

Rejected: (b) shipping `allowedBranchIds` inside `viewerCapabilities` (duplicates the predicate client-side and leaks the full assignment list where only a boolean is needed); (c) a dedicated capabilities endpoint (a third capability surface with a fresh cache-coherency axis, no precedent).

## 2. What flips (backend already permits OWNER-or-assigned-BM)

PinCard (reveal/change/send) - the headline residual; Quick-Actions PIN row (gate becomes `role === 'OWNER' || role === 'BRANCH_MANAGER'`; safe because `listBranches` already returns ONLY allowed branches for scoped members, and `assertCanManageBranch` admits assigned BMs on every PIN route); ContactCard edit; OpeningHoursCard edit/cancel; AmenitiesCard edit; RedemptionAlertsCard toggle (its recipients sub-list does NOT flip - see §3); PendingEditsList withdraw; BrandingPhotosCard add-photo.

All flips consume the spec §5 EFFECTIVE capability, never the raw block: `effectiveCanManage = role === 'OWNER' || (role === 'BRANCH_MANAGER' && branchCapability?.canManage === true)` - owner controls are profile-role-driven (skew-immune only once a #364+ backend emits the profile role - the temporary owner-only probe fallback covers the pre-#364 window - and, per the fresh-session amendment, only after the role source has freshly settled for the mounted session); a forged or erroneous `true` cannot widen STAFF or unknown roles (role-qualified); the branch block is parsed via the spec §5 non-throwing `.catch(undefined)` contract.

State-aware pair: BranchDetailsCard / LocationCard edit buttons flip for LIVE merchants (edit-request lane is BM-eligible) but must stay owner-gated during the onboarding draft window (the same button drives an `assertOwner` direct write there - `service.ts:603`). Gate: `effectiveCanManage && (!isDraftWindow || isOwner)`, with the FE draft-window read from the profile lifecycle the surface already has.

## 3. What must NOT flip (verified owner-only, or separate owner decisions)

- Owner-only by backend construction: MainBranchControl (`assertOwner`), Add-branch CTA (`resolveAdminMerchant`), BranchLifecycleBanner cancel/withdraw, CloseBranchSection, per-photo Remove (explicit D-PR3-4 exception), any future `isActive` toggle.
- Separate OWNER DECISIONS, explicitly out of scope here: photo-Remove BM parity (the PR-3 mini-spec names it an unresolved owner decision); widening the `GET /staff` family (StaffAtBranchCard + the alerts recipients sub-list depend on it - a Staff & Access decision, not a branch-surface one).
- `isOwner` remains a real prop where owner-only gates persist; components carrying both gates take both signals honestly rather than overloading one.

## 4. Verification design

- Backend pins on `getBranch`: canManage true for OWNER; true for assigned BM; false for STAFF-assigned; unassigned BM cannot reach the route at all (assertBranchAllowed 403 - pinned as the reachability boundary). Drift-proofing via the spec §4 STRUCTURAL guard (delegation spy + single-definition-site source pin), plus the helper's own role/assignment unit matrix.
- FE: the spec §5 seven-case parse suite + the spec §12 effective-capability matrix (incl. OWNER-with-absent/malformed/false-block -> true and STAFF-forged-true -> false); hook tests replace the probe-contract pins; every flipped section gets BM-true/STAFF-false cases; the state-aware pair gets draft-window matrix cases; Quick-Actions gets BM-with-assignment (PIN row present, scoped list) and STAFF (absent) cases; a regression pin that MainBranchControl/close/lifecycle/Add-branch/photo-Remove do NOT render for an assigned BM.
- Smoke lane: one BM-role journey extension (roles.spec.ts pattern) after the unit layer lands - separate follow-up slice to avoid support-file contention with open smoke PRs.

## 5. Size, risk, sequencing

M (bounded): 1 backend file + shared predicate + pins; 1 hook rewrite; ~12 FE components touched (mostly one-line gate swaps); test updates across the section suites. Risks: missed owner-only gate accidentally widened (mitigated by §3's verified matrix + regression pins); draft-window nuance (state-aware gate + matrix tests); signal staleness (accepted, standing pattern). No schema, no migration, no auth change - the additive wire block is the PR's explicit subject. Sequencing: single PR after this plan lands; the BM smoke journey follows separately.

## 6. Open items for the owner (recorded, not blockers to the plan)

- Photo-Remove BM parity and staff-list widening stay open owner decisions (unchanged by this plan).
- Implementation is OWNER-GATED (corrected round 2, superseding the earlier autonomous-follow wording): D-BM1 proceeds only after the corrected spec + plan are reviewed AND the owner explicitly approves.

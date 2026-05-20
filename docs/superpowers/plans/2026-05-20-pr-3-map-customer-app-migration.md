# PR-3: Phase 2.2 — Customer-app Map migration to branch-first pins

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline batched-checkpoint execution) — single-engineer, owner-in-loop, Tier 2 surface rebaseline. Do NOT subagent-fan this; the visual + interaction iteration loop with the owner is the load-bearing part of the work.

**Status:** ⏳ Planning. NOT STARTED. Owner approval gate at the end of this document before any code.

**Goal:** Migrate the customer-app Map surface to consume the branch-first `BranchTile` wire shape shipped end-to-end by PR #112. One pin per branch with exact coords; the bottom carousel keys on `branch.id`; tapping a carousel card routes to `/(app)/merchant/<id>?branch=<branchId>`. Backend `getInAreaBranches` is MANUALLY_CONFIRMED-only by design — POSTCODE_CENTROID, NEEDS_REVIEW, and ADDRESS_GEOCODED branches never reach the customer-app on this route. PR-3 preserves that contract.

**Parent track:** Discovery rebaseline branch-first cardinality (Spec/Plan Rev 2.1/1.2 at `docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md` + `docs/superpowers/plans/2026-05-18-discovery-rebaseline-branch-first.md`). This is **Phase 2.2** after **Phase 2.1 Search ✅ SHIPPED 2026-05-20 (PR #112 merge `a1b0f04`)**.

**Predecessor baselines (locked, do not regress):**
- `memory/project_discovery_rebaseline_pr2_complete.md` — PR #112 Search baseline
- `memory/project_discovery_rebaseline_phase1_complete.md` — backend Phase 1 (PR #110)
- `memory/project_discovery_rebaseline_task_2_1_0_complete.md` — backend scope parity (PR #111)
- `memory/project_branch_first_class_platform_rules.md` — branch-first product rules
- `memory/project_location_confidence_redaction_contract.md` — PR #81 redaction contract

---

## 1. What is in scope

### 1.1 Backend (additive — already exists, just need to wire from the client)

The backend `getInAreaBranches` helper landed in Phase 1 (PR #110, see plan Task 1.6) alongside `getInAreaMerchants`. Customer-app currently still reads `merchants` from `/api/v1/customer/discovery/in-area`. This PR flips the client to read `branches` instead.

**Backend scope in this PR:** zero new endpoints, zero new service helpers. If anything is genuinely missing from the in-area branches projection (e.g. parity with what `MapMerchantTile` reads today), it gets recorded as a NEW deferred entry (e.g. §CK), NOT added inline to PR-3.

**Test scope on backend:** read-only. No new backend test files. Existing `tests/api/customer/discovery/in-area-branches.test.ts` already pins the wire contract.

### 1.2 Customer-app — six files

Three small **additive folds** are bundled into the same files PR-3 already modifies (locked owner direction 2026-05-20 from the Map rebase/transplant audit — see §1.5 "Safe folds" below for the rationale). They close real visible bugs without touching the §BC/§BF/§BI marker-bitmap path and without expanding the failure surface.

| File | Action |
| --- | --- |
| `apps/customer-app/src/features/map/hooks/useInAreaMerchants.ts` | RENAME → `useInAreaBranches.ts`. **Return the full response, not just `branches[]`** (owner-locked 2026-05-20). The hook keeps `select: r => r` so `MapScreen` can read `data.branches`, `data.totalBranches`, `data.branchMeta.effectiveLocality`, and `data.branchMeta.rungCounts` from a single hook call. `BoundingBox` type export stays unchanged. |
| `apps/customer-app/src/features/map/components/MapPins.tsx` | Replace `merchants: MerchantTile[]` prop with `branches: BranchTile[]`. Filter where `branchLatitude == null \|\| branchLongitude == null`. One `<Marker>` per branch. Preserve §BC/§BF/§BI marker-tracking + stable-dimensions fixes. **Fold 1**: `getPinColor()` reads `branch.merchant.primaryCategory.pinColour` (fallback to existing hardcoded palette only when the field is null). |
| `apps/customer-app/src/features/map/components/MapMerchantTile.tsx` | RENAME → `MapBranchTile.tsx`. Consume `branches: BranchTile[]`. Tap → `/(app)/merchant/${tile.merchant.id}?branch=${tile.id}` (new URL contract per §6.3). |
| `apps/customer-app/src/features/map/components/MapListView.tsx` | Consume `branches: BranchTile[]`. Reuse the new Search-side card vocabulary where it makes sense (see §9 below); tap row routes with `?branch=`. **Fold 2**: `getCategoryColor()` reads `branch.merchant.primaryCategory.pinColour` (same backend-first, palette-fallback rule as Fold 1). |
| `apps/customer-app/src/features/map/screens/MapScreen.tsx` | Replace `data?.merchants` with `data?.branches`; route both the in-area and filtered (`useSearch` with bbox) code paths through the same `branches` arm; navigate via `/(app)/merchant/${merchantId}?branch=${branchId}`. **Fold 3**: `<MapView showsUserLocation={remoteCityName === null}>` — suppress the blue user-location dot whenever a remote city is being browsed (LocationBadge is showing). |
| `apps/customer-app/src/lib/api/discovery.ts` | Rename method `getInAreaMerchants()` → `getInAreaBranches()` (the endpoint URL `/api/v1/customer/discovery/in-area` is unchanged — Phase 1 emits both `merchants` and `branches` in one response). Update return-type Zod schema to expose `branches: BranchTile[]` + `totalBranches` + `branchMeta` (existing fields, just typing). Recommended Option A — full rename for naming consistency with the hook rename + the §5.2 code sketch. Open for owner to choose Option B (keep method name `getInAreaMerchants` because endpoint URL didn't change — smaller diff, slightly misleading post-PR-3). |

### 1.5 Safe folds — rationale lock

The Map rebase/transplant audit (2026-05-20) confirmed that the §7 Map design from `docs/superpowers/specs/2026-04-17-customer-app-home-discovery-map-design.md` is ~80% transplanted onto main already via the initial Map rebaseline + 13 incremental PRs (#90–#103). The remaining gaps are predominantly polish + perf + product decisions, correctly deferred under §BA / §BA.1 / §BA.2.

Three specific gaps are **safe to fold into PR-3** because they meet all of: (a) closely coupled to the data-wire flip PR-3 is already doing, (b) low risk, (c) ≤5 lines net change each, (d) test-coverable inside the existing test files PR-3 already modifies, (e) do NOT touch the §BC/§BF/§BI marker-bitmap path.

| Fold | File | Change | Closes |
| --- | --- | --- | --- |
| **1** | `MapPins.tsx` | Read `branch.merchant.primaryCategory.pinColour` from backend | §7.2 spec — pins for non-Big-Four categories no longer all default to brandRose |
| **2** | `MapListView.tsx` | Read `branch.merchant.primaryCategory.pinColour` from backend | §7.8 spec — list-row thumbnail colours now match pin colours for the full category taxonomy |
| **3** | `MapScreen.tsx` | `showsUserLocation={remoteCityName === null}` | §7.7 spec — user-location dot no longer appears in Manchester while browsing from London |

Everything else from the §7 design that is NOT yet shipped (drop animation, selected-pin pulse, cluster pins, sort selector, region subtitle, swipe-down dismiss, camera-pan-to-selected-pin, gazetteer, richer pins from brainstorm `29364`, ADDRESS_GEOCODED policy, sparse-supply fill, marker symbol-layer / native-image migration, Map performance work) is **explicitly recorded under the new §CK Map design polish bucket** in `project_deferred_followups_index.md`. §CK cross-references §BA / §BA.1 / §BA.2 / §BA.3, the 2026-04-17 design spec, and brainstorm `29364-1776892625`.

### 1.3 Customer-app — tests (eight files)

| Test file | Action |
| --- | --- |
| `tests/features/map/useInAreaMerchants.test.tsx` | RENAME → `useInAreaBranches.test.tsx`. Mock response: `branches[]`. |
| `tests/features/map/MapPins.test.tsx` | Update mock data, add four pins: (a) one pin per branch; (b) defensive client-side filter — a fixture row with `branchLatitude: null` (regardless of `branchLocationConfidence`) renders ZERO markers, belt-and-braces against backend predicate regression; (c) two branches of same merchant → two distinct markers (Covelum bug closure); (d) **Fold 1** — when `branch.merchant.primaryCategory.pinColour` is set (e.g. `#5C6BC0` for a non-Big-Four category), the rendered marker uses that colour, NOT the hardcoded palette fallback. |
| `tests/features/map/MapMerchantTile.test.tsx` | RENAME → `MapBranchTile.test.tsx`. Pin: tap routes with `?branch=`. |
| `tests/features/map/MapListView.test.tsx` | Update mock data, pin `?branch=` URL. Add **Fold 2** pin: when `branch.merchant.primaryCategory.pinColour` is set, the row thumbnail uses that colour, NOT the hardcoded palette. |
| `tests/features/map/MapScreen.test.tsx` | Update mock + route assertions. Add **Fold 3** pin: when `remoteCityName !== null` (user has tapped a city in LocationSearch), `<MapView>` receives `showsUserLocation={false}`; when `remoteCityName === null`, it receives `showsUserLocation={true}`. |
| `tests/features/map/MapScreen.loader.test.tsx` | Mock updates if `merchants` is referenced. |
| `tests/features/map/MapScreen.locality.test.tsx` | Mock updates if `merchants` is referenced. |
| `tests/features/map/MapScreen.submit.test.tsx` | Mock updates if `merchants` is referenced. |

`tests/features/map/MapEmptyArea.test.tsx`, `tests/features/map/CustomPin.test.tsx`, `tests/features/map/LocationSearch.test.tsx` likely don't touch the merchants/branches shape; will audit and skip if no shape coupling.

### 1.4 Deferred items pulled into PR-3 (mandatory sub-tasks)

Per the standing rule "before starting any new workstream, gather all related deferred items and explicitly state what is in scope":

| Item | Scope in PR-3 | Reason |
| --- | --- | --- |
| **§M** branch-first cardinality | ✅ Closes one-pin-per-branch on Map | This IS Phase 2.2 — the umbrella |
| **§BY** cross-surface scope-pill label propagation | ✅ MANDATORY | If Map mounts `<ScopePillRow>` (it doesn't currently, but check), the rename is automatic via the shared component. The audit also covers any "UK-wide" string in Map-side copy / spec doc. |
| **§BA Covelum-confirmed instance (memory §M 2026-05-16)** | ✅ Verified at device-QA via the Covelum two-pin check | Same bug class Search closed at PR #112 — Map is the canonical "spatial" surface where the bug is most visible |
| **§CA Save badge pattern** | ⚠️ CONDITIONAL — see §9 below | Apply ONLY if `MapBranchTile` carousel cards or `MapListView` rows surface aggregate value (`totalEstimatedSaving`). Today `MapListView` shows `SavePill` reading `maxEstimatedSaving` — see §9 for the explicit decision. |
| **PR #81 location-confidence redaction contract** | ✅ MANDATORY pin | `hasExactPosition` server-side and client-side filter (`branchLatitude !== null && branchLongitude !== null`). Three test pins. |
| **§W production resilience checklist** | ✅ Consulted (no new backend work, so production-resilience exposure is bounded — see §10 below) | Standing checklist requires a pass-through review even when scope is small |
| **Fold 1** — pin colour from backend (`MapPins.tsx`) | ✅ FOLDED INTO PR-3 | Closes a §7.2 visual-correctness gap. ≤5 lines net. No touch to §BC/§BF/§BI bitmap path. Test pin in `MapPins.test.tsx`. |
| **Fold 2** — list thumbnail colour from backend (`MapListView.tsx`) | ✅ FOLDED INTO PR-3 | Closes a §7.8 visual-correctness gap. Same backend field as Fold 1. ≤5 lines net. Test pin in `MapListView.test.tsx`. |
| **Fold 3** — user-location dot suppression in remote browsing (`MapScreen.tsx`) | ✅ FOLDED INTO PR-3 | Closes a §7.7 UX-clarity gap (Map currently shows the blue dot in London while browsing Manchester). Single-prop change. Test pin in `MapScreen.test.tsx`. |
| **§CK Map design polish bucket** | ❌ DEFERRED — created by PR-3 | New deferred entry catalogues every remaining §7 design gap not folded into PR-3 (drop animation, pulse ring, clustering, sort selector, region subtitle, swipe-down dismiss, camera-pan-to-pin, drag-to-resize sheet, gazetteer, ADDRESS_GEOCODED policy, sparse-supply fill, marker symbol-layer / native-image migration, Map perf, richer pin variants from brainstorm `29364`). Cross-refs §BA / §BA.1 / §BA.2 / §BA.3 + 2026-04-17 design spec + brainstorm `29364-1776892625`. |

---

## 2. What is out of scope

Explicit out-of-scope to make sure these don't accidentally creep in:

| Item | Reason out of scope |
| --- | --- |
| Marker clustering for dense viewports | §CK / §BA.1 deferred — separate Tier 2 perf workstream |
| Map performance investigation (`/discovery/in-area` latency, request cancellation, smarter bbox caching, lighter pin-only endpoint, debounce tuning) | §CK / §BA.1 — separate workstream |
| Sparse-supply fill policy + `targetCount` spec-vs-code drift | §CK / §BA.2 — product decision |
| `LocationSearch` retired-to-gazetteer work | §CK / §BA — broader rebase bucket |
| Region/county subtitle on city suggestion rows (needs gazetteer or band-aid hardcode #4 — owner explicit "next gap → gazetteer not band-aid" rule applies) | §CK / §BA — gazetteer-blocked |
| `LocationBadge` ↔ `ViewportLocalityBadge` interaction polish | §CK / §BA — broader rebase bucket |
| Richer pin variants (logo / label / category icon / voucher-count badge — brainstorm `29364-1776892625`) | §CK — Tier 2 design workstream |
| Pin drop animation + selected-pin pulse ring | §CK — touches §BC/§BF/§BI bitmap path, high regression risk |
| Sort selector on `MapListView` header | §CK — needs product decision on options (cross-ref §CF Search-side) |
| Carousel "swipe-down to dismiss" gesture | §CK — polish |
| Camera-pan-to-keep-selected-pin-centred when swiping carousel | §CK — polish |
| Half-sheet "drag-to-resize" on `MapListView` (if missing from current `BottomSheet`) | §CK — to audit during pickup |
| Marker symbol-layer / native-image migration | §CK / §BA.1 — performance workstream |
| `ADDRESS_GEOCODED` branches getting pins | §CK / §BA — needs a confidence-threshold product decision |
| §BB Home `effectiveLocality` Home-header copy | Home surface (Phase 2.3) — does NOT affect Map; this PR is Map-only |
| §CD voucher keyword search | Search relevance — not a Map concern |
| §CE Search filters / §CF Search sort menu / §CG Recent searches / §CJ Search pagination | Search-tooling bundle — not Map |
| §CH animated illustration assets | Asset-blocked; not Map |
| §CI branch-level favourites migration | Separate Tier 3 workstream; Map keeps merchant-level heart same as Search currently does |
| §CB PressableScale tactile press feedback | Tier 1 polish; bundle with the next polish PR |
| §CC `<EmptyStateMessage>` Category copy refresh | Category surface (Phase 2.4) |
| §BX.1-§BX.7 backend filter/sort params | Bundle with §CE / §CF when Search tools workstream picks up |
| §BW customer-web test infrastructure | Customer-web side — not Map |
| Plan 4 M4 (Search + UX) + M5 (cleanup) | Unblocked by PR #112 but separate workstreams |
| Tile component rename `MerchantTile` → `BranchTile` cleanly | Phase 2.5 sweep |
| Phase 3 cleanup (remove `MerchantTile` / `rankMerchantsV2` / `enrichMerchantTile` / `classifyTier`) | Phase 3 — final cleanup PR |

---

## 3. Deferred items remaining deferred after PR-3 ships

After PR-3, the following stay open (re-list explicit to prevent forgotten follow-ups):

- §BX.1-§BX.7 (7 backend filter/sort params), §BX.8 (campaign fan-out scaling), §BX.9 (campaign route rename)
- §BY: complete after Phase 2.5 sweep (Map's share only — Home/Category still pending)
- §BA / §BA.1 / §BA.2 / §BA.3 — entire broader rebase + perf bucket
- **§CK Map design polish bucket — NEW, locked by PR-3** (catalogues every §7 design item not folded into PR-3; cross-refs §BA / §BA.1 / §BA.2 / §BA.3, the 2026-04-17 design spec, brainstorm `29364-1776892625`)
- §BB Home `effectiveLocality`
- §CA Save badge pattern propagation — Home/Category cards still pending
- §CB / §CC / §CD / §CE / §CF / §CG / §CH / §CI / §CJ — all still open
- §BW customer-web test infrastructure
- §W standing checklist — keeps applying to every future plan
- §AW merchandising badge layer (Tier 2 product design, locked branch-scoped)
- §AV POSTCODE_CENTROID merchant discoverability policy

**§CK is the canonical home for any Map polish gap surfaced during PR-3 device QA.** New device-QA findings extend §CK rather than spawning per-bug deferred entries.

---

## 4. What will visibly change on Map

For the user, the visible deltas after PR-3 lands:

1. **Multi-branch merchants now render as TWO (or more) pins** at appropriate viewports. Covelum at Brightlingsea + Colchester both show on a viewport that includes Essex. Today Map renders one pin per merchant (the nearest branch's coords), so Colchester is hidden when Brightlingsea is visible — same bug class Search closed.

2. **Carousel keyed on branch, not merchant.** Swiping the bottom carousel cycles through branches (a multi-branch merchant appears multiple times). Tapping a carousel card opens Merchant Profile pre-selected to that branch (`?branch=<branchId>`).

3. **Bottom-sheet list view (`MapListView`) keyed on branch.** A multi-branch merchant appears as multiple rows in the list. Each row navigates with `?branch=`.

4. **No surface change for POSTCODE_CENTROID / NEEDS_REVIEW / ADDRESS_GEOCODED branches on Map.** Backend `getInAreaBranches` is MANUALLY_CONFIRMED-only at the SQL predicate ([service.ts:3542-3558](src/api/customer/discovery/service.ts#L3542)); non-exact branches are excluded from BOTH the pin layer AND the list view on this route. This matches the shipped backend contract pinned by `tests/api/customer/discovery/in-area-branches.test.ts` (POSTCODE_CENTROID excluded line 286, ADDRESS_GEOCODED excluded line 302) and is consistent with `location-confidence-redaction.test.ts` line 169-170 ("list-view eligible but excluded from Map in-area"). Surfacing approximate-coord branches in the Map list-view tail is a future product/backend decision (see §CK.12) — NOT in PR-3.

5. **Pin colours respect the full category taxonomy** (Fold 1). Today only Food / Beauty / Fitness / Shopping pins use category-specific colour; every other category falls through to brandRose. PR-3 reads `branch.merchant.primaryCategory.pinColour` from the backend (which already ships for every category) so pins for e.g. Pets, Health, Auto, Education etc. render with their seeded brand colour. Visual: more colour variety on viewports with mixed categories. Big-Four colours unchanged.

6. **List-view thumbnails respect the full category taxonomy** (Fold 2). Same backend field as Fold 1, applied to the [MapListView.tsx](apps/customer-app/src/features/map/components/MapListView.tsx) row thumbnail. Visual: list rows now match their corresponding pin colour for the full taxonomy, closing the previous mismatch where pin and list thumbnail diverged for non-Big-Four categories.

7. **User-location dot disappears in remote browsing** (Fold 3). When the user has tapped a city in `<LocationSearch>` (LocationBadge is showing), `<MapView showsUserLocation>` flips to `false`. Today the blue dot remains at the user's real location while the map camera has moved to Manchester / Glasgow / wherever — making it look like the user has teleported. Visual: in remote mode the blue dot is hidden; on dismiss (X on LocationBadge or "Use current location") it returns.

8. **No other visual style changes**, no scope-pill row (Map doesn't mount `<ScopePillRow>`), no new copy, no new empty-state copy. Map looks the same modulo the cardinality change + the three category-colour / user-dot changes above.

**Locked NEGATIVE pins** (these do NOT change):

- No marker clustering UI (deferred §CK / §BA.1).
- No pin-cardinality change for single-branch merchants (one pin, same as today).
- No pin DROP animation, no selected-pin PULSE ring, no richer pin design (deferred §CK).
- No category-pill row redesign.
- No `LocationBadge` / `ViewportLocalityBadge` change.
- No empty-state copy change.

---

## 5. How one-pin-per-branch works

### 5.1 Wire shape (already shipped via PR #110 + PR #112)

`/api/v1/customer/discovery/in-area` returns `branches: BranchTile[]` (additive alongside legacy `merchants`). Each `BranchTile`:

```ts
{
  id: 'tax-branch-covelum-001',          // branch.id — the marker key
  branchName: 'Brightlingsea',
  branchLocalityName: 'Brightlingsea',
  branchPostTown: null,
  branchCity: 'Brightlingsea',
  branchLatitude: 51.8054,                // always non-null on Map (backend gates MANUALLY_CONFIRMED-only)
  branchLongitude: 1.0244,                // always non-null on Map (backend gates MANUALLY_CONFIRMED-only)
  branchLocationConfidence: 'MANUALLY_CONFIRMED',  // only MC reaches Map per `getInAreaBranches` predicate
  // ...other fields...
  merchant: {
    id: 'tax-merchant-covelum-001',       // grouping container
    businessName: 'Covelum Restaurant',
    tradingName: 'Covelum',
    primaryCategory: { ..., pinColour: '#E65100', pinIcon: null, ... },
    // ...
  },
}
```

For Covelum (2 active branches in dev DB): the wire returns 2 tiles, both with `merchant.id === 'tax-merchant-covelum-001'`, distinct `id`s, distinct `branchLatitude`/`branchLongitude`.

### 5.2 Client wire-up

`useInAreaBranches` — full-response shape (owner-locked 2026-05-20):

```ts
return useQuery({
  queryKey: ['discovery', 'in-area-branches', params],
  queryFn:  () => discoveryApi.getInAreaBranches({ ...bbox!, ...params }),
  select:   r => r,  // full response — Map consumes branches + totalBranches + branchMeta together
  enabled:  bbox != null,
  placeholderData: keepPreviousData,  // §AY preserved
})
```

**Why full response, not `select: r => r.branches`:** Map needs `totalBranches` for the list-toggle button label, `branchMeta.effectiveLocality` for the viewport-locality badge (Plan 4 M3b), and `branchMeta.rungCounts` for any future scope-aware messaging. Selecting only `branches` would force a second call or a parallel hook for the metadata. Locked at owner direction during the contract-mismatch review 2026-05-20.

`MapScreen.tsx`:
```ts
const branches = data?.branches ?? []
const total    = data?.totalBranches ?? branches.length
const meta     = data?.branchMeta ?? null  // effectiveLocality + rungCounts
```

`branchMeta` is the only meta envelope on the branch-first response — the legacy `meta` field belongs to the merchant-first variant which `useInAreaBranches` does not consume.

`MapPins.tsx`:
```ts
type Props = {
  branches:   BranchTile[]
  selectedId: string | null     // now branch.id, not merchant.id
  onPress:    (branch: BranchTile) => void
}
export function MapPins({ branches, selectedId, onPress }: Props) {
  return (
    <>
      {branches
        .filter(b => b.branchLatitude != null && b.branchLongitude != null)
        .map(branch => (
          <MapPinMarker
            key={branch.id}                      // branch.id — distinct per branch
            branch={branch}
            selected={selectedId === branch.id}
            onPress={onPress}
          />
        ))}
    </>
  )
}
```

`MapPinMarker` body:
```ts
function MapPinMarker({ branch, selected, onPress }) {
  const { branchLatitude, branchLongitude, merchant } = branch
  const [tracks, setTracks] = useState(true)
  // §BC/§BF/§BI marker-tracking + stable-dimensions PRESERVED — no change to that mechanism
  useEffect(() => {
    if (branchLatitude === null || branchLongitude === null) return
    setTracks(true)
    const t = setTimeout(() => setTracks(false), SELECTION_TRACK_MS)
    return () => clearTimeout(t)
  }, [selected, branchLatitude, branchLongitude])

  if (branchLatitude === null || branchLongitude === null) return null

  return (
    <Marker
      identifier={branch.id}
      coordinate={{ latitude: branchLatitude, longitude: branchLongitude }}
      onPress={() => onPress(branch)}
      tracksViewChanges={tracks}
    >
      <CustomPin
        // CustomPin still consumes letter + pin colour; pass via branch
        letter={merchant.businessName.charAt(0).toUpperCase()}
        pinColour={merchant.primaryCategory?.pinColour ?? getPinColor(branch)}
        selected={selected}
      />
    </Marker>
  )
}
```

Where `getPinColor(branch)` migrates the legacy category-name → colour heuristic to read `branch.merchant.primaryCategory?.name` (one-line change).

### 5.3 Marker key + identifier

`key={branch.id}` so React's reconciliation is branch-keyed. `identifier={branch.id}` so the map library's internal tracking (selection, focus, programmatic camera) keys per branch.

### 5.4 Selection state

`selectedId` becomes a `branch.id`, not `merchant.id`. `MapScreen.tsx` already has selection state (`selectedMerchant`); rename to `selectedBranch` (or `selectedBranchId`) and thread it through.

### 5.5 Carousel sync (same-coords overlap)

Per spec §4.2, two branches at near-identical coords (same shopping centre) both render as pins. Tap-to-select cycles between them via the carousel. v1 acceptance: tens-of-metres separation reads as distinct pins at typical zoom. Same-coordinate overlap defers to §BA.1 clustering work.

### 5.6 Pagination on Map

Map fetches by bounding box, not by paginated list, so `limit`/`offset` aren't user-visible. The backend `getInAreaBranches` does honour a default hard cap (validate in implementation) — if the dev DB grows past that cap, the bottom-list view drops branches. **No pagination UI added in PR-3** — same constraint as today. Owner-listed §CJ pagination is Search-specific.

---

## 6. Location confidence — backend gate + defensive client-side pin

### 6.1 The shipped backend contract

`getInAreaBranches` accepts **MANUALLY_CONFIRMED branches only**. The SQL predicate at [service.ts:3555](src/api/customer/discovery/service.ts#L3555) gates `locationConfidence: 'MANUALLY_CONFIRMED'` directly in the Prisma `where` clause, so POSTCODE_CENTROID / NEEDS_REVIEW / ADDRESS_GEOCODED branches never leave the database on this route.

| Confidence value | Eligible for Map in-area? |
| --- | --- |
| `MANUALLY_CONFIRMED` | ✅ Yes — appears as both pin and list-view tile |
| `ADDRESS_GEOCODED` | ❌ Excluded — does NOT appear on Map (pin or list) |
| `POSTCODE_CENTROID` | ❌ Excluded — does NOT appear on Map (pin or list) |
| `NEEDS_REVIEW` | ❌ Excluded — does NOT appear on Map (pin or list) |

**Pinned by tests:**
- [tests/api/customer/discovery/in-area-branches.test.ts:286](tests/api/customer/discovery/in-area-branches.test.ts#L286) — "POSTCODE_CENTROID branches inside the bbox are EXCLUDED"
- [tests/api/customer/discovery/in-area-branches.test.ts:302](tests/api/customer/discovery/in-area-branches.test.ts#L302) — "ADDRESS_GEOCODED branches inside the bbox are EXCLUDED (Map requires exact coords)"
- [tests/api/customer/discovery/location-confidence-redaction.test.ts:169-170](tests/api/customer/discovery/location-confidence-redaction.test.ts#L169) — "ADDRESS_GEOCODED branch — list-view eligible but excluded from Map in-area (the in-area predicate is MANUALLY_CONFIRMED-only)"

**Why MANUALLY_CONFIRMED-only on Map:**

Map pins claim spatial precision. POSTCODE_CENTROID branches are pinned at the postcode centroid (not the actual branch); ADDRESS_GEOCODED branches are geocoded from a street address without manual confirmation; NEEDS_REVIEW branches have unresolved data quality concerns. Pinning any of these would silently relax PR #81's redaction contract and present approximate coordinates as exact. Other surfaces (Search, Category list, Merchant Profile branch list) use `hasExactPosition()` redaction to admit ADDRESS_GEOCODED + MANUALLY_CONFIRMED into the rankable half while keeping coordinates null for the approximate side — that asymmetry IS the list-vs-map asymmetry locked at Spec §4.1.1. Map's job is to be strict.

### 6.2 PR-3 preserves the contract — no backend change

PR-3 verifies (does not change):
- `getInAreaBranches` stays MANUALLY_CONFIRMED-only.
- `totalBranches`, `branchMeta.rungCounts`, `branchMeta.effectiveLocality` all stay computed against the MANUALLY_CONFIRMED-only set.
- If verification surfaces a regression (e.g. seed data adds non-MC branches that somehow reach the in-area response), escalate as a backend fix BEFORE the customer-app flip — not as an inline PR-3 backend change.

### 6.3 Defensive client-side filter in `MapPins.tsx`

Even though the backend predicate guarantees `branchLatitude !== null` for every row that arrives, `MapPins.tsx` filters defensively:

```ts
branches
  .filter(b => b.branchLatitude != null && b.branchLongitude != null)
  .map(...)
```

**Rationale:** the client filter is belt-and-braces against (a) a future backend change that loosens the predicate without updating the client, (b) a fixture mistake in a test that injects null coords, (c) malformed wire data from a serialization bug. The filter is single-line, branch-key-stable, and zero-cost when all branches are MANUALLY_CONFIRMED (the contract). Test pin in `MapPins.test.tsx` covers the negative case.

### 6.4 ADDRESS_GEOCODED policy — deferred under §CK.12

ADDRESS_GEOCODED branches stay excluded from Map in PR-3 (matches the shipped backend contract). Whether to RELAX that gate to admit ADDRESS_GEOCODED on Map (and, if so, whether to visually distinguish them with lower opacity / "approximate location" tooltip / different pin shape) is a future product decision tracked at **§CK.12** in `project_deferred_followups_index.md`. It needs a confidence-threshold product call and a UX choice. NOT in PR-3.

Same applies to POSTCODE_CENTROID / NEEDS_REVIEW — surfacing those as a non-rankable list-view tail on Map (mirroring the Search-side asymmetry) is the same §CK.12 decision.

---

## 7. Map carousel / list view → Merchant Profile with `?branch=`

### 7.1 The URL contract (Spec §6.1 + §6.3)

```
/(app)/merchant/<merchantId>?branch=<branchId>
```

Already supported end-to-end:
- `useBranchSelection(branchIdParam)` reads branch from URL synchronously.
- `MerchantProfileScreen` cold-opens to the URL-supplied branch.
- `useMerchantProfile(merchantId, { branchId })` keys cache by branch.
- Voucher Detail propagates `?branch=` from the merchant context.

PR-3 wires Map's tap handlers to this contract.

### 7.2 Tap handlers — current state

`MapScreen.tsx:342`:
```ts
router.push(`/merchant/${id}` as any)
```
Today receives `id` from carousel/list as `merchant.id`. Result URL: `/merchant/mer_covelum` — no `?branch=`. `MerchantProfileScreen` falls back to `selectedBranch` resolution (nearest-by-GPS or first-active-branch).

### 7.3 Tap handlers — PR-3 state

`MapScreen.tsx` `handleMerchantNavigate` receives the branch tile, routes with `?branch=`:

```ts
const handleBranchNavigate = useCallback(
  (branch: BranchTile) => {
    const url = `/(app)/merchant/${branch.merchant.id}?branch=${branch.id}` as const
    if (onMerchantPress) {
      onMerchantPress(branch.merchant.id, branch.id)  // signature extended; existing host-screen callers updated
    } else {
      router.push(url as any)
    }
  },
  [onMerchantPress, router],
)
```

`MapBranchTile` (renamed carousel component) onTap → passes the `branch` object up.

`MapListView` row tap → passes the `branch` object up.

`MapPins` tap → passes the `branch` object up (it already has the full branch tile in scope).

### 7.4 URL params from Map → Merchant Profile

PR #112 added `from=search&q=<query>` to the Search → Merchant URL for back-nav preservation. Map's equivalent question: do we pass `from=map` so back-nav returns to Map?

**Answer**: Yes — add `from=map` so the back button on Merchant Profile routes to `/(app)/map` (same pattern as `from=search`).

```ts
const url = `/(app)/merchant/${branch.merchant.id}?branch=${branch.id}&from=map` as const
```

`MerchantProfileScreen.tsx` already has an `onBack` handler accepting URL params; extend the `from === 'search'` branch to also handle `from === 'map'`:

```ts
onBack={
  screenParams.from === 'search'
    ? () => router.push(`/(app)/search?q=${encodeURIComponent(screenParams.q ?? '')}` as any)
    : screenParams.from === 'map'
      ? () => router.push('/(app)/map' as any)
      : undefined  // default router.back()
}
```

Map's own state (last viewport, last selected pin) lives in the Map screen's own React state and is preserved across the tab navigation in expo-router Tabs by default. We don't need to round-trip viewport via URL params for the back-nav case (and we shouldn't — viewport URL params would create cache-busting issues with the in-area query).

---

## 8. Test plan

### 8.1 New pins (locked regression contract)

1. **One pin per branch** — two branches of the same merchant render as two distinct `<Marker>` elements. Pin via fixture (Covelum-class).

2. **Defensive client-side null-coord filter in `MapPins`** — even though `getInAreaBranches` is MANUALLY_CONFIRMED-only at the backend predicate, the client must defensively filter null-coord rows. Fixture: a branch with `branchLatitude: null`, `branchLongitude: null`, `branchLocationConfidence: 'POSTCODE_CENTROID'` reaches `<MapPins>` directly via the test harness (bypassing the hook) and renders ZERO markers. Pins the client-side contract against future backend regressions or test-fixture mistakes.

3. **Multi-branch carousel cardinality** — `MapBranchTile` carousel mounted with 2 branches of the same merchant renders 2 distinct cards (no merchant-level deduplication).

4. **Tap → URL `?branch=` propagation** — fixture branch tap → `router.push` called with `/(app)/merchant/${merchantId}?branch=${branchId}&from=map`.

5. **In-area hook shape flip** — `useInAreaBranches` returns `data.branches`, NOT `data.merchants`. Mock response: `{ branches: [fixture], totalBranches: 1, branchMeta: {...} }`.

6. **List view branch cardinality** — `MapListView` with 2 same-merchant branches shows 2 distinct rows.

7. **List view does NOT show POSTCODE_CENTROID / ADDRESS_GEOCODED branches** — fixture: a `BranchTile[]` that includes only MANUALLY_CONFIRMED branches (because the hook receives only MC rows from `getInAreaBranches`). Pin confirms `<MapListView>` does NOT inject any non-MC rows itself. (PR-3 does NOT add list-view tiles for approximate-coord branches — that's a future §CK.12 product decision.)

8. **Fold 1 — pin colour from backend** — fixture with `branch.merchant.primaryCategory.pinColour: '#5C6BC0'` (a non-Big-Four indigo colour) renders the marker with that colour. Second fixture with `pinColour: null` falls through to the hardcoded palette for backward-compat. **File:** `MapPins.test.tsx`.

9. **Fold 2 — list thumbnail colour from backend** — fixture with `branch.merchant.primaryCategory.pinColour: '#5C6BC0'` renders the row thumbnail with that colour. Second fixture with `pinColour: null` falls through to the hardcoded palette. **File:** `MapListView.test.tsx`.

10. **Fold 3 — user-location dot suppression in remote browsing** — two-phase pin in `MapScreen.test.tsx`:
   - Phase A: `remoteCityName === null` → `<MapView>` receives `showsUserLocation={true}`
   - Phase B: simulate `<LocationSearch>` city tap (or set state directly via the fixture's hook) so `remoteCityName === 'Manchester'` → `<MapView>` receives `showsUserLocation={false}`
   - Phase C: dismiss via `<LocationBadge>` X → `remoteCityName` returns to `null` → `<MapView>` receives `showsUserLocation={true}` again
   **File:** `MapScreen.test.tsx`.

### 8.2 Existing pins to preserve (rename + adapt)

- `MapPins.test.tsx` — §BC/§BF/§BI marker-tracking + stable-dimensions tests carry over with the prop shape changed.
- `MapScreen.test.tsx` — loader, empty-state classification, offshore detection — all read merchants/branches count, just adapt to `branches.length`.
- `MapScreen.locality.test.tsx` — `branchMeta.effectiveLocality` already returned by Phase 1 backend; adapt to read it from `branchMeta` not `meta`.
- `MapScreen.submit.test.tsx` — search submit handler; adapt to fixture branches.
- `MapScreen.loader.test.tsx` — `RedeemoLoader` while `isFetching`; no shape coupling.
- `MapListView.test.tsx` — adapt to branch row contract.
- `useInAreaMerchants.test.tsx` (renamed) — adapt to branches fixture.
- `MapMerchantTile.test.tsx` (renamed) — adapt to BranchTile prop shape.
- `MapEmptyArea.test.tsx` / `CustomPin.test.tsx` / `LocationSearch.test.tsx` — minimal or no changes; verify.

### 8.3 Backend regression

No backend changes. Backend full vitest sweep at HEAD should match the PR #112-shipped numbers (999/1000 with 1 known Neon flake).

### 8.4 Customer-app full jest

Customer-app full jest must pass (modulo the known voucher-detail-redeem-flow parallel-load flake, which is documented in memory §BG).

### 8.5 tsc both sides

Customer-app tsc clean. Backend tsc clean (except the 4 pre-existing §BV errors in `savings.service.test.ts`).

---

## 9. Whether Search's new formatter/copy/card patterns apply to Map now

PR #112 shipped a substantial design vocabulary on the Search surface. The relevant question per surface element:

| Pattern from PR #112 | Apply on Map now? | Why |
| --- | --- | --- |
| **Distance formatter (miles-only `0.X miles away`)** | ⚠️ CONDITIONAL — apply on `MapListView` rows only; pins don't display distance | `MapListView.tsx:10-15` currently has its own `formatDistance` returning `${Math.round(metres)}m` for sub-1km and `${miles.toFixed(1)} mi` for 1km+. Owner-locked PR #112 rule is miles-only. **Apply now**: replace `MapListView`'s local helper with the shared `@/design-system/utils/formatters/formatDistance`. Tier-1 sweep. |
| **GBP formatter (`£X.XX` two-decimal)** | ⚠️ CONDITIONAL | `MapListView` mounts `<SavePill amount={merchant.maxEstimatedSaving} />` — see the SavePill component contract; if it formats GBP, route through the shared helper. **Apply now if applicable**. |
| **`Save £X` + `across N vouchers` save badge pattern (§CA)** | ❌ NOT YET on Map — DEFER under §CA | `MapListView` uses `<SavePill>` reading `maxEstimatedSaving`. §CA's "Save £X across N vouchers" pattern requires `merchant.totalEstimatedSaving` on the wire — PR #112 added it to `BranchTile` (already there), but the customer-app shared `<MerchantTile>` component (used by `MapMerchantTile` carousel) reads `MerchantTile.maxEstimatedSaving` not `BranchTile.totalEstimatedSaving`. §CA is the cross-surface propagation work — defer to the dedicated cross-surface PR (or bundle with the next polish PR). PR-3 ships Map showing the same `<SavePill maxEstimatedSaving>` it shows today. |
| **`More places` scope-pill label** | N/A | Map doesn't mount `<ScopePillRow>`. The label rename is automatic via the shared component if any future Map surface mounts it. Spec §BY audit checklist still applies — grep Map-side strings for "UK-wide" (expected to find zero, since Map doesn't surface scope copy). |
| **Persona empty-state copy + `<SearchEmptyState>`** | ❌ NOT NOW — Map has `<MapEmptyArea>` with its own three states (offshore / no_uk_supply / viewport_empty) | Map's empty states are spatially-driven, not query-driven. Mapping PR #112's persona copy to Map empty states is a separate design pass — defer. |
| **Proximity row pill (Closest available match / A short trip / In your area)** | ❌ NOT NOW on Map | Map's primary affordance is spatial (the pin position); a proximity copy line would be redundant. List view rows COULD surface it later — defer. |
| **Heart on card (merchant-level via `useFavourite('merchant', ...)`)** | ⚠️ CONDITIONAL — Map's `MapMerchantTile` carousel passes `onFavourite` to the shared `<MerchantTile>` component which already mounts a heart if `onFavourite` is wired | Currently `MapScreen.tsx` doesn't pass an `onFavourite` handler — heart hidden on Map. **Decision for PR-3**: keep behaviour unchanged (no heart on Map carousel) OR wire `useFavourite('merchant', ...)` consistent with Search. **Recommended**: keep unchanged for PR-3 — Map is spatial discovery, hearts are listing affordances; adding the heart is a new feature, not a migration. If owner wants the heart on Map, surface during plan review and add to scope. |
| **Pre-search prompt / TrendingSearches** | N/A | Map doesn't have a pre-search state. |
| **Search → Merchant → back URL preservation (`from=search&q=`)** | ✅ MIRROR pattern with `from=map` | Per §7.4 above — add `&from=map` to the merchant URL so back-nav returns to Map. |
| **Branch-aware MerchantProfile cache key (`useMerchantProfile(id, { branchId })`)** | ✅ MANDATORY | This is the same backend contract Search consumes — Map MUST pass `branchId` so MerchantProfile cold-opens to the correct branch. |
| **`<SearchResultItem>` 4-line layout (name / branch / meta / proximity)** | ⚠️ MAYBE on `MapListView` rows — see §9 row decision | `MapListView` currently uses a 3-line `MerchantRow` (name / category + distance / pillRow with star + save). Adopting the 4-line Search layout would be a visual rebaseline of Map's list view — separate design decision. **Default for PR-3**: keep current `MerchantRow` layout, just flip the data source. If the visual inconsistency between Search and Map bothers owner during device QA, escalate to a follow-up. |

### Summary table — what PR-3 takes from PR #112 visually:

| Element | PR-3 outcome |
| --- | --- |
| Distance formatter | ✅ Adopt (Tier-1 sweep — replace `MapListView` local helper) |
| GBP formatter | ✅ Adopt if `<SavePill>` formats GBP |
| Save £X badge | ❌ Defer to §CA |
| Scope-pill label | N/A |
| Empty-state persona copy | ❌ Defer |
| Proximity pill | ❌ Defer |
| Heart on card | ⚠️ Keep unchanged (no heart on Map carousel today) |
| Branch-aware URL `?branch=` | ✅ Apply |
| `from=map` back-nav | ✅ Apply |
| 4-line list row | ❌ Defer |

---

## 10. §W production resilience checklist consultation

Per the standing rule §W — "consult at every plan/spec time":

| Concern | PR-3 exposure |
| --- | --- |
| Rate limits | No new endpoint; no change. |
| Retry / backoff | `useInAreaBranches` uses React Query default retry; no change. |
| Request timeouts | No change. `/discovery/in-area` latency tracked under §BA.1 (separate workstream). |
| Caching | `keepPreviousData` already applied (§AY). Branch-keyed cache (queryKey includes bbox tuple) inherited from current implementation. |
| Background queues | N/A. |
| Batch jobs | N/A. |
| Pagination | Map fetches by bbox, not by page. Cap behaviour unchanged from current implementation. If dev DB grows past the cap, list-view drops branches — known limitation, tracked under §BA. |
| DB index review | No new queries; no new index pressure. |
| Load testing pre-launch | Pre-launch hardening track (PAUSED) covers this. |
| Third-party failure handling | react-native-maps is the only third-party in scope; failure modes unchanged. |
| Observability | No new endpoints; no new metrics. |
| No expensive sync work in user-facing requests | The in-area backend handler hasn't changed; same cost as today. |

**PR-3 exposure to §W: bounded.** Map already has a known perf concern under §BA.1, but that's tracked separately and isn't blocked by this PR. PR-3 doesn't worsen the picture.

---

## 11. Device-QA checklist

Owner runs on the dev client over Huddersfield + Essex viewports.

| # | Test | Expected |
| --- | --- | --- |
| 1 | Pan to a viewport that includes both Brightlingsea AND Colchester | TWO distinct Covelum pins visible |
| 2 | Tap the Brightlingsea pin | Carousel slides up showing Covelum Brightlingsea card |
| 3 | Swipe carousel right | Cycles to next branch tile (could be Covelum Colchester if both visible) |
| 4 | Tap any carousel card | Opens Merchant Profile pre-selected to that branch (verify the branch chip / hours / address match) |
| 5 | Back from Merchant Profile | Returns to Map (not Discovery) thanks to `from=map` |
| 6 | Open the list view (bottom-sheet) | Both Covelum branches appear as 2 rows; distance formatted in miles only |
| 7 | Tap a list-view row | Opens Merchant Profile with `?branch=` |
| 8 | Verify a POSTCODE_CENTROID / ADDRESS_GEOCODED branch in the viewport | Does NOT appear on Map (neither pin nor list-view row). `getInAreaBranches` is MANUALLY_CONFIRMED-only by design. To see approximate-coord branches, use Search or the Merchant Profile branch list. |
| 9 | Pan / zoom rapidly | Pins update; `keepPreviousData` prevents blank-map flash (§AY preserved) |
| 10 | Cold-mount Map | Pins render within reasonable time; §BC/§BF/§BI tracking-then-freeze preserved (no stuck-invisible markers across multiple taps) |
| 11 | Offline / offshore detection | If viewport sits off UK coast, `<MapEmptyArea reason="offshore">` shows |
| 12 | No-supply viewport | If viewport has zero matching branches, `<MapEmptyArea>` shows the appropriate state |
| 13 | **Fold 1** — viewport with a non-Big-Four category branch (e.g. Health / Auto / Pets seeded) | Pin colour matches the seeded `category.pinColour`, NOT brandRose |
| 14 | **Fold 2** — open list view with the same non-Big-Four branch in viewport | Row thumbnail colour matches pin colour for the same branch (Fold 1 and Fold 2 visually align) |
| 15 | **Fold 3** — tap a city in `<LocationSearch>` (e.g. "Manchester" from Huddersfield) | Map camera moves to Manchester AND the blue user-location dot disappears |
| 16 | **Fold 3 dismiss** — tap the X on `<LocationBadge>` or "Use current location" | Blue user-location dot returns at the user's real GPS location |

### Anti-regression checks

- No marker disappearance on selection toggle
- No multi-tap → marker stuck invisible
- No pin OR list-view row for non-MANUALLY_CONFIRMED branches on Map (backend predicate guarantees + defensive client filter)
- No merchant collapse: Brightlingsea + Colchester both visible
- No Big-Four category colour regression (Food orange / Beauty pink / Fitness green / Shopping purple still render their original colours when `pinColour` matches OR when `pinColour` is null and the palette fallback fires)
- No user-location dot regression in normal (non-remote) mode

---

## 12. PR-3 file structure

### Created
- `apps/customer-app/src/features/map/hooks/useInAreaBranches.ts` (renamed)
- `apps/customer-app/src/features/map/components/MapBranchTile.tsx` (renamed)
- `apps/customer-app/tests/features/map/useInAreaBranches.test.tsx` (renamed)
- `apps/customer-app/tests/features/map/MapBranchTile.test.tsx` (renamed)

### Modified
- `apps/customer-app/src/features/map/screens/MapScreen.tsx` — flip merchants→branches, route with ?branch=&from=map
- `apps/customer-app/src/features/map/components/MapPins.tsx` — props shape, branch.id key, defensive null-coord filter
- `apps/customer-app/src/features/map/components/MapListView.tsx` — props shape, miles-only formatter swap
- `apps/customer-app/src/lib/api/discovery.ts` — typing on inArea response if not already
- `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx` — extend onBack handler to recognise `from === 'map'`
- `apps/customer-app/tests/features/map/MapPins.test.tsx` — 3 new pins + adapted existing
- `apps/customer-app/tests/features/map/MapListView.test.tsx` — adapt
- `apps/customer-app/tests/features/map/MapScreen.test.tsx` — adapt
- `apps/customer-app/tests/features/map/MapScreen.loader.test.tsx` — adapt
- `apps/customer-app/tests/features/map/MapScreen.locality.test.tsx` — adapt
- `apps/customer-app/tests/features/map/MapScreen.submit.test.tsx` — adapt

### Deleted
- `apps/customer-app/src/features/map/hooks/useInAreaMerchants.ts` (renamed away)
- `apps/customer-app/src/features/map/components/MapMerchantTile.tsx` (renamed away)
- `apps/customer-app/tests/features/map/useInAreaMerchants.test.tsx` (renamed away)
- `apps/customer-app/tests/features/map/MapMerchantTile.test.tsx` (renamed away)

### Estimated diff
~6 source files modified + 4 renamed files. ~700-900 lines net (mostly mechanical type/import/prop renames + 7 new test pins (4 branch-first pins + 3 fold pins) + 1 distance-formatter sweep + 3 folds at ≤5 lines each). The folds add ~15 source lines + ~80 test lines + ~10 lines of documentation comments — the bulk of the increase from the previous 600–800 estimate comes from the three new fold test pins, not the production code.

---

## 13. Tier calibration

**Tier 2** — multi-file UI rebaseline within an existing surface migration. Per memory feedback rule:
- ✅ Written plan doc first (this document)
- ✅ Owner decisions surfaced BEFORE implementation
- ✅ Plan-first; no scope creep mid-execution
- ✅ Tests required before PR
- ✅ Docs updated in same PR if behaviour changes (none expected)
- ✅ Plan-amendment process if a contract gap appears mid-execution

---

## 14. Risk register

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| `MapMerchantTile` is referenced from other Map files we haven't audited | Medium | `grep -rn "MapMerchantTile" apps/customer-app/src apps/customer-app/tests` before renaming; update every reference |
| `<MerchantTile>` (the shared component used by `MapMerchantTile`) consumes `MerchantTile` type — needs adapter to accept `BranchTile` shape | Medium-High | Two options: (a) `MapBranchTile` adapts `BranchTile` → legacy `MerchantTile`-shaped props locally; (b) shared `<MerchantTile>` component evolves to accept both shapes (Phase 2.5 work). **Default**: option (a) — local adapter inside `MapBranchTile.tsx`. Option (b) belongs in Phase 2.5 sweep. |
| Single-branch merchants whose nearest-branch was their main branch may end up with a DIFFERENT branch identity on tap (now branch.id, not merchant.id resolution) | Low | Cold-open `?branch=` resolves to URL-supplied branch; if branch.id is valid, the URL contract guarantees the right branch surfaces. Test pin confirms. |
| `MapScreen` has TWO query paths (`useInAreaMerchants` + `useSearch` with bbox) — both need flipping | High (will hit during impl) | Plan explicitly calls out both paths in §1.2. Both flip to `branches`. |
| Selected-pin state (`selectedMerchant`) lives in component state; rename + behaviour preservation | Low | Mechanical rename `selectedMerchant` → `selectedBranch`/`selectedBranchId` |
| Marker tracking (§BC/§BF/§BI) — bumping the `selected` effect deps from `[selected, latitude, longitude]` to `[selected, branchLatitude, branchLongitude]` could subtly break the cold-mount + zoom-transition fix | Medium | Test pin: a MapPins fixture with multiple selection transitions still produces stable markers |
| `MerchantProfileScreen` cache keying on `branchId` may collide with Map's selectedBranch state if Map and Search both push to MerchantProfile with different branches | Low | URL is the single source of truth; `useMerchantProfile(merchantId, { branchId })` keys by branch — no collision |
| `keepPreviousData` (§AY) interaction with the new `branches` arm | Low | Same `useQuery` semantics; placeholder behaviour preserved. Test pin confirms pan/zoom doesn't blank the map |
| **Fold 1** — `branch.merchant.primaryCategory.pinColour` field missing on the wire | Low | Field shipped on `BranchTile` via Phase 1 (PR #110); seeded for every category per `prisma/seed-data/categoryAmenities.ts` and the Plan 1 taxonomy seed. Defensive null-fallback to the existing hardcoded palette keeps Big-Four colours intact if any category somehow lacks `pinColour`. Test pin covers both branches. |
| **Fold 1/2** — backend `pinColour` value doesn't match the design palette (e.g. dev seed has a stale colour) | Low | Cosmetic only. The seed is owner-controlled; any drift surfaces during device QA as a colour mismatch on a single category. Fix by updating the seed, not by reverting the fold. |
| **Fold 3** — `showsUserLocation={false}` interacts badly with the iOS / Android "follow user" gesture | Low | `<MapView>` semantics: setting `showsUserLocation` to false simply removes the blue-dot annotation. It does NOT cancel the user's separate camera-tracking state (which Map doesn't use today — re-centre is a manual button). Test pin in `MapScreen.test.tsx` Phase A/B/C covers the on→off→on toggle. |
| **Fold 3** — race between `remoteCityName` state-setter and the `<MapView>` prop re-evaluation could briefly flash the dot during a city tap | Very Low | `<MapView>` re-renders on prop change; React's render cycle batches the state update with the camera-move animation. If a flash is observed during device QA, gate the camera-move animation behind a `setState` callback. Not expected. |
| Distance formatter swap in `MapListView` regresses display | Low | Pin tests in `MapListView.test.tsx`: 0.X miles for sub-1mi distances; never bare `m` |

---

## 15. Sequencing inside PR-3

Plan-first execution per Tier 2 calibration. **No code starts** until owner approves this plan.

When greenlit:

1. **Phase A — rename + type-flip (mechanical)**
   - Branch + grep all `useInAreaMerchants` / `MapMerchantTile` / `getInAreaMerchants` references
   - Rename files via `git mv` (preserves history)
   - Hook returns the full response (`select: r => r`); downstream reads `data.branches`, `data.totalBranches`, `data.branchMeta.effectiveLocality`, `data.branchMeta.rungCounts` — see §5.2
   - Flip type imports
   - Compile errors guide the rest
   - Commit: `feat(customer-app/map): rename Map hooks + components to branch-first naming`

2. **Phase B — `MapPins` one-pin-per-branch + Fold 1**
   - New tests first: one-pin-per-branch, defensive null-coord client-side filter, multi-branch cardinality, **Fold 1 backend `pinColour` + palette-fallback**
   - Implement: prop shape change, null-coord filter, marker key change
   - **Fold 1**: `getPinColor()` reads `branch.merchant.primaryCategory.pinColour` first, falls through to hardcoded palette when null
   - Verify §BC/§BF/§BI tests still pass + Fold 1 test pin passes
   - Commit: `feat(customer-app/map): MapPins renders one Marker per branch (Covelum bug closure) + reads backend pinColour`

3. **Phase C — `MapBranchTile` + `MapListView` + Fold 2**
   - Update tests + implementation
   - Adapter in `MapBranchTile` for shared `<MerchantTile>` consumer
   - Distance formatter swap in `MapListView`
   - **Fold 2**: `getCategoryColor()` in `MapListView` reads `branch.merchant.primaryCategory.pinColour` first, falls through to hardcoded palette when null
   - Verify Fold 2 test pin passes
   - Commit: `feat(customer-app/map): MapBranchTile carousel + MapListView consume branches + read backend pinColour`

4. **Phase D — `MapScreen` glue + URL contract + Fold 3**
   - Update both query paths (`useInAreaBranches` + filtered `useSearch`)
   - Tap handlers route with `?branch=&from=map`
   - Update `MerchantProfileScreen.onBack` for `from === 'map'`
   - **Fold 3**: `<MapView showsUserLocation={remoteCityName === null}>` — suppress blue dot in remote browsing
   - Verify Fold 3 Phase A/B/C test pin passes
   - Commit: `feat(customer-app/map): MapScreen + MerchantProfile back-nav consume branch-first contract + suppress user-location dot in remote browsing`

5. **Phase E — Self-review + PR**
   - Full customer-app jest
   - tsc clean
   - Open PR with full description per Rev 1.2 plan PR-3 template
   - Owner device-QA gate (12-point checklist in §11)
   - SHA-bound merge

6. **Post-merge — memory updates**
   - `project_current_state.md` — new top section "Phase 2.2 Map SHIPPED…"
   - `project_discovery_sequencing_plan4.md` — note M4.7 (Map viewport-led EffectiveLocation) NOW UNBLOCKED on the branches contract
   - `project_deferred_followups_index.md` — §M Phase 2.2 ✅ shipped; Phase 2.3 Home next; §CK created at the time of plan lock (already in the index — re-confirm); §BA / §BA.1 cross-refs to §CK already in place
   - `project_discovery_rebaseline_phase2_2_complete.md` (NEW) — as-shipped baseline file
   - `MEMORY.md` — pointer to the new file

---

## 16. Plan-amendment protocol

If during execution a contract gap surfaces (e.g. backend `getInAreaBranches` is missing a field the client needs):

1. PAUSE implementation.
2. Document the gap in this plan doc as a Revision-N amendment.
3. Decide: backend additive (separate task), or workaround locally (with deferred entry).
4. Get owner direction.
5. Resume.

No silent contract changes mid-execution.

---

## 17. Owner approval gate

Before any code change:

- [ ] Owner reads this plan in full
- [ ] Owner confirms scope (§1) and out-of-scope items (§2)
- [x] **Three safe folds locked 2026-05-20** (Fold 1 pin colour from backend in `MapPins`; Fold 2 pin colour from backend in `MapListView`; Fold 3 user-location dot suppression in remote browsing). Sourced from the Map rebase/transplant audit recommendation. Documented under §1.2, §1.4, §1.5, §4 deltas 5–7, §8 test pins 8–10, §11 QA checklist rows 13–16, §14 risk rows, §15 Phase B/C/D.
- [x] **§CK Map design polish bucket created 2026-05-20** in `project_deferred_followups_index.md` with 14 enumerated items + cross-refs (§BA / §BA.1 / §BA.2 / §BA.3 / 2026-04-17 design spec / brainstorm `29364-1776892625`). Confirmed by audit.
- [ ] Owner confirms the §9 decisions on which PR #112 patterns transfer to Map (distance formatter ✅, save badge ❌ deferred §CA, heart ⚠️ keep-unchanged, 4-line list row ❌ deferred, etc.)
- [ ] Owner confirms `from=map` back-nav URL contract (§7.4)
- [ ] Owner confirms PR-3 preserves the MANUALLY_CONFIRMED-only Map pin + list contract (§6.1) — POSTCODE_CENTROID / NEEDS_REVIEW / ADDRESS_GEOCODED branches stay excluded from `getInAreaBranches`. Any future relaxation (e.g. admit ADDRESS_GEOCODED with a confidence-threshold + visual distinction) is tracked at §CK.12 and is NOT in PR-3 scope.
- [ ] Owner picks `discoveryApi` client-method naming: **Option A** (recommended) — rename `getInAreaMerchants()` → `getInAreaBranches()` for consistency with hook rename; OR **Option B** — keep method name (endpoint URL unchanged). See §1.2 row for `apps/customer-app/src/lib/api/discovery.ts`.
- [ ] Owner approves Phase A–E execution order (§15)

**Awaiting owner approval. No code starts until owner explicitly greenlights.**

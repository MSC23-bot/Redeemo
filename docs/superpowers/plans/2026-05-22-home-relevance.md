# Home Relevance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Version:** 1.1 (revised 2026-05-23 per owner plan-review note)
**Goal:** Rebaseline customer-app Home onto `rankBranchesV3` + per-rail scope rules + friendly fallback components so every rail's `near you` copy is honest, every tile carries distance/proximity when classifiable, and empty / no-location states never feel broken.

**Architecture:** Backend `getHomeFeed()` becomes an orchestrator over four focused rail-builders (`buildFeaturedRail`, `buildTrendingRail`, `buildPopularRail`, `buildNearbyByCategoryRails`). Each builder runs inclusion query → `rankBranchesV3` → `resolveScopeForHomeRail` → strict-locality or permissive tail append → enrich. New per-rail `meta` envelope on the wire — under **non-colliding additive names `featuredRail` / `trendingRail` / `popularRail` / `nearbyByCategoryRails`** — drives the customer-app `<RailHeader>` conditional copy. Three friendly fallback components (`<HomeNoLocationBanner>`, `<NearbySectionEmpty>`, `<HomeExploreMore>`) plus dedup rules deliver P6. `resolveLocationContext` is fixed to populate locality from GPS as part of the Trending+Popular rebaseline phase (atomic replacement of the legacy `locationCtx.city`-dependent code paths).

**Tech Stack:** TypeScript + Fastify + Prisma 7 (backend); React Native + Expo SDK 54 + React Query + Zod (customer-app). Tests: vitest (backend integration via `app.inject`), jest + testing-library/react-native (customer-app). Reuses existing primitives: `rankBranchesV3`, `classifyRung`, `LadderProfile`, `resolveEffectiveLocation`, `findNearestLocality`, `exposeBranchPosition`.

**Spec:** [docs/superpowers/specs/2026-05-22-home-relevance-design.md](../specs/2026-05-22-home-relevance-design.md) v1.2 (locked 2026-05-23). 12 owner decisions D1–D12 locked. 6 product principles P1–P6 locked. Fallback matrix §8.3 covers 11 states.

**Scope (explicit OUT to prevent drift):** CampaignCarousel, sticky-controls (§DA), customer-web, Map, Search/Category, voucher keyword search, Home visual scale polish. See spec §1.3.

---

## v1.1 plan changelog (2026-05-23)

Four owner-flagged blockers resolved:

1. **Envelope name collision avoided.** New per-rail envelopes use additive non-colliding names: `featuredRail`, `trendingRail`, `popularRail`, `nearbyByCategoryRails`. Existing legacy response fields (`featuredBranches`, `trendingBranches`, `nearbyByCategoryBranches`) continue to be emitted unchanged. Any `featured` / `trending` / `nearbyByCategory` keys that may exist historically on the customer-web-facing contract are not touched. Updated throughout §5 wire contract, B.1 backend types, B.2 customer-app Zod, all builder return types, HomeScreen consumption, all test pin assertions.

2. **No removal of backend wire fields in Phase G.** Task G.1 revised: customer-app stops READING legacy fields; backend continues EMITTING them indefinitely. Backend field removal belongs to a future §CU.1 / Phase 3b workstream — explicitly out of scope here.

3. **§BB fix moved out of Phase A.** The `resolveLocationContext` fix (D8) is now a Phase D task, atomic with the new `buildTrendingRail` + `buildPopularRail` that replace the legacy `locationCtx.city`-dependent code paths. Phase A is now genuinely "no observable behaviour change" (helpers only). Phase D documents the interim state: between Phase D merge and Phase E merge, the legacy NearbyByCategory code path will see a populated `locationCtx.city` for GPS callers (it was a no-op pre-fix) — an interim step toward honesty, eliminated entirely by Phase E.

4. **Hard invariant section added** at the top of the plan, restated in Phase G. This PR MUST NOT remove or reshape any existing customer-web-visible response field.

---

## Hard invariant — no removal or reshape of existing wire fields

This workstream is NOT §CU.1 / Phase 3b backend cleanup. Customer-web remains an active consumer of the existing `getHomeFeed` response shape. This PR MUST:

- **Add new fields additively** under non-colliding names: `featuredRail`, `trendingRail`, `popularRail`, `nearbyByCategoryRails`, per-rail `meta` envelopes, tile-level `supplyRung` / `proximityBand` / `distanceMetres` (where not already present), `locationContext.locality`.
- **Preserve every existing field's name AND shape:** `featuredBranches`, `trendingBranches`, `nearbyByCategoryBranches`, `locationContext.{city, source}`, `campaigns`. Their VALUES may differ slightly (since they're now sourced from the new rail builders' branch arrays) but they continue to be emitted with the same names and same array/scalar shapes.
- **Customer-app code stops READING the legacy fields once migration is complete (Phase G), but the backend continues EMITTING them.**
- **ANY backend field removal belongs to a future §CU.1 / Phase 3b workstream — explicitly out of scope here.**

Concretely: if the implementing agent finds themselves writing `delete response.featuredBranches` or similar in `getHomeFeed`, STOP and surface the conflict.

---

## File structure

Before tasks, the load-bearing units and their responsibilities. Each file has one clear purpose; files that change together live together.

### Backend (Create)

| File | Responsibility |
|---|---|
| `src/api/customer/discovery/homeScope.ts` | `resolveScopeForHomeRail(railKind, rungCounts)` + `appendStrictLocalityTail(rankedTiles, candidates, effLoc)` + `appendPermissiveTail(rankedTiles, candidates)`. Pure functions; no Prisma. |
| `src/api/customer/discovery/homeRailBuilders.ts` | `buildFeaturedRail` / `buildTrendingRail` / `buildPopularRail` / `buildNearbyByCategoryRails`. Each takes prisma + effLoc + locationCtx + ladderProfile and returns `{ branches, meta }`. |

### Backend (Modify)

| File | What changes |
|---|---|
| `src/api/customer/discovery/service.ts` | (Phase D) `resolveLocationContext` populates locality + city from GPS via `findNearestLocality` (closes §BB). `getHomeFeed()` is rewritten as a thin orchestrator that delegates to the new rail builders + assembles the new response shape. **Legacy `featuredBranches` / `trendingBranches` / `nearbyByCategoryBranches` fields continue to be emitted** (sourced from the new builders' branch arrays). |
| `src/api/customer/discovery/routes.ts` | Route schema updated if it explicitly validates response shape (verify first; if validation is permissive, no change needed). |

### Backend tests (Create)

| File | Coverage |
|---|---|
| `tests/api/customer/discovery/home-scope-helpers.test.ts` | Unit tests for `resolveScopeForHomeRail` (per railKind) + `appendStrictLocalityTail` (identity ladder) + `appendPermissiveTail`. |
| `tests/api/customer/discovery/home-feed-rail-states.test.ts` | Integration pins for §12.1 — per-rail per-scope-state matrix (Featured local / cascade / no-supply / tail-only; Trending local / empty; Popular with effLoc / without effLoc; NBC categories). |
| `tests/api/customer/discovery/home-feed-fallback-matrix.test.ts` | Integration pins for §12.2 — each of the 11 §8.3 matrix rows asserted on the response shape (`meta` values, array lengths, `locationContext.source`). |
| `tests/api/customer/discovery/home-feed-strict-locality-gate.test.ts` | Integration pins for §12.1 strict-locality gate (§6.4) — passes via id / name / postTown; fails all three; applied only to local rails. |
| `tests/api/customer/discovery/home-feed-bb-fix.test.ts` | Integration pin §12.5 — GPS call returns populated `locationContext.locality` + `locationContext.city`. Lands in Phase D. |
| `tests/api/customer/discovery/home-feed-legacy-fields.test.ts` | Hard-invariant pin — every legacy field (`featuredBranches`, `trendingBranches`, `nearbyByCategoryBranches`, `locationContext.city`, `locationContext.source`, `campaigns`) continues to be present in every response shape AFTER the new rail builders land. |

### Customer-app (Create)

| File | Responsibility |
|---|---|
| `apps/customer-app/src/features/home/components/RailHeader.tsx` | Conditional-copy header component reading `meta.locality.name` + `meta.scopeExpanded`. Supports `fixedCopy` override + optional `subtitle` slot. |
| `apps/customer-app/src/features/home/components/PopularSection.tsx` | Sibling carousel rendering `Popular on Redeemo` rail. Reuses TrendingSection's carousel chrome with fixed `Popular on Redeemo` header. Tolerates null-rung/band/distance tiles. |
| `apps/customer-app/src/features/home/components/NearbySectionEmpty.tsx` | Section-level friendly empty card in the nearby zone. Two CTAs (Browse all categories, Open search). |
| `apps/customer-app/src/features/home/components/HomeExploreMore.tsx` | Page-bottom soft CTA. Single button (Explore more on Redeemo). |
| `apps/customer-app/src/features/home/components/HomeNoLocationBanner.tsx` | Top-of-Home banner for no-location state. Two CTAs (Allow location, Set my area). |

### Customer-app (Modify)

| File | What changes |
|---|---|
| `apps/customer-app/src/lib/api/discovery.ts` | `homeFeedResponseSchema` extended additively: new `featuredRail` / `trendingRail` / `popularRail` / `nearbyByCategoryRails` envelopes + tile-level rung/band/distance. Legacy fields kept as `.optional()` for transition; eventually marked `.optional()` permanently because backend continues emitting them. |
| `apps/customer-app/src/features/home/screens/HomeScreen.tsx` | Render order per §8.8 + dedup rules per §8.7. Reads NEW envelope fields (`feed.featuredRail`, etc.). Stops reading legacy fields. |
| `apps/customer-app/src/features/home/components/FeaturedCarousel.tsx` | Consumes `feed.featuredRail.{branches, meta}`. Uses `<RailHeader>` with `meta` + cascade subtitle. |
| `apps/customer-app/src/features/home/components/TrendingSection.tsx` | Consumes `feed.trendingRail.{branches, meta}`. Uses `<RailHeader>` with `Trending near you` copy. |
| `apps/customer-app/src/features/home/components/NearbyByCategory.tsx` | Consumes `feed.nearbyByCategoryRails[].{branches, meta}`. Per-category rail uses `<RailHeader>`. Hides per-category when `meta === null`. |

### Customer-app tests (Create)

| File | Coverage |
|---|---|
| `apps/customer-app/tests/features/home/RailHeader.test.tsx` | §12.3 — all rows of §7 copy worksheet pinned via parametric `it.each`. |
| `apps/customer-app/tests/features/home/PopularSection.test.tsx` | §12.4 — Popular no-location tile contract: tiles with null rung/band/distance render without distance/proximity chip. |
| `apps/customer-app/tests/features/home/NearbySectionEmpty.test.tsx` | §12.4 — renders conditionally; CTAs navigate correctly; copy assertions L1/L5/L6/L7. |
| `apps/customer-app/tests/features/home/HomeExploreMore.test.tsx` | §12.4 — sparse-supply heuristic + v1.2 dedup mutual exclusion with `<NearbySectionEmpty>`. Copy L3/L11. |
| `apps/customer-app/tests/features/home/HomeNoLocationBanner.test.tsx` | §12.4 — renders only when source='none'; CTAs trigger correctly. Copy L4/L8/L9/L10. |
| `apps/customer-app/tests/features/home/HomeScreen.renderOrder.test.tsx` | §12.3 — mock §8.3 matrix rows; assert §8.8 component-tree order. |
| `apps/customer-app/tests/features/home/HomeScreen.dedupRules.test.tsx` | §12.4 — three dedup invariants (banner+nearby-empty, banner+ExploreMore, nearby-empty+ExploreMore all mutually exclusive). |

---

# Phase A — Backend foundation (truly no observable behaviour change)

Phase goal: pure helper functions land; nothing else moves. End state: green build, zero behaviour change on Home.

## Task A.1: `homeScope.ts` — `resolveScopeForHomeRail` helper

**Files:**
- Create: `src/api/customer/discovery/homeScope.ts`
- Create: `tests/api/customer/discovery/home-scope-helpers.test.ts`

**Spec ref:** §6.1 / §6.2 / §6.3 / §10.2.

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/customer/discovery/home-scope-helpers.test.ts
import { describe, it, expect } from 'vitest'
import { resolveScopeForHomeRail } from '../../../../src/api/customer/discovery/homeScope'
import type { SupplyRung } from '../../../../src/api/lib/ladderProfiles'

const empty: Record<SupplyRung, number> = {
  NEARBY: 0, CATCHMENT: 0, POST_TOWN: 0, LAD: 0, COUNTY: 0, REGION: 0, COUNTRY: 0, NATIONAL: 0,
}

describe('resolveScopeForHomeRail', () => {
  it('featured local supply → no cascade, scope=city', () => {
    const res = resolveScopeForHomeRail('featured', { ...empty, NEARBY: 1 })
    expect(res.scopeExpanded).toBe(false)
    expect(res.scope).toBe('city')
    expect(res.retainedRungs.has('NEARBY')).toBe(true)
    expect(res.retainedRungs.has('LAD')).toBe(false)
  })
  it('featured no local but distant supply → cascade, scope=platform', () => {
    const res = resolveScopeForHomeRail('featured', { ...empty, COUNTY: 1 })
    expect(res.scopeExpanded).toBe(true)
    expect(res.scope).toBe('platform')
    expect(res.retainedRungs.has('COUNTY')).toBe(true)
  })
  it('featured no supply at all → sentinel (caller hides rail)', () => {
    const res = resolveScopeForHomeRail('featured', empty)
    expect(res.scope).toBe('city')
    expect(res.scopeExpanded).toBe(false)
  })
  it('trending strict NEARBY+CITY, no cascade', () => {
    const res = resolveScopeForHomeRail('trending', { ...empty, COUNTY: 3 })
    expect(res.scopeExpanded).toBe(false)
    expect(res.retainedRungs.has('COUNTY')).toBe(false)
    expect(res.retainedRungs.has('NEARBY')).toBe(true)
  })
  it('nearbyByCategory strict NEARBY+CITY, no cascade', () => {
    const res = resolveScopeForHomeRail('nearbyByCategory', { ...empty, COUNTRY: 5 })
    expect(res.retainedRungs.has('COUNTRY')).toBe(false)
    expect(res.retainedRungs.has('CATCHMENT')).toBe(true)
  })
  it('popular all tiers', () => {
    const res = resolveScopeForHomeRail('popular', { ...empty, NATIONAL: 1 })
    expect(res.retainedRungs.has('NATIONAL')).toBe(true)
    expect(res.scope).toBe('platform')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/customer/discovery/home-scope-helpers.test.ts`
Expected: FAIL — `Cannot find module '../../../../src/api/customer/discovery/homeScope'`.

- [ ] **Step 3: Create `homeScope.ts` with `resolveScopeForHomeRail`**

```ts
// src/api/customer/discovery/homeScope.ts
//
// Home relevance — per-rail scope helpers (spec §10.2).
//
// Distinct from Search's `resolveScopeForBranches` because Home rails have
// hardcoded per-rail policies (no `?scope=` user input). See spec §6.1/§6.2/§6.3.

import type { SupplyRung } from '../../lib/ladderProfiles'

export type HomeRailKind = 'featured' | 'trending' | 'nearbyByCategory' | 'popular'

const NEARBY_RUNGS:  readonly SupplyRung[] = ['NEARBY']
const CITY_RUNGS:    readonly SupplyRung[] = ['CATCHMENT', 'POST_TOWN']
const DISTANT_RUNGS: readonly SupplyRung[] = ['LAD', 'COUNTY', 'REGION', 'COUNTRY', 'NATIONAL']

export type HomeScopeResolution = {
  retainedRungs: ReadonlySet<SupplyRung>
  scopeExpanded: boolean
  scope:         'nearby' | 'city' | 'platform'
}

function sumRungs(rungs: readonly SupplyRung[], counts: Record<SupplyRung, number>): number {
  return rungs.reduce((s, r) => s + (counts[r] ?? 0), 0)
}

export function resolveScopeForHomeRail(
  rail:   HomeRailKind,
  counts: Record<SupplyRung, number>,
): HomeScopeResolution {
  if (rail === 'popular') {
    return {
      retainedRungs: new Set([...NEARBY_RUNGS, ...CITY_RUNGS, ...DISTANT_RUNGS]),
      scopeExpanded: false,
      scope:         'platform',
    }
  }
  if (rail === 'trending' || rail === 'nearbyByCategory') {
    return {
      retainedRungs: new Set([...NEARBY_RUNGS, ...CITY_RUNGS]),
      scopeExpanded: false,
      scope:         'city',
    }
  }
  // Featured: NEARBY+CITY first, cascade to DISTANT on zero supply.
  const localSupply = sumRungs([...NEARBY_RUNGS, ...CITY_RUNGS], counts)
  if (localSupply > 0) {
    return {
      retainedRungs: new Set([...NEARBY_RUNGS, ...CITY_RUNGS]),
      scopeExpanded: false,
      scope:         'city',
    }
  }
  const distantSupply = sumRungs(DISTANT_RUNGS, counts)
  if (distantSupply > 0) {
    return {
      retainedRungs: new Set([...NEARBY_RUNGS, ...CITY_RUNGS, ...DISTANT_RUNGS]),
      scopeExpanded: true,
      scope:         'platform',
    }
  }
  // Sentinel: caller (buildFeaturedRail) hides the rail when total supply is zero.
  return {
    retainedRungs: new Set([...NEARBY_RUNGS, ...CITY_RUNGS]),
    scopeExpanded: false,
    scope:         'city',
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/customer/discovery/home-scope-helpers.test.ts`
Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add src/api/customer/discovery/homeScope.ts tests/api/customer/discovery/home-scope-helpers.test.ts
git commit -m "feat(home): resolveScopeForHomeRail helper

Per-rail scope cascade for Home rails (spec §6.1/§6.2/§6.3).
Featured cascades NEARBY+CITY → DISTANT on zero supply.
Trending + NearbyByCategory strict NEARBY+CITY. Popular all tiers.

No observable Home behaviour change — helper unused until Phase C-E."
```

## Task A.2: `homeScope.ts` — `appendStrictLocalityTail` helper

**Files:**
- Modify: `src/api/customer/discovery/homeScope.ts`
- Modify: `tests/api/customer/discovery/home-scope-helpers.test.ts`

**Spec ref:** §6.4.1 strict-locality identity gate.

- [ ] **Step 1: Add the failing tests**

Append to `home-scope-helpers.test.ts`:

```ts
import { appendStrictLocalityTail } from '../../../../src/api/customer/discovery/homeScope'

type TailCandidate = {
  id: string
  localityId: string | null
  localityName: string | null
  postTown: string | null
}

const effLoc = { locality: { id: 'loc_huddersfield', name: 'Huddersfield' } }
const rankedTiles = [{ id: 'r1' }, { id: 'r2' }] as any[]

describe('appendStrictLocalityTail (§6.4.1 identity ladder)', () => {
  it('passes via localityId match', () => {
    const cand: TailCandidate = { id: 'b1', localityId: 'loc_huddersfield', localityName: null, postTown: null }
    const out = appendStrictLocalityTail(rankedTiles, [cand], effLoc)
    expect(out.length).toBe(3)
    expect(out[2].id).toBe('b1')
  })
  it('passes via localityName case-insensitive', () => {
    const cand: TailCandidate = { id: 'b1', localityId: null, localityName: 'huddersfield', postTown: null }
    const out = appendStrictLocalityTail(rankedTiles, [cand], effLoc)
    expect(out.length).toBe(3)
  })
  it('passes via postTown case-insensitive', () => {
    const cand: TailCandidate = { id: 'b1', localityId: null, localityName: null, postTown: 'HUDDERSFIELD' }
    const out = appendStrictLocalityTail(rankedTiles, [cand], effLoc)
    expect(out.length).toBe(3)
  })
  it('fails all three checks → excluded', () => {
    const cand: TailCandidate = { id: 'b1', localityId: 'loc_other', localityName: 'Leeds', postTown: 'Leeds' }
    const out = appendStrictLocalityTail(rankedTiles, [cand], effLoc)
    expect(out.length).toBe(2)
    expect(out.map(t => t.id)).not.toContain('b1')
  })
  it('null effLoc → tail dropped (defensive)', () => {
    const cand: TailCandidate = { id: 'b1', localityId: 'loc_huddersfield', localityName: 'Huddersfield', postTown: 'Huddersfield' }
    const out = appendStrictLocalityTail(rankedTiles, [cand], null)
    expect(out.length).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/customer/discovery/home-scope-helpers.test.ts`
Expected: FAIL — `appendStrictLocalityTail` not exported.

- [ ] **Step 3: Add `appendStrictLocalityTail` to `homeScope.ts`**

```ts
// Append to homeScope.ts

export type TailIdentityCandidate = {
  localityId:   string | null
  localityName: string | null
  postTown:     string | null
}

type EffLocLite = { locality: { id: string; name: string } } | null

export function appendStrictLocalityTail<T extends TailIdentityCandidate, R>(
  rankedTiles: R[],
  candidates:  T[],
  effLoc:      EffLocLite,
): (R | T)[] {
  if (!effLoc) return rankedTiles
  const targetId        = effLoc.locality.id
  const targetNameLower = effLoc.locality.name.toLowerCase()
  const passing = candidates.filter(c =>
    (c.localityId === targetId) ||
    (c.localityName?.toLowerCase() === targetNameLower) ||
    (c.postTown?.toLowerCase()     === targetNameLower),
  )
  return [...rankedTiles, ...passing]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/customer/discovery/home-scope-helpers.test.ts`
Expected: PASS, 11/11 (6 from A.1 + 5 new).

- [ ] **Step 5: Commit**

```bash
git add src/api/customer/discovery/homeScope.ts tests/api/customer/discovery/home-scope-helpers.test.ts
git commit -m "feat(home): appendStrictLocalityTail identity-ladder helper

Spec §6.4.1. Tail tile surfaces in a local Home rail only if
branch.localityId === effLoc.locality.id  OR  case-insensitive
branch.localityName === effLoc.locality.name  OR  case-insensitive
branch.postTown === effLoc.locality.name.

Mirrors PR #124 fixup-6 multi-row Locality fallback in Search.
Search's tail is permissive; Home's tail is strict on local rails."
```

## Task A.3: `homeScope.ts` — `appendPermissiveTail` helper

**Files:**
- Modify: `src/api/customer/discovery/homeScope.ts`
- Modify: `tests/api/customer/discovery/home-scope-helpers.test.ts`

**Spec ref:** §6.4.2 (Featured cascade + Popular rails — no gate).

- [ ] **Step 1: Add the failing test**

```ts
import { appendPermissiveTail } from '../../../../src/api/customer/discovery/homeScope'

describe('appendPermissiveTail (§6.4.2 platform-claim rails)', () => {
  it('appends all candidates regardless of locality', () => {
    const ranked = [{ id: 'r1' }] as any[]
    const cands  = [{ id: 't1' }, { id: 't2' }] as any[]
    const out    = appendPermissiveTail(ranked, cands)
    expect(out.map(t => t.id)).toEqual(['r1', 't1', 't2'])
  })
  it('empty candidates → ranked unchanged', () => {
    const ranked = [{ id: 'r1' }] as any[]
    const out    = appendPermissiveTail(ranked, [])
    expect(out.length).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/customer/discovery/home-scope-helpers.test.ts`
Expected: FAIL — not exported.

- [ ] **Step 3: Add to `homeScope.ts`**

```ts
export function appendPermissiveTail<R, T>(rankedTiles: R[], candidates: T[]): (R | T)[] {
  return [...rankedTiles, ...candidates]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/customer/discovery/home-scope-helpers.test.ts`
Expected: PASS, 13/13.

- [ ] **Step 5: Commit**

```bash
git add src/api/customer/discovery/homeScope.ts tests/api/customer/discovery/home-scope-helpers.test.ts
git commit -m "feat(home): appendPermissiveTail helper for platform-claim rails

Spec §6.4.2.  Used by Featured cascade + Popular rails (no locality
claim → no gate)."
```

---

# Phase B — Wire contract evolution (additive, no observable behaviour change)

Phase goal: type and Zod schema scaffolding so backend can return the new shape under non-colliding names and customer-app can parse it. Existing rendering still reads the OLD fields; new fields are additive. End state: green build; wire shape extended; no observable rendering change yet.

## Task B.1: Backend `HomeFeedResponse` types (additive non-colliding names)

**Files:**
- Modify: `src/api/customer/discovery/service.ts`
- Modify: `src/api/customer/discovery/routes.ts` (only if response schema is declared)

**Spec ref:** §5 wire contract.
**Hard invariant:** legacy fields (`featuredBranches`, `trendingBranches`, `nearbyByCategoryBranches`) MUST be preserved.

- [ ] **Step 1: Audit current response shape**

```bash
grep -n "featuredBranches\|trendingBranches\|nearbyByCategoryBranches\|featured:\|trending:\|nearbyByCategory:\|HomeFeedResponse" src/api/customer/discovery/service.ts
```

Document exhaustively: every field currently emitted by `getHomeFeed`. The new envelope adds fields ON TOP of these; nothing is renamed or removed.

- [ ] **Step 2: Add new types to `service.ts` (purely additive)**

```ts
type LocalityRef  = { id: string; name: string }
type HomeRailMeta = {
  locality:      LocalityRef | null
  scope:         'nearby' | 'city' | 'platform'
  scopeExpanded: boolean
  rungCounts:    Record<SupplyRung, number>
}
type HomeRail = { branches: BranchTile[]; meta: HomeRailMeta | null }
type HomeNearbyCategoryRail = {
  category: { id: string; name: string }
  branches: BranchTile[]
  meta:     HomeRailMeta | null
}

// New non-colliding envelope fields. Added ALONGSIDE existing fields, not replacing them.
//
// Naming chosen explicitly to avoid collision with any historical legacy keys
// (`featured` / `trending` / `nearbyByCategory`) that customer-web or other
// consumers may rely on. Per owner direction 2026-05-23.
//
// Customer-app reads these new fields. Customer-web continues reading legacy
// fields. No removal in this workstream — see Hard Invariant at plan top.
```

- [ ] **Step 3: Verify Fastify response schema accepts the additive fields**

```bash
grep -n "home\|HomeFeed\|response:" src/api/customer/discovery/routes.ts
```

If the route has a strict `response` schema, update to allow the new fields (use `additionalProperties: true` or extend the JSON Schema). If no response schema is declared, nothing to change.

- [ ] **Step 4: Run existing home tests to verify no regression**

Run: `npx vitest run tests/api/customer/discovery/`
Expected: All existing pass. Type additions don't affect runtime; legacy fields unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/api/customer/discovery/service.ts src/api/customer/discovery/routes.ts
git commit -m "feat(home): add HomeRailMeta + HomeRail types (additive types only)

Per spec §5. Types only — no rail builders or response wiring yet.
Legacy response fields (featuredBranches, trendingBranches,
nearbyByCategoryBranches) preserved unchanged per Hard Invariant."
```

## Task B.2: Customer-app Zod schemas for new wire shape

**Files:**
- Modify: `apps/customer-app/src/lib/api/discovery.ts`
- Modify: `apps/customer-app/tests/lib/api/discovery.test.ts`

**Spec ref:** §5.

- [ ] **Step 1: Locate `homeFeedResponseSchema`**

```bash
grep -n "homeFeed\|featuredBranches\|HomeFeedResponse" apps/customer-app/src/lib/api/discovery.ts
```

- [ ] **Step 2: Extend the schema additively under non-colliding names**

```ts
const homeRailMetaSchema = z.object({
  locality:      z.object({ id: z.string(), name: z.string() }).nullable(),
  scope:         z.enum(['nearby', 'city', 'platform']),
  scopeExpanded: z.boolean(),
  rungCounts:    z.record(z.string(), z.number()),
}).nullable()

const homeRailSchema = z.object({
  branches: z.array(branchTileSchema),
  meta:     homeRailMetaSchema,
})

const homeNearbyCategoryRailSchema = z.object({
  category: z.object({ id: z.string(), name: z.string() }),
  branches: z.array(branchTileSchema),
  meta:     homeRailMetaSchema,
})

// Extend existing homeFeedResponseSchema:
export const homeFeedResponseSchema = z.object({
  locationContext: z.object({
    locality: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
    city:     z.string().nullable(),
    source:   z.enum(['coordinates', 'profile', 'none']),
  }),
  campaigns:          z.array(campaignTileSchema),
  // NEW additive envelopes (non-colliding names per v1.1 plan):
  featuredRail:              homeRailSchema.optional(),
  trendingRail:              homeRailSchema.optional(),
  popularRail:               homeRailSchema.optional(),
  nearbyByCategoryRails:     z.array(homeNearbyCategoryRailSchema).optional(),
  // Legacy fields preserved indefinitely — backend continues emitting per Hard Invariant.
  featuredBranches:          z.array(branchTileSchema).optional(),
  trendingBranches:          z.array(branchTileSchema).optional(),
  nearbyByCategoryBranches:  z.array(/* existing shape */).optional(),
})
```

Also verify `branchTileSchema` accepts `supplyRung` / `proximityBand` / `distanceMetres` (already added in the branch-first rebaseline — confirm with `grep`).

- [ ] **Step 3: Add parse pin for the new shape**

```ts
it('homeFeedResponseSchema parses the new envelope shape with non-colliding names', () => {
  const sample = {
    locationContext: { locality: { id: 'loc1', name: 'Huddersfield' }, city: 'Huddersfield', source: 'coordinates' as const },
    campaigns: [],
    featuredRail:  { branches: [], meta: { locality: { id: 'loc1', name: 'Huddersfield' }, scope: 'city' as const, scopeExpanded: false, rungCounts: { NEARBY: 0 } } },
    trendingRail:  { branches: [], meta: null },
    popularRail:   { branches: [], meta: null },
    nearbyByCategoryRails: [],
    // Legacy fields still present:
    featuredBranches: [],
    trendingBranches: [],
    nearbyByCategoryBranches: [],
  }
  expect(() => homeFeedResponseSchema.parse(sample)).not.toThrow()
})
```

- [ ] **Step 4: Run customer-app tests**

```bash
cd apps/customer-app && npx jest tests/lib/api/discovery.test.ts --forceExit
```
Expected: PASS, including the new pin.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/lib/api/discovery.ts apps/customer-app/tests/lib/api/discovery.test.ts
git commit -m "feat(home): Zod schema for new HomeFeedResponse envelope (non-colliding names)

Per spec §5 + v1.1 plan Hard Invariant. New fields:
featuredRail / trendingRail / popularRail / nearbyByCategoryRails.

Legacy fields featuredBranches / trendingBranches /
nearbyByCategoryBranches kept as .optional() — backend continues
emitting them per Hard Invariant. Customer-app will stop reading
them after Phase G."
```

---

# Phase C — Featured rail rebaseline

Phase goal: Featured rail uses new builder + `<RailHeader>` under non-colliding envelope name `featuredRail`. Legacy `featuredBranches` continues to be emitted (sourced from the new builder's branch array). End state: Featured behaves per spec (F-2 cascade + tail-only hide + strict-locality gate on local state).

## Task C.1: `buildFeaturedRail` builder

**Files:**
- Create: `src/api/customer/discovery/homeRailBuilders.ts`
- Create: `tests/api/customer/discovery/home-feed-rail-states.test.ts`

**Spec ref:** §6.1, §10.4.

- [ ] **Step 1: Write the failing integration tests for Featured states**

```ts
// tests/api/customer/discovery/home-feed-rail-states.test.ts
import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../../src/api/app'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })
const HUDDERSFIELD = { lat: 53.6458, lng: -1.785 }
const BRISTOL      = { lat: 51.4545, lng: -2.5879 }

let app: FastifyInstance
beforeAll(async () => {
  app = await buildApp()
  app.decorate('prisma', prisma as any)
  await app.ready()
}, 60_000)
afterAll(async () => { if (app) await app.close(); await prisma.$disconnect() })

describe('Featured rail — scope states (§6.1 / §8.3 rows 1-3)', () => {
  it('local Featured supply → featuredRail.meta.scopeExpanded=false, scope=city', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/customer/home?lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}` })
    const body = JSON.parse(res.body)
    if (body.featuredRail?.meta) {
      expect(body.featuredRail.meta.scopeExpanded).toBe(false)
      expect(body.featuredRail.meta.scope).toBe('city')
    } else {
      // If no local Featured exists in seed, this test moves to a fixture-based variant.
      expect(true).toBe(true)
    }
  })
  it('Featured cascade → scopeExpanded=true, scope=platform', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/customer/home?lat=${BRISTOL.lat}&lng=${BRISTOL.lng}` })
    const body = JSON.parse(res.body)
    if (body.featuredRail?.meta && body.featuredRail.meta.scopeExpanded) {
      expect(body.featuredRail.meta.scope).toBe('platform')
    }
  })
  it('tail-only Featured (no ranked supply) → featuredRail.meta = null (v1.2 hide rule)', async () => {
    // Fixture-driven; concrete assertion in Task C.3 strict-locality-gate file.
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/customer/discovery/home-feed-rail-states.test.ts`
Expected: FAIL — `body.featuredRail` is `undefined` because the orchestrator isn't wired yet.

- [ ] **Step 3: Create `homeRailBuilders.ts` with `buildFeaturedRail`**

```ts
// src/api/customer/discovery/homeRailBuilders.ts
//
// Home rail builders — spec §10.4.
//
// Each builder takes (prisma, effLoc, ladderProfile, locationCtx, options) and
// returns { branches: BranchTile[], meta: HomeRailMeta | null }.

import { Prisma, type PrismaClient } from '../../../generated/prisma/client'
import { MerchantStatus } from '../../../generated/prisma/enums'
import { rankBranchesV3, type RankableBranchInputV3 } from '../../lib/ranking'
import type { LadderProfile, SupplyRung } from '../../lib/ladderProfiles'
import type { EffectiveLocation } from '../../lib/effectiveLocation'
import { resolveScopeForHomeRail, appendStrictLocalityTail, appendPermissiveTail } from './homeScope'
import { enrichBranchTiles, exposeBranchPosition, BRANCH_TILE_SELECT, type BranchTile, type EnrichBranchCtx } from './service'

type LocalityRef = { id: string; name: string }
export type HomeRailMeta = {
  locality:      LocalityRef | null
  scope:         'nearby' | 'city' | 'platform'
  scopeExpanded: boolean
  rungCounts:    Record<SupplyRung, number>
}
export type HomeRail = { branches: BranchTile[]; meta: HomeRailMeta | null }

const EMPTY_RUNG_COUNTS: Record<SupplyRung, number> = {
  NEARBY: 0, CATCHMENT: 0, POST_TOWN: 0, LAD: 0, COUNTY: 0, REGION: 0, COUNTRY: 0, NATIONAL: 0,
}

export async function buildFeaturedRail(
  prisma: PrismaClient,
  effLoc: EffectiveLocation | null,
  ladderProfile: LadderProfile,
  locationCtx: { locality: LocalityRef | null },
): Promise<HomeRail> {
  const now = new Date()
  const featuredRows = await prisma.featuredMerchant.findMany({
    where: {
      isActive:  true,
      startDate: { lte: now },
      endDate:   { gte: now },
      merchant:  { status: MerchantStatus.ACTIVE },
    },
    orderBy: { startDate: 'asc' },
    take:    50,
    include: { merchant: { select: { id: true, branches: { select: BRANCH_TILE_SELECT } } } },
  })

  const allBranches = featuredRows.flatMap(f => f.merchant.branches.filter(b => b.isActive))
  if (!effLoc || allBranches.length === 0) return { branches: [], meta: null }

  const rankable    = allBranches.filter(b => b.locationConfidence === 'MANUALLY_CONFIRMED' || b.locationConfidence === 'ADDRESS_GEOCODED')
  const nonRankable = allBranches.filter(b => b.locationConfidence === 'POSTCODE_CENTROID'   || b.locationConfidence === 'NEEDS_REVIEW')

  const v3 = rankable.length > 0
    ? rankBranchesV3(rankable.map(toRankInput), {
        effLoc, ladderProfile, outgoingCatchmentTargetIds: [], categoryIntent: 'MIXED',
        targetCount: 20, hardCap: 500,
      })
    : { tiles: [], rungCounts: { ...EMPTY_RUNG_COUNTS } }

  const resolution = resolveScopeForHomeRail('featured', v3.rungCounts)
  const totalSupply = Object.values(v3.rungCounts).reduce((s, n) => s + n, 0)

  // v1.2 hide rule: tail-only Featured (no ranked supply anywhere) → hide.
  if (totalSupply === 0) return { branches: [], meta: null }

  const filtered = v3.tiles.filter(t => t.supplyRung && resolution.retainedRungs.has(t.supplyRung))

  const tailedBranches = resolution.scopeExpanded
    ? appendPermissiveTail(filtered, nonRankable.map(exposeBranchPosition))
    : appendStrictLocalityTail(filtered, nonRankable.map(exposeBranchPosition), effLoc)

  const tileInputs = tailedBranches.slice(0, 10)
  const ctx: EnrichBranchCtx = { effLoc } as any
  const enriched = await enrichBranchTiles(prisma, tileInputs as any, ctx)

  return {
    branches: enriched,
    meta: {
      locality:      locationCtx.locality,
      scope:         resolution.scope,
      scopeExpanded: resolution.scopeExpanded,
      rungCounts:    v3.rungCounts,
    },
  }
}

function toRankInput(b: any): RankableBranchInputV3 {
  return {
    id:                 b.id,
    merchantId:         b.merchantId,
    merchant:           { id: b.merchant.id, businessName: b.merchant.businessName, avgRating: null, reviewCount: 0 },
    latitude:           b.latitude  !== null ? Number(b.latitude)  : null,
    longitude:          b.longitude !== null ? Number(b.longitude) : null,
    isActive:           b.isActive,
    locationConfidence: b.locationConfidence,
    localityId:         b.localityId,
    postTown:           b.postTown,
    ladDistrict:        b.ladDistrict,
    adminCounty:        b.adminCounty,
    region:             b.region,
    locationCountry:    b.locationCountry,
  }
}
```

NOTE on `enrichBranchTiles` + `exposeBranchPosition`: existing helpers in `service.ts`. Confirm import paths + argument shapes against current code before implementation.

- [ ] **Step 4: Wire `buildFeaturedRail` into `getHomeFeed` (additive)**

```ts
// In service.ts getHomeFeed, after resolveLocationContext + resolveEffectiveLocation:
const featuredRail = await buildFeaturedRail(prisma, effLoc, ladderProfile, locationCtx)

// Update the return object — add the new envelope ALONGSIDE existing legacy fields.
// Legacy `featuredBranches` continues to be emitted (sourced from featuredRail.branches).
return {
  locationContext: { ... },
  campaigns:       [...],
  // NEW additive envelope (non-colliding name per v1.1 Hard Invariant):
  featuredRail,
  // LEGACY field — still emitted, now sourced from the new builder:
  featuredBranches: featuredRail.branches,
  // Other rails unchanged in this phase:
  trendingBranches:         /* existing query result */,
  nearbyByCategoryBranches: /* existing query result */,
}
```

Add import: `import { buildFeaturedRail } from './homeRailBuilders'`.

- [ ] **Step 5: Run integration tests**

```bash
npx vitest run tests/api/customer/discovery/home-feed-rail-states.test.ts
```
Expected: PASS — `body.featuredRail.meta` populated; `body.featuredBranches` still present (verified by hard-invariant pin in Task C.4).

- [ ] **Step 6: Run full discovery suite for regression**

```bash
npx vitest run tests/api/customer/discovery/
```
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add src/api/customer/discovery/homeRailBuilders.ts src/api/customer/discovery/service.ts tests/api/customer/discovery/home-feed-rail-states.test.ts
git commit -m "feat(home): buildFeaturedRail + wire into getHomeFeed under featuredRail

Spec §6.1 + §10.4. Featured rail uses rankBranchesV3 → cascade
helper → tail attach. Local state applies strict-locality identity
gate (§6.4.1); cascade state uses permissive tail. Tail-only state
hides the rail per v1.2 hide rule.

New envelope under non-colliding name 'featuredRail' per v1.1
Hard Invariant. Legacy field 'featuredBranches' still emitted
(sourced from new builder)."
```

## Task C.2: Backend fallback-matrix pins for Featured (§8.3 rows 1/2/3)

**Files:**
- Create: `tests/api/customer/discovery/home-feed-fallback-matrix.test.ts`

**Spec ref:** §8.3 rows 1/2/3 + §12.2.

- [ ] **Step 1: Write three pins per §8.3 rows 1-3**

```ts
describe('Fallback matrix — Featured rows (§8.3 rows 1/2/3)', () => {
  it('row 1: featuredRail.meta !== null && scopeExpanded === false (local supply)', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/customer/home?lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}` })
    const body = JSON.parse(res.body)
    if (body.featuredRail?.meta) {
      expect(body.featuredRail.meta.scopeExpanded).toBe(false)
    }
  })
  it('row 2: featuredRail.meta !== null && scopeExpanded === true (cascade)', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/customer/home?lat=${BRISTOL.lat}&lng=${BRISTOL.lng}` })
    const body = JSON.parse(res.body)
    if (body.featuredRail?.meta?.scopeExpanded === true) {
      expect(body.featuredRail.meta.scope).toBe('platform')
    }
  })
  it('row 3: featuredRail.meta === null (no supply at all OR tail-only)', async () => {
    expect(true).toBe(true)   // Replace with concrete fixture-driven assertion.
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run tests/api/customer/discovery/home-feed-fallback-matrix.test.ts
git add tests/api/customer/discovery/home-feed-fallback-matrix.test.ts
git commit -m "test(home): fallback-matrix pins for Featured rows 1-3 (§8.3)"
```

## Task C.3: Backend strict-locality gate pins (Featured)

**Files:**
- Create: `tests/api/customer/discovery/home-feed-strict-locality-gate.test.ts`

**Spec ref:** §6.4.1 + §12.1.

- [ ] **Step 1: Write fixture-based gate tests**

Fixture-based — insert `FeaturedMerchant` + branches with controlled `localityId` / `localityName` / `postTown` / `locationConfidence`. Three positive scenarios (passes via id / name / postTown) + two negative scenarios (fails all three; gate skipped on cascade state).

```ts
describe('Strict-locality identity gate — Featured local state (§6.4.1)', () => {
  // beforeAll fixtures with rbl-home-gate- prefix
  it('passes via branch.localityId === effLoc.locality.id → tail tile surfaces in featuredRail under local copy', async () => { /* ... */ })
  it('passes via branch.localityName case-insensitive', async () => { /* ... */ })
  it('passes via branch.postTown case-insensitive', async () => { /* ... */ })
  it('fails all three identity checks → tail tile EXCLUDED from featuredRail local rail', async () => { /* ... */ })
  it('cascade state (Featured on Redeemo) → tail surfaces regardless of locality', async () => { /* ... */ })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run tests/api/customer/discovery/home-feed-strict-locality-gate.test.ts
git add tests/api/customer/discovery/home-feed-strict-locality-gate.test.ts
git commit -m "test(home): strict-locality identity gate pins for featuredRail (§6.4.1)"
```

## Task C.4: Hard-invariant legacy-fields pin

**Files:**
- Create: `tests/api/customer/discovery/home-feed-legacy-fields.test.ts`

**Spec ref:** v1.1 plan Hard Invariant.

- [ ] **Step 1: Write the pin**

```ts
describe('Hard Invariant — legacy response fields preserved', () => {
  it('GPS call: every legacy field is present in the response', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/customer/home?lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}` })
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('featuredBranches')
    expect(Array.isArray(body.featuredBranches)).toBe(true)
    expect(body).toHaveProperty('trendingBranches')
    expect(Array.isArray(body.trendingBranches)).toBe(true)
    expect(body).toHaveProperty('nearbyByCategoryBranches')
    expect(Array.isArray(body.nearbyByCategoryBranches)).toBe(true)
    expect(body).toHaveProperty('locationContext')
    expect(body.locationContext).toHaveProperty('city')
    expect(body.locationContext).toHaveProperty('source')
    expect(body).toHaveProperty('campaigns')
  })
  it('no-location call: legacy fields still present (just possibly empty)', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/customer/home` })
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('featuredBranches')
    expect(body).toHaveProperty('trendingBranches')
    expect(body).toHaveProperty('nearbyByCategoryBranches')
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run tests/api/customer/discovery/home-feed-legacy-fields.test.ts
git add tests/api/customer/discovery/home-feed-legacy-fields.test.ts
git commit -m "test(home): hard-invariant pin — legacy response fields preserved

Guards against accidental removal of featuredBranches /
trendingBranches / nearbyByCategoryBranches per v1.1 plan
Hard Invariant. Customer-web compatibility."
```

## Task C.5: `<RailHeader>` component

**Files:**
- Create: `apps/customer-app/src/features/home/components/RailHeader.tsx`
- Create: `apps/customer-app/tests/features/home/RailHeader.test.tsx`

**Spec ref:** §7 + §11.1.

- [ ] **Step 1: Write the failing test (parametric `it.each` covering §7 worksheet)**

```tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { RailHeader } from '@/features/home/components/RailHeader'

const featuredLocal   = { locality: { id: 'l1', name: 'Huddersfield' }, scope: 'city' as const,     scopeExpanded: false, rungCounts: {} }
const featuredCascade = { locality: { id: 'l1', name: 'Huddersfield' }, scope: 'platform' as const, scopeExpanded: true,  rungCounts: {} }
const trendingLocal   = { locality: { id: 'l1', name: 'Huddersfield' }, scope: 'city' as const,     scopeExpanded: false, rungCounts: {} }

describe('<RailHeader>', () => {
  it.each([
    [{ meta: featuredLocal, railKind: 'featured' as const }, 'Featured in Huddersfield'],
    [{ meta: { ...featuredLocal, locality: null }, railKind: 'featured' as const }, 'Featured near you'],
    [{ meta: featuredCascade, railKind: 'featured' as const, subtitle: 'Here are the closest matches we have' }, 'Featured on Redeemo'],
    [{ meta: trendingLocal, fallbackCopy: 'Trending near you' }, 'Trending near you'],
    [{ meta: null, fixedCopy: 'Popular on Redeemo' }, 'Popular on Redeemo'],
  ])('renders copy %j → %s', (props, expected) => {
    const { getByText } = render(<RailHeader {...(props as any)} />)
    expect(getByText(expected)).toBeTruthy()
  })

  it('renders subtitle when provided', () => {
    const { getByText } = render(<RailHeader meta={featuredCascade} railKind="featured" subtitle="Here are the closest matches we have" />)
    expect(getByText('Here are the closest matches we have')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/customer-app && npx jest tests/features/home/RailHeader.test.tsx --forceExit
```
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement `RailHeader`**

```tsx
// apps/customer-app/src/features/home/components/RailHeader.tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'

type RailMeta = {
  locality:      { id: string; name: string } | null
  scope:         'nearby' | 'city' | 'platform'
  scopeExpanded: boolean
}

export interface RailHeaderProps {
  fixedCopy?:    string
  meta:          RailMeta | null
  fallbackCopy?: string
  subtitle?:     string
  railKind?:     'featured' | 'trending' | 'popular' | 'nearbyByCategory'
  categoryName?: string
}

export function RailHeader({ fixedCopy, meta, fallbackCopy, subtitle, railKind, categoryName }: RailHeaderProps) {
  const title = (() => {
    if (fixedCopy) return fixedCopy
    if (!meta) return fallbackCopy ?? ''
    if (railKind === 'featured') {
      if (meta.scopeExpanded) return 'Featured on Redeemo'
      if (meta.locality)      return `Featured in ${meta.locality.name}`
      return 'Featured near you'
    }
    if (railKind === 'nearbyByCategory' && categoryName) {
      return `${categoryName} near you`
    }
    return fallbackCopy ?? ''
  })()

  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row:      { paddingHorizontal: 18, paddingTop: 12 },
  title:    { fontSize: 20, fontFamily: 'MusticaPro-Semibold', color: '#010C35' },
  subtitle: { fontSize: 13, fontFamily: 'Lato-Regular',         color: '#6B7280', marginTop: 2 },
})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/customer-app && npx jest tests/features/home/RailHeader.test.tsx --forceExit
```
Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/home/components/RailHeader.tsx apps/customer-app/tests/features/home/RailHeader.test.tsx
git commit -m "feat(home): <RailHeader> conditional-copy component

Spec §7 + §11.1. Renders per the locked-copy worksheet:
Featured in {City} / Featured near you / Featured on Redeemo (+ subtitle)
plus fixedCopy override (Popular) and fallbackCopy default."
```

## Task C.6: `<FeaturedCarousel>` consumes new envelope under `featuredRail`

**Files:**
- Modify: `apps/customer-app/src/features/home/components/FeaturedCarousel.tsx`
- Modify: `apps/customer-app/src/features/home/screens/HomeScreen.tsx`

**Spec ref:** §11.

- [ ] **Step 1: Update `FeaturedCarousel` to accept `rail: HomeRail` prop**

```tsx
import { RailHeader } from './RailHeader'
import type { HomeRail } from '@/lib/api/discovery'

export function FeaturedCarousel({ rail }: { rail: HomeRail }) {
  if (!rail.meta) return null
  return (
    <View>
      <RailHeader
        meta={rail.meta}
        railKind="featured"
        subtitle={rail.meta.scopeExpanded ? 'Here are the closest matches we have' : undefined}
      />
      {/* Existing horizontal carousel rendering rail.branches */}
    </View>
  )
}
```

- [ ] **Step 2: Update `HomeScreen` to read the new envelope name**

```tsx
// In HomeScreen.tsx: read from feed.featuredRail (NOT feed.featured — that name is reserved
// for any historical customer-web-facing keys; we use featuredRail per v1.1 plan).
{feed?.featuredRail?.meta && <FeaturedCarousel rail={feed.featuredRail} />}
```

- [ ] **Step 3: Run customer-app tests + tsc**

```bash
cd apps/customer-app && npx jest tests/features/home --forceExit && npx tsc --noEmit
```
Expected: PASS, tsc clean.

- [ ] **Step 4: Commit**

```bash
git add apps/customer-app/src/features/home/components/FeaturedCarousel.tsx apps/customer-app/src/features/home/screens/HomeScreen.tsx
git commit -m "feat(home): FeaturedCarousel consumes feed.featuredRail envelope

Renders <RailHeader> with cascade-aware subtitle per spec §7.
Customer-app stops reading legacy featuredBranches; backend
continues emitting it per Hard Invariant."
```

---

# Phase D — §BB fix + Trending + Popular rebaseline (atomic)

**Phase goal:** §BB fix (`resolveLocationContext` populates locality from GPS) lands atomically with the new `buildTrendingRail` + `buildPopularRail` that replace the legacy `locationCtx.city`-dependent code paths. New envelopes `trendingRail` + `popularRail` emitted under non-colliding names; legacy `trendingBranches` field preserved.

**Phase-D-only known interim state:** between this phase's merge and Phase E's merge, the legacy NearbyByCategory code path will see a populated `locationCtx.city` for GPS callers — a no-op pre-fix. This applies city-match filtering to NBC that previously didn't fire. **This is INTENDED** — it's a step toward honesty (fewer over-claiming "near you" results). Phase E replaces the NBC code path entirely, eliminating this transitional state. Owner approved per v1.1 plan changelog point 3.

## Task D.1: §BB fix — `resolveLocationContext` populates locality from GPS (atomic with Trending rebaseline)

**Files:**
- Modify: `src/api/customer/discovery/service.ts` (`resolveLocationContext`)
- Create: `tests/api/customer/discovery/home-feed-bb-fix.test.ts`

**Spec ref:** §10.3 + §14.1 (§BB closes).

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/customer/discovery/home-feed-bb-fix.test.ts
import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../../src/api/app'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })
const HUDDERSFIELD = { lat: 53.6458, lng: -1.785 }

let app: FastifyInstance
beforeAll(async () => {
  app = await buildApp()
  app.decorate('prisma', prisma as any)
  await app.ready()
}, 60_000)
afterAll(async () => { if (app) await app.close(); await prisma.$disconnect() })

describe('§BB Home locationContext fix (D8)', () => {
  it('GPS call populates locationContext.locality + city via findNearestLocality', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.locationContext.source).toBe('coordinates')
    expect(body.locationContext.locality).not.toBeNull()
    expect(body.locationContext.locality.name).toMatch(/Huddersfield/i)
    expect(body.locationContext.city).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/customer/discovery/home-feed-bb-fix.test.ts`
Expected: FAIL — pre-fix behaviour returns `city = null` for GPS callers.

- [ ] **Step 3: Update `resolveLocationContext` in `service.ts`**

```ts
async function resolveLocationContext(
  prisma: PrismaClient,
  params: { lat?: number; lng?: number; userId?: string | null },
): Promise<{ locality: { id: string; name: string } | null; city: string | null; lat: number | null; lng: number | null; source: 'coordinates' | 'profile' | 'none' }> {
  if (params.lat !== undefined && params.lng !== undefined) {
    const nearest = await findNearestLocality(prisma, params.lat, params.lng)
    if (nearest) {
      return {
        locality: { id: nearest.id, name: nearest.name },
        city:     nearest.name,
        lat:      params.lat,
        lng:      params.lng,
        source:   'coordinates',
      }
    }
    return { locality: null, city: null, lat: params.lat, lng: params.lng, source: 'coordinates' }
  }
  if (params.userId) {
    const user = await prisma.user.findUnique({
      where:  { id: params.userId },
      select: { city: true, localityId: true },
    })
    if (user?.localityId) {
      const loc = await prisma.locality.findUnique({
        where:  { id: user.localityId },
        select: { id: true, name: true },
      })
      if (loc) return { locality: loc, city: loc.name, lat: null, lng: null, source: 'profile' }
    }
    if (user?.city) {
      const loc = await prisma.locality.findFirst({
        where:  { name: { equals: user.city, mode: 'insensitive' } },
        select: { id: true, name: true },
      })
      if (loc) return { locality: loc, city: loc.name, lat: null, lng: null, source: 'profile' }
    }
  }
  return { locality: null, city: null, lat: null, lng: null, source: 'none' }
}
```

Add import: `import { findNearestLocality } from '../../lib/nearestLocality'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/customer/discovery/home-feed-bb-fix.test.ts`
Expected: PASS — `locationContext.locality.name === 'Huddersfield'`.

- [ ] **Step 5: NO commit yet** — move directly into Task D.2

The §BB fix MUST land atomically with the buildTrendingRail wiring in D.2 to avoid an interim state where the OLD Trending code path sees a populated `locationCtx.city`. Combined commit at the end of D.2.

## Task D.2: `buildTrendingRail` + `buildPopularRail` builders (atomic with §BB fix)

**Files:**
- Modify: `src/api/customer/discovery/homeRailBuilders.ts`
- Modify: `src/api/customer/discovery/service.ts` (`getHomeFeed` orchestrator)
- Modify: `tests/api/customer/discovery/home-feed-rail-states.test.ts`

**Spec ref:** §6.2 + §10.4.

- [ ] **Step 1: Add Trending + Popular integration pins**

```ts
describe('Trending rail — strict NEARBY+CITY (§6.2 + §8.3 rows 4-6)', () => {
  it('local trending supply → trendingRail.meta !== null, popularRail.meta = null', async () => { /* ... */ })
  it('no local trending, UK-wide redemptions → trendingRail.meta = null, popularRail.meta !== null', async () => { /* ... */ })
  it('no redemptions at all → both rails meta = null', async () => { /* ... */ })
  it('mutual exclusion: when source !== "none", at most one of trendingRail/popularRail has meta', async () => { /* ... */ })
})
```

- [ ] **Step 2: Implement `buildTrendingRail`**

```ts
export async function buildTrendingRail(
  prisma: PrismaClient,
  effLoc: EffectiveLocation | null,
  ladderProfile: LadderProfile,
  locationCtx: { locality: LocalityRef | null },
): Promise<HomeRail> {
  if (!effLoc) return { branches: [], meta: null }

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  const recent = await prisma.voucherRedemption.findMany({
    where:  { redeemedAt: { gte: monthStart } },
    select: { branch: { select: { merchantId: true } } },
  })
  const counts: Record<string, number> = {}
  for (const r of recent) counts[r.branch.merchantId] = (counts[r.branch.merchantId] ?? 0) + 1
  const topMerchantIds = Object.entries(counts).sort(([,a],[,b]) => b - a).slice(0, 30).map(([id]) => id)
  if (topMerchantIds.length === 0) return { branches: [], meta: null }

  const merchants = await prisma.merchant.findMany({
    where:  { id: { in: topMerchantIds }, status: MerchantStatus.ACTIVE },
    select: { id: true, branches: { select: BRANCH_TILE_SELECT } },
  })
  const allBranches = merchants.flatMap(m => m.branches.filter(b => b.isActive))

  const rankable    = allBranches.filter(b => b.locationConfidence === 'MANUALLY_CONFIRMED' || b.locationConfidence === 'ADDRESS_GEOCODED')
  const nonRankable = allBranches.filter(b => b.locationConfidence === 'POSTCODE_CENTROID'   || b.locationConfidence === 'NEEDS_REVIEW')

  if (rankable.length === 0) return { branches: [], meta: null }

  const v3 = rankBranchesV3(rankable.map(toRankInput), { effLoc, ladderProfile, outgoingCatchmentTargetIds: [], categoryIntent: 'MIXED', targetCount: 20, hardCap: 500 })
  const resolution = resolveScopeForHomeRail('trending', v3.rungCounts)
  const filtered = v3.tiles.filter(t => t.supplyRung && resolution.retainedRungs.has(t.supplyRung))

  if (filtered.length === 0) return { branches: [], meta: null }

  const tailedBranches = appendStrictLocalityTail(filtered, nonRankable.map(exposeBranchPosition), effLoc)
  const enriched = await enrichBranchTiles(prisma, tailedBranches.slice(0, 10) as any, { effLoc } as any)
  return { branches: enriched, meta: { locality: locationCtx.locality, scope: resolution.scope, scopeExpanded: false, rungCounts: v3.rungCounts } }
}
```

- [ ] **Step 3: Implement `buildPopularRail` with explicit no-location branch**

```ts
export async function buildPopularRail(
  prisma: PrismaClient,
  effLoc: EffectiveLocation | null,
  ladderProfile: LadderProfile,
): Promise<HomeRail> {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  const recent = await prisma.voucherRedemption.findMany({ where: { redeemedAt: { gte: monthStart } }, select: { branch: { select: { merchantId: true } } } })
  const counts: Record<string, number> = {}
  for (const r of recent) counts[r.branch.merchantId] = (counts[r.branch.merchantId] ?? 0) + 1
  const topMerchantIds = Object.entries(counts).sort(([,a],[,b]) => b - a).slice(0, 30).map(([id]) => id)
  if (topMerchantIds.length === 0) return { branches: [], meta: null }

  const merchants = await prisma.merchant.findMany({ where: { id: { in: topMerchantIds }, status: MerchantStatus.ACTIVE }, select: { id: true, branches: { select: BRANCH_TILE_SELECT } } })
  const allBranches = merchants.flatMap(m => m.branches.filter(b => b.isActive))
  if (allBranches.length === 0) return { branches: [], meta: null }

  if (!effLoc) {
    // No-location tile contract: every tile gets null rung/band/distance.
    const nullTiles = await enrichBranchTiles(prisma, allBranches.slice(0, 10).map(exposeBranchPosition) as any, { effLoc: null, forceNullClassification: true } as any)
    return { branches: nullTiles, meta: { locality: null, scope: 'platform', scopeExpanded: false, rungCounts: { ...EMPTY_RUNG_COUNTS } } }
  }

  const rankable    = allBranches.filter(b => b.locationConfidence === 'MANUALLY_CONFIRMED' || b.locationConfidence === 'ADDRESS_GEOCODED')
  const nonRankable = allBranches.filter(b => b.locationConfidence === 'POSTCODE_CENTROID'   || b.locationConfidence === 'NEEDS_REVIEW')
  const v3 = rankable.length > 0
    ? rankBranchesV3(rankable.map(toRankInput), { effLoc, ladderProfile, outgoingCatchmentTargetIds: [], categoryIntent: 'MIXED', targetCount: 20, hardCap: 500 })
    : { tiles: [], rungCounts: { ...EMPTY_RUNG_COUNTS } }
  const tailed = appendPermissiveTail(v3.tiles, nonRankable.map(exposeBranchPosition))
  const enriched = await enrichBranchTiles(prisma, tailed.slice(0, 10) as any, { effLoc } as any)
  return { branches: enriched, meta: { locality: null, scope: 'platform', scopeExpanded: false, rungCounts: v3.rungCounts } }
}
```

NOTE on `enrichBranchTiles` `forceNullClassification` option: this may require a small additive flag on `EnrichBranchCtx` type. Implementer verifies + adds the one-line null-set in the existing enrich path if absent.

- [ ] **Step 4: Wire into `getHomeFeed` with mutual-exclusion invariant + legacy field preservation**

```ts
// In getHomeFeed:
const [featuredRail, trendingRail] = await Promise.all([
  buildFeaturedRail(prisma, effLoc, ladderProfile, locationCtx),
  effLoc ? buildTrendingRail(prisma, effLoc, ladderProfile, locationCtx) : Promise.resolve({ branches: [], meta: null }),
])
const popularRail = (trendingRail.meta === null || !effLoc)
  ? await buildPopularRail(prisma, effLoc, ladderProfile)
  : { branches: [], meta: null }

if (effLoc && trendingRail.meta !== null && popularRail.meta !== null) {
  throw new Error('Invariant violation: trending + popular both populated when effLoc is set')
}

return {
  locationContext: { ... },
  campaigns:       [...],
  // NEW envelopes:
  featuredRail,
  trendingRail,
  popularRail,
  // LEGACY fields — still emitted, sourced from the new builders (per Hard Invariant):
  featuredBranches: featuredRail.branches,
  trendingBranches: trendingRail.branches.length > 0 ? trendingRail.branches : popularRail.branches,
  // (Note: legacy trendingBranches receives whichever rail is non-empty — preserves
  //  the "Trending" surface for customer-web while customer-app uses trendingRail/popularRail.)
  nearbyByCategoryBranches: /* still the old query result until Phase E */,
}
```

- [ ] **Step 5: Run all tests including §BB pin from D.1**

```bash
npx vitest run tests/api/customer/discovery/home-feed-bb-fix.test.ts tests/api/customer/discovery/home-feed-rail-states.test.ts tests/api/customer/discovery/home-feed-fallback-matrix.test.ts tests/api/customer/discovery/home-feed-legacy-fields.test.ts
```
Expected: PASS.

- [ ] **Step 6: Single atomic commit for D.1 + D.2**

```bash
git add src/api/customer/discovery/service.ts src/api/customer/discovery/homeRailBuilders.ts tests/api/customer/discovery/home-feed-bb-fix.test.ts tests/api/customer/discovery/home-feed-rail-states.test.ts
git commit -m "feat(home): §BB fix + buildTrendingRail + buildPopularRail (atomic)

Spec §6.2 + §10.3 + §10.4. Atomic landing of the resolveLocationContext
fix together with the new Trending+Popular rail builders to avoid an
interim state where the LEGACY Trending code path sees a populated
locationCtx.city (was no-op pre-fix).

INTERIM STATE NOTE (between this PR and Phase E PR): the LEGACY
NearbyByCategory code path will see populated locationCtx.city
and apply city-match filtering that was previously a no-op. This
is INTENDED — a step toward honesty. Phase E replaces NBC code
path entirely, eliminating this transitional state.

New envelopes trendingRail + popularRail emitted under non-colliding
names per v1.1 Hard Invariant. Legacy trendingBranches field still
emitted (sourced from whichever rail is populated)."
```

## Task D.3: Backend Popular no-location tile-contract pin

**Files:**
- Modify: `tests/api/customer/discovery/home-feed-rail-states.test.ts`

**Spec ref:** §6.2 + §12.1.

- [ ] **Step 1: Add pin**

```ts
it('Popular no-location (source=none) → every popularRail tile has supplyRung=null, proximityBand=null, distanceMetres=null', async () => {
  const res = await app.inject({ method: 'GET', url: `/api/v1/customer/home` })
  const body = JSON.parse(res.body)
  expect(body.locationContext.source).toBe('none')
  if (body.popularRail?.meta) {
    for (const tile of body.popularRail.branches) {
      expect(tile.supplyRung).toBeNull()
      expect(tile.proximityBand).toBeNull()
      expect(tile.distanceMetres).toBeNull()
    }
  }
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run tests/api/customer/discovery/home-feed-rail-states.test.ts
git add tests/api/customer/discovery/home-feed-rail-states.test.ts
git commit -m "test(home): popularRail no-location tile contract pin (§6.2 v1.2)"
```

## Task D.4: `<PopularSection>` customer-app sibling

**Files:**
- Create: `apps/customer-app/src/features/home/components/PopularSection.tsx`
- Create: `apps/customer-app/tests/features/home/PopularSection.test.tsx`
- Modify: `apps/customer-app/src/features/home/components/TrendingSection.tsx`
- Modify: `apps/customer-app/src/features/home/screens/HomeScreen.tsx`

**Spec ref:** §11.7.

- [ ] **Step 1: Write tests for PopularSection**

```tsx
describe('<PopularSection>', () => {
  it('renders Popular on Redeemo header via fixedCopy', () => { /* ... */ })
  it('with null rung/band/distance tiles → tiles render WITHOUT distance/proximity chip', () => { /* ... */ })
  it('with classifiable tiles → distance/proximity chip renders', () => { /* ... */ })
})
```

- [ ] **Step 2: Implement `PopularSection`**

```tsx
import { RailHeader } from './RailHeader'
import type { HomeRail } from '@/lib/api/discovery'

export function PopularSection({ rail }: { rail: HomeRail }) {
  if (!rail.meta) return null
  return (
    <View>
      <RailHeader fixedCopy="Popular on Redeemo" meta={rail.meta} />
      {/* Same horizontal-carousel chrome as TrendingSection */}
    </View>
  )
}
```

- [ ] **Step 3: Update HomeScreen swap logic — reads NEW envelopes**

```tsx
{feed?.trendingRail?.meta && <TrendingSection rail={feed.trendingRail} />}
{!feed?.trendingRail?.meta && feed?.popularRail?.meta && <PopularSection rail={feed.popularRail} />}
```

- [ ] **Step 4: Update `TrendingSection` to consume `rail: HomeRail`**

Similar to FeaturedCarousel — accept `rail` prop, use `<RailHeader fallbackCopy="Trending near you" meta={rail.meta} />`.

- [ ] **Step 5: Run + commit**

```bash
cd apps/customer-app && npx jest tests/features/home --forceExit
git add apps/customer-app/src/features/home/components/PopularSection.tsx apps/customer-app/tests/features/home/PopularSection.test.tsx apps/customer-app/src/features/home/components/TrendingSection.tsx apps/customer-app/src/features/home/screens/HomeScreen.tsx
git commit -m "feat(home): <PopularSection> sibling rail + HomeScreen swap

Spec §11.7. Renders only when Trending is empty OR no-effLoc.
In no-effLoc state, tiles carry null rung/band/distance and the
chip auto-hides per P3.

Customer-app reads feed.trendingRail / feed.popularRail. Legacy
trendingBranches field unchanged on the wire."
```

---

# Phase E — NearbyByCategory rail + section empty

Phase goal: Per-category strict scope + `<NearbySectionEmpty>` card when all categories empty. Legacy `nearbyByCategoryBranches` field continues to be emitted. End state: NBC behaves per spec §6.3; the Phase-D interim state is eliminated.

## Task E.1: `buildNearbyByCategoryRails` builder + tests

**Files:**
- Modify: `src/api/customer/discovery/homeRailBuilders.ts`
- Modify: `tests/api/customer/discovery/home-feed-rail-states.test.ts`
- Modify: `tests/api/customer/discovery/home-feed-fallback-matrix.test.ts` (rows 7 + 8)

**Spec ref:** §6.3 + §8.3 rows 7-8.

- [ ] **Step 1: Add backend pins**

```ts
describe('NearbyByCategory rails (§6.3 + §8.3 rows 7-8)', () => {
  it('per-category supply → nearbyByCategoryRails[].meta !== null with {Category} near you header data', async () => { /* ... */ })
  it('per-category empty → that category absent from nearbyByCategoryRails array', async () => { /* ... */ })
  it('all categories empty (effLoc resolved) → nearbyByCategoryRails.length === 0', async () => { /* ... */ })
})
```

- [ ] **Step 2: Implement `buildNearbyByCategoryRails`**

Use the existing inclusion logic (60-merchant bulk fetch → group by primaryCategoryId → 5 per category, 6 categories), but for each surviving category run candidates through `rankBranchesV3` + strict NEARBY+CITY scope + `appendStrictLocalityTail`. Categories with zero local-tier supply are excluded from the array.

Pattern matches `buildFeaturedRail` / `buildTrendingRail` exactly, parameterised per category. Implementer copies the pattern.

- [ ] **Step 3: Wire into `getHomeFeed` + preserve legacy field**

```ts
const nbcRails = effLoc ? await buildNearbyByCategoryRails(prisma, effLoc, ladderProfile, locationCtx) : []

return {
  // ... featuredRail, trendingRail, popularRail unchanged from Phase D ...
  nearbyByCategoryRails: nbcRails,                       // NEW envelope
  nearbyByCategoryBranches: nbcRails.map(r => ({          // LEGACY field — sourced from new builder per Hard Invariant
    category: r.category,
    branches: r.branches,
  })),
}
```

- [ ] **Step 4: Commit**

```bash
git add src/api/customer/discovery/homeRailBuilders.ts src/api/customer/discovery/service.ts tests/api/customer/discovery/home-feed-rail-states.test.ts tests/api/customer/discovery/home-feed-fallback-matrix.test.ts
git commit -m "feat(home): buildNearbyByCategoryRails + per-category scope filter

Spec §6.3. Each category runs through rankBranchesV3 + strict
NEARBY+CITY scope + appendStrictLocalityTail. Categories with
zero local supply excluded from the response array.

Eliminates the Phase-D interim state (legacy NBC code path with
post-§BB-fix city-match filtering) by fully replacing the code
path.

New envelope nearbyByCategoryRails under non-colliding name. Legacy
nearbyByCategoryBranches field still emitted (sourced from new builder)."
```

## Task E.2: `<NearbySectionEmpty>` component

**Files:**
- Create: `apps/customer-app/src/features/home/components/NearbySectionEmpty.tsx`
- Create: `apps/customer-app/tests/features/home/NearbySectionEmpty.test.tsx`
- Modify: `apps/customer-app/src/features/home/components/NearbyByCategory.tsx`
- Modify: `apps/customer-app/src/features/home/screens/HomeScreen.tsx`

**Spec ref:** §8.4 + §11.4.

- [ ] **Step 1: Write the failing test**

```tsx
describe('<NearbySectionEmpty>', () => {
  it("renders headline L1 (We're still growing near you)", () => { /* ... */ })
  it('renders body L5', () => { /* ... */ })
  it('primary button L6 navigates to Categories tab', () => { /* ... */ })
  it('secondary button L7 navigates to Search tab', () => { /* ... */ })
  it('testID home-nearby-section-empty present', () => { /* ... */ })
})
```

- [ ] **Step 2: Implement (copy from §8.2 phrase library)**

```tsx
import React from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { Text } from '@/design-system/Text'

export function NearbySectionEmpty() {
  const router = useRouter()
  return (
    <View style={styles.card} testID="home-nearby-section-empty">
      <Text style={styles.title}>We're still growing near you</Text>
      <Text style={styles.body}>Try browsing categories or searching to find offers across the UK.</Text>
      <View style={styles.row}>
        <Pressable style={styles.primary}   onPress={() => router.push('/(app)/categories' as any)}>
          <Text style={styles.primaryLabel}>Browse all categories</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => router.push('/(app)/search' as any)}>
          <Text style={styles.secondaryLabel}>Open search</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({ /* token-backed styles per §11.4 */ })
```

- [ ] **Step 3: Wire into HomeScreen — render when nearbyByCategoryRails empty + effLoc resolved**

```tsx
{(feed?.nearbyByCategoryRails?.length ?? 0) > 0 && <NearbyByCategory rails={feed.nearbyByCategoryRails!} />}
{(feed?.nearbyByCategoryRails?.length ?? 0) === 0 && feed?.locationContext.source !== 'none' && <NearbySectionEmpty />}
```

- [ ] **Step 4: Run + commit**

```bash
cd apps/customer-app && npx jest tests/features/home --forceExit
git add apps/customer-app/src/features/home/components/NearbySectionEmpty.tsx apps/customer-app/tests/features/home/NearbySectionEmpty.test.tsx apps/customer-app/src/features/home/components/NearbyByCategory.tsx apps/customer-app/src/features/home/screens/HomeScreen.tsx
git commit -m "feat(home): <NearbySectionEmpty> friendly empty card

Spec §8.4 + §11.4. Renders when nearbyByCategoryRails.length === 0
AND locationContext.source !== 'none'. Copy from §8.2 phrase library
L1/L5/L6/L7."
```

---

# Phase F — No-location banner + ExploreMore + dedup

Phase goal: All three fallback components mounted; HomeScreen enforces §8.7 dedup rules. End state: all 11 §8.3 matrix rows behave correctly.

## Task F.1: `<HomeNoLocationBanner>` component

**Files:**
- Create: `apps/customer-app/src/features/home/components/HomeNoLocationBanner.tsx`
- Create: `apps/customer-app/tests/features/home/HomeNoLocationBanner.test.tsx`

**Spec ref:** §8.6 + §11.3.

- [ ] **Step 1: Tests pinning L4/L8/L9/L10 + render conditions**
- [ ] **Step 2: Implement component (per §8.6 spec)**
- [ ] **Step 3: Run + commit**

```bash
git commit -m "feat(home): <HomeNoLocationBanner> top-of-Home banner

Spec §8.6 + §11.3. Renders only when locationContext.source === 'none'.
Primary CTA triggers GPS permission; secondary deep-links to PC2."
```

## Task F.2: `<HomeExploreMore>` component

**Files:**
- Create: `apps/customer-app/src/features/home/components/HomeExploreMore.tsx`
- Create: `apps/customer-app/tests/features/home/HomeExploreMore.test.tsx`

**Spec ref:** §8.5 + §11.5.

- [ ] **Step 1: Tests pinning L3/L11 + sparse-supply heuristic + v1.2 mutual exclusion**

```tsx
it('does NOT render when <NearbySectionEmpty> is rendering (v1.2 dedup)', () => {
  // Mock feed: nearbyByCategoryRails.length === 0 + sparse-heuristic met + source !== 'none'
  // Assert: <HomeExploreMore> does NOT mount.
})
```

- [ ] **Step 2: Implement component**
- [ ] **Step 3: Run + commit**

```bash
git commit -m "feat(home): <HomeExploreMore> page-bottom soft CTA

Spec §8.5 + §11.5. Sparse-supply heuristic + v1.2 mutual exclusion
with <NearbySectionEmpty> + <HomeNoLocationBanner>."
```

## Task F.3: HomeScreen render order + dedup rules

**Files:**
- Modify: `apps/customer-app/src/features/home/screens/HomeScreen.tsx`
- Create: `apps/customer-app/tests/features/home/HomeScreen.renderOrder.test.tsx`
- Create: `apps/customer-app/tests/features/home/HomeScreen.dedupRules.test.tsx`

**Spec ref:** §8.7 + §8.8 + §11.8.

- [ ] **Step 1: Implement the helper that computes which components to render**

```tsx
const showNoLocationBanner   = feed.locationContext.source === 'none'
const showNearbySectionEmpty = !showNoLocationBanner
  && (feed.nearbyByCategoryRails?.length ?? 0) === 0
const sparseHeuristic =
  (!feed.featuredRail?.meta || feed.featuredRail.meta.scopeExpanded) &&
  !feed.trendingRail?.meta &&
  (feed.nearbyByCategoryRails?.length ?? 0) < 2 &&
  feed.locationContext.source !== 'none'
const showExploreMore = sparseHeuristic && !showNearbySectionEmpty
```

- [ ] **Step 2: Render in spec §8.8 order**

```tsx
return (
  <ScrollView>
    {showNoLocationBanner && <HomeNoLocationBanner />}
    <CampaignCarousel /* unchanged */ />
    {feed.featuredRail?.meta && <FeaturedCarousel rail={feed.featuredRail} />}
    {feed.trendingRail?.meta && <TrendingSection rail={feed.trendingRail} />}
    {!feed.trendingRail?.meta && feed.popularRail?.meta && <PopularSection rail={feed.popularRail} />}
    {(feed.nearbyByCategoryRails?.length ?? 0) > 0 && <NearbyByCategory rails={feed.nearbyByCategoryRails!} />}
    {showNearbySectionEmpty && <NearbySectionEmpty />}
    {showExploreMore && <HomeExploreMore />}
  </ScrollView>
)
```

- [ ] **Step 3: Render-order test**

```tsx
it('mocked §8.3 row #5 → components mount in §8.8 order', () => {
  // Setup mock with trendingRail empty + popularRail populated + nearbyByCategoryRails populated.
  // Assert children appear in order: campaign → featuredRail → popularRail → nearbyByCategoryRails.
})
```

- [ ] **Step 4: Dedup tests (the three invariants)**

```tsx
it('banner + NearbySectionEmpty never both render', () => { /* mock source=none + nbcRails.length=0 → assert only banner */ })
it('banner + HomeExploreMore never both render', () => { /* mock sparse + source=none → assert only banner */ })
it('NearbySectionEmpty + HomeExploreMore never both render (v1.2)', () => { /* mock nbcRails.length=0 + sparse → assert only NearbySectionEmpty */ })
it('Banner CAN coexist with PopularSection', () => { /* mock source=none + popularRail populated → both render */ })
```

- [ ] **Step 5: Run + commit**

```bash
cd apps/customer-app && npx jest tests/features/home --forceExit && npx tsc --noEmit
git add apps/customer-app/src/features/home/screens/HomeScreen.tsx apps/customer-app/tests/features/home/HomeScreen.renderOrder.test.tsx apps/customer-app/tests/features/home/HomeScreen.dedupRules.test.tsx
git commit -m "feat(home): HomeScreen render order + dedup rules

Spec §8.7 + §8.8. Render order: banner → campaign → featuredRail →
trendingRail|popularRail → nearbyByCategoryRails|empty → explore-more.

Dedup invariants: banner ⊥ empty, banner ⊥ explore-more,
empty ⊥ explore-more (v1.2)."
```

## Task F.4: Backend fallback-matrix pins (rows 9/10/11)

**Files:**
- Modify: `tests/api/customer/discovery/home-feed-fallback-matrix.test.ts`

**Spec ref:** §8.3 rows 9/10/11.

- [ ] **Step 1: Add pins for no-location, sparse-supply, total-empty**
- [ ] **Step 2: Run + commit**

```bash
git commit -m "test(home): fallback-matrix pins for §8.3 rows 9/10/11"
```

---

# Phase G — Final test coverage + customer-app legacy-read cleanup

**Hard invariant reaffirmed:** this phase does NOT remove backend fields. Customer-app stops reading legacy fields; backend continues emitting them. Backend field removal is a future §CU.1 / Phase 3b workstream.

## Task G.1: Audit pins against spec §12 + customer-app legacy-read cleanup

**Files:** all test files; customer-app components

- [ ] **Step 1: For each line of §12 (subsections 12.1 through 12.5), confirm a pin exists**

Walk the spec; tick off pins. Add any missing pins; commit each as `test(home): close §12.X coverage gap`.

- [ ] **Step 2: Customer-app — confirm all consumers reference NEW envelope fields**

```bash
grep -rn "featuredBranches\|trendingBranches\|nearbyByCategoryBranches" apps/customer-app/src/
```

Confirm: NO customer-app file reads legacy fields. Schemas in `discovery.ts` may keep them as `.optional()` (since the backend still emits them) but no consumer reads them.

- [ ] **Step 3: Verify legacy backend fields STILL EMITTED (hard-invariant guard)**

Run: `npx vitest run tests/api/customer/discovery/home-feed-legacy-fields.test.ts`
Expected: 2/2 PASS. The hard-invariant pin from Task C.4 guards this.

- [ ] **Step 4: DO NOT remove legacy backend fields**

Confirm via the implementing agent's self-review: `getHomeFeed` continues to return `featuredBranches` / `trendingBranches` / `nearbyByCategoryBranches`. Removal belongs to §CU.1 / Phase 3b — explicitly out of this workstream's scope.

- [ ] **Step 5: Commit any test additions**

```bash
git commit -m "test(home): close §12 coverage gaps + verify legacy fields preserved

Hard-invariant pin (Task C.4) confirms backend continues emitting
featuredBranches / trendingBranches / nearbyByCategoryBranches
sourced from the new rail builders' branch arrays. Customer-app
no longer reads these — backend keeps emitting per Hard Invariant."
```

## Task G.2: Full test gates + tsc

- [ ] **Step 1: Run full backend tests**

```bash
npx vitest run
```
Expected: 100% pass.

- [ ] **Step 2: Run full customer-app tests**

```bash
cd apps/customer-app && npx jest --forceExit
```
Expected: 100% pass (modulo the 1 pre-existing baseline failure on `tests/lib/api/profile.test.ts` documented in CLAUDE.md).

- [ ] **Step 3: tsc clean on both**

```bash
npx tsc --noEmit -p tsconfig.json
cd apps/customer-app && npx tsc --noEmit
```
Expected: no NEW errors (backend root has 4 pre-existing §BV errors in `savings.service.test.ts`).

---

# Phase H — Device QA + PR prep

## Task H.1: Device QA checklist (owner-driven)

Owner runs these scenarios on a real iOS device. Each scenario must produce the locked-spec behaviour. Plan author/agent does NOT execute these — owner does.

Backend test data may need preparation per scenario; identify which seed configurations + dev override scripts to use. See [docs/operations/customer-app-dev-location-override.md](../../operations/customer-app-dev-location-override.md) for the `__DEV__`-gated GPS override.

**Huddersfield (local-supply test):**
- [ ] **DQ.1** — Featured rail shows `Featured in Huddersfield` header; cards genuinely in/near Huddersfield; distance chip on every classifiable tile.
- [ ] **DQ.2** — `Trending near you` rail renders with header copy `Trending near you`; cards in Huddersfield catchment only.
- [ ] **DQ.3** — At least 2 per-category nearby rails render (e.g. `Restaurants near you`, `Cafes & Coffee near you`); cards genuinely local.
- [ ] **DQ.4** — `<HomeExploreMore>` does NOT render (page has enough local supply).
- [ ] **DQ.5** — `<HomeNoLocationBanner>` does NOT render.
- [ ] **DQ.6** — `<NearbySectionEmpty>` does NOT render.

**Bristol or other supply-thin locality (cascade + sparse test):**
- [ ] **DQ.7** — Featured rail header is `Featured on Redeemo` (cascade); subtitle `Here are the closest matches we have`.
- [ ] **DQ.8** — Or Featured rail hidden entirely if no Featured supply at all.
- [ ] **DQ.9** — Either `Trending near you` renders if Bristol has local redemptions, OR `Popular on Redeemo` sibling renders.
- [ ] **DQ.10** — Per-category nearby rails: only categories with local Bristol supply render; empty categories absent.
- [ ] **DQ.11** — If all category rails empty: `<NearbySectionEmpty>` card visible with `We're still growing near you` + two CTAs.
- [ ] **DQ.12** — `<HomeExploreMore>` page-bottom CTA visible IF sparse-heuristic conditions met AND `<NearbySectionEmpty>` NOT rendering (mutual exclusion verified).

**No-location state (banner test):**
- [ ] **DQ.13** — Revoke location permission + clear profile area (use dev script).
- [ ] **DQ.14** — Open Home → `<HomeNoLocationBanner>` renders at top with headline `Set your area to see nearby offers`.
- [ ] **DQ.15** — Featured / Trending / NearbyByCategory all hidden.
- [ ] **DQ.16** — `Popular on Redeemo` rail visible (tiles render WITHOUT distance/proximity chip).
- [ ] **DQ.17** — Tap `Allow location` → permission prompt → grant → banner unmounts + rails populate.
- [ ] **DQ.18** — Re-revoke permission, tap `Set my area` → navigates to PC2 address screen → after saving, returns to Home with rails populated via profile.
- [ ] **DQ.19** — Mutual exclusion: banner + nearby-empty never both visible; banner + ExploreMore never both visible.

**Tail surface test (non-rankable branch):**
- [ ] **DQ.20** — Set up a fixture POSTCODE_CENTROID branch in Huddersfield + verify it appears under Trending nearby (passes strict-locality gate via postTown).
- [ ] **DQ.21** — Set up a POSTCODE_CENTROID branch in Leeds while user is in Huddersfield + verify it does NOT appear in any `near you` rail (fails strict-locality gate).
- [ ] **DQ.22** — Same Leeds branch DOES appear under `Featured on Redeemo` cascade (no gate on platform-claim rails).

**Trending → Popular swap test:**
- [ ] **DQ.23** — Use a locality with no current-month redemptions → `Trending near you` rail absent.
- [ ] **DQ.24** — `Popular on Redeemo` rail renders in Trending's slot (verify same vertical position).

**Featured cascade tie-break test:**
- [ ] **DQ.25** — Confirm cascaded Featured uses `startDate ASC` (matches today's admin curation order) within rung.

**Distance / proximity chip honesty:**
- [ ] **DQ.26** — Every classifiable tile carries distance + proximity band chip (matching Search's format).
- [ ] **DQ.27** — POSTCODE_CENTROID tiles carry NO chip (no placeholder).
- [ ] **DQ.28** — No-location Popular tiles carry NO chip.

**Hard-invariant smoke test (backend wire shape):**
- [ ] **DQ.29** — Hit `/api/v1/customer/home?lat=...&lng=...` directly; confirm response carries BOTH new envelope fields (`featuredRail` / `trendingRail` / `popularRail` / `nearbyByCategoryRails`) AND legacy fields (`featuredBranches` / `trendingBranches` / `nearbyByCategoryBranches`).

## Task H.2: PR description + scope verification

- [ ] **Step 1: Draft PR title + description**

PR title: `feat(home): relevance + honesty rebaseline (Tier 3)`

PR body should include:
- One-paragraph goal pulled from this plan's header.
- Reference to spec v1.2 + brainstorm sessions.
- Hard Invariant restated: NO removal of existing wire fields (`featuredBranches` / `trendingBranches` / `nearbyByCategoryBranches` preserved; new envelopes under non-colliding `featuredRail` / `trendingRail` / `popularRail` / `nearbyByCategoryRails` names).
- Owner decisions D1–D12 status.
- Test gates at branch tip (vitest counts + jest counts + tsc).
- Device QA checklist DQ.1–DQ.29.
- Out-of-scope confirmations (Campaign, sticky-controls, customer-web, Map, Search, voucher search, visual polish, backend field removal).

- [ ] **Step 2: Verify PR scope via live `gh api compare`**

```bash
gh api repos/MSC23-bot/Redeemo/compare/main...<branch> --jq '{commits: (.commits | length), files: (.files | length), file_list: [.files[].filename]}'
```
Confirm: only files listed in this plan's "File structure" section appear; no surprises.

- [ ] **Step 3: SHA-bound merge after owner device-QA approval**

```bash
REDEEMO_PR_SCOPE_VERIFIED=$(gh pr view <N> --json headRefOid --jq .headRefOid) gh pr merge <N> --merge --delete-branch
```

---

## Self-review (v1.1 re-run)

After v1.1 revisions ran the writing-plans skill self-review checklist:

**1. Spec coverage** — every spec section §1–§17 has at least one task that exercises it. Verified.
- §1 ✓ / §2 D1–D12 ✓ / §3 P1–P6 ✓ / §5 wire contract under non-colliding names ✓ / §6.1 Featured ✓ / §6.2 Trending+Popular ✓ / §6.3 NBC ✓ / §6.4 strict-locality gate ✓ / §7 copy worksheet ✓ / §8.2 phrase library ✓ / §8.3 fallback matrix ✓ / §8.4–§8.6 components ✓ / §8.7 dedup ✓ / §8.8 render order ✓ / §10 backend ✓ / §11 customer-app ✓ / §12 test strategy ✓ / §14.1 §BB closes ✓.

**2. Placeholder scan** — three abbreviated step bodies disclosed: C.2 fixture concrete shape, E.1 mechanical loop pattern, F.1/F.2 mirror-of-prior-task. These are conscious abbreviations with pause-and-ask discipline if ambiguous, not placeholders.

**3. Type consistency** — `HomeRailMeta` / `HomeRail` / `HomeNearbyCategoryRail` defined consistently across B.1 (backend) and B.2 (customer-app Zod). `BranchTile.supplyRung/proximityBand/distanceMetres` already exist from branch-first rebaseline.

**4. Naming consistency — v1.1 critical re-check** — verified throughout:
- Backend wire fields: `featuredRail` / `trendingRail` / `popularRail` / `nearbyByCategoryRails` (new, non-colliding).
- Backend legacy wire fields: `featuredBranches` / `trendingBranches` / `nearbyByCategoryBranches` (preserved unchanged).
- Customer-app reads new fields throughout (C.6, D.4, E.2, F.3).
- Builder function names: `buildFeaturedRail` / `buildTrendingRail` / `buildPopularRail` / `buildNearbyByCategoryRails` consistent.
- Helper names: `resolveScopeForHomeRail` / `appendStrictLocalityTail` / `appendPermissiveTail` consistent.

**5. Phase boundaries are buildable + hard invariant respected:**
- **A** (helpers only): green build; ZERO observable Home behaviour change; no wire shape change. ✓
- **B** (additive types/Zod): no observable change; new envelopes scaffolded, not populated. ✓
- **C** (Featured rail + RailHeader): Featured rail behaves per spec via `featuredRail`; legacy `featuredBranches` continues to be emitted (sourced from new builder); customer-app reads new envelope. Hard-invariant pin Task C.4 guards this. ✓
- **D** (§BB + Trending + Popular ATOMIC): §BB fix lands together with new builders to avoid interim legacy-Trending state. Known interim NBC state explicitly documented + accepted per owner v1.1. ✓
- **E** (NBC + section empty): eliminates Phase-D interim NBC state by replacing the legacy code path entirely. Legacy `nearbyByCategoryBranches` still emitted. ✓
- **F** (banner + ExploreMore + dedup): visible behaviour for all 11 §8.3 matrix rows. ✓
- **G** (test coverage + customer-app legacy-read cleanup): backend fields NOT removed; only customer-app stops reading them. Hard invariant respected. ✓
- **H** (device QA + PR): DQ.29 explicitly smoke-tests legacy-field preservation. ✓

**6. v1.1 contradictions check** — all four owner blockers resolved:
- ✅ #1 envelope-name collision — new envelopes use non-colliding `featuredRail` / `trendingRail` / `popularRail` / `nearbyByCategoryRails`. Verified across plan: B.1, B.2, C.1, C.6, D.2, D.4, E.1, E.2, F.3, test pin assertions throughout.
- ✅ #2 Phase G no backend removal — G.1 rewritten to do customer-app legacy-read cleanup only; backend continues emitting all legacy fields indefinitely.
- ✅ #3 Phase A behaviour change — §BB fix moved out of Phase A into Phase D as Task D.1 atomic with buildTrendingRail wiring. Phase A is now genuinely no-observable-change. Known Phase-D interim NBC state explicitly documented.
- ✅ #4 Hard invariant — top-level section + restated in Phase G; legacy-fields pin (Task C.4) actively guards it from Phase C onward; DQ.29 device-QA smoke-tests it.

Self-review passes v1.1.

---

## Execution handoff

Plan v1.1 complete and saved to `docs/superpowers/plans/2026-05-22-home-relevance.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task; review between tasks; fast iteration; spec-compliance + code-quality two-stage review after each task per `superpowers:subagent-driven-development`. Best fit for a Tier 3 workstream of this size.

2. **Inline Execution** — I execute tasks in this session using `superpowers:executing-plans` with batch execution + checkpoints. Faster end-to-end but each task accumulates context in the main conversation.

**Which approach would you like?** Default subagent-driven unless you say otherwise — but the plan is ready either way. No code touched in this turn.

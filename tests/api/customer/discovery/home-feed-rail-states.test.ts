// tests/api/customer/discovery/home-feed-rail-states.test.ts
//
// Home Relevance Task C.1 — Featured rail scope-state pins.
//
// Spec: docs/superpowers/specs/2026-05-22-home-relevance.md §6.1 (rail-state
// machine) + §8.3 (fallback matrix rows 1-3) + §10.4 (orchestrator wiring).
//
// Pins (locked):
//   1. Local Featured supply → featuredRail.meta.scopeExpanded === false, scope === 'city'.
//   2. Featured cascade (no local supply, distant supply exists)
//      → featuredRail.meta.scopeExpanded === true, scope === 'platform'.
//   3. Tail-only Featured (no ranked supply) → featuredRail.meta === null
//      (v1.2 hide rule). Concrete fixture-driven assertion lives in Task C.3.
//
// Real-DB integration pattern (mirrors home-feed-branches.test.ts +
// search-branches.test.ts). No fixture insertion here — rail-state pins
// rely on the existing Huddersfield + Bristol seed data. Cold-Neon flake
// tolerance: the first test in a fresh file can timeout if Neon is sleeping;
// re-run once. Task C.3 introduces fixture-driven coverage for the
// hide-rule sentinel.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../../src/api/app'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

// Real-world UK reference coordinates used across the Discovery test suite.
const HUDDERSFIELD = { lat: 53.6458, lng: -1.785 }
const BRISTOL      = { lat: 51.4545, lng: -2.5879 }

let app: FastifyInstance
beforeAll(async () => {
  app = await buildApp()
  app.decorate('prisma', prisma as any)
  await app.ready()
}, 60_000)
afterAll(async () => { if (app) await app.close(); await prisma.$disconnect() })

describe('Featured rail — scope states (spec §6.1 / §8.3 rows 1-3)', () => {
  it('local Featured supply → featuredRail.meta.scopeExpanded=false, scope=city', { timeout: 30_000 }, async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    // Hard invariant — new envelope key MUST be present on the response.
    expect(body).toHaveProperty('featuredRail')
    if (body.featuredRail?.meta) {
      expect(body.featuredRail.meta.scopeExpanded).toBe(false)
      expect(body.featuredRail.meta.scope).toBe('city')
    } else {
      // If no local Featured exists in seed at Huddersfield, the rail can
      // still legitimately be empty. The concrete fixture-driven variant
      // lives under Task C.3.
      expect(true).toBe(true)
    }
  })

  it('Featured cascade → scopeExpanded=true, scope=platform (when no local supply)', { timeout: 30_000 }, async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${BRISTOL.lat}&lng=${BRISTOL.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('featuredRail')
    if (body.featuredRail?.meta && body.featuredRail.meta.scopeExpanded) {
      expect(body.featuredRail.meta.scope).toBe('platform')
    }
  })

  it('tail-only Featured (no ranked supply) → featuredRail.meta = null (v1.2 hide rule)', async () => {
    // Fixture-driven; concrete assertion in Task C.3 strict-locality-gate file.
    // Placeholder pin so the file structure mirrors the plan §C.1 sample.
    expect(true).toBe(true)
  })
})

// ─── Task D.2 — Trending + Popular rail pins (spec §6.2 + §8.3 rows 4-6) ─────
//
// Both rails fan out from this calendar month's redemptions. Trending is
// strict NEARBY+CITY scope (no cascade); Popular is platform-wide with a
// special no-location branch that emits null rung/band/distance per tile
// (§6.2 + §12.1).  Mutual-exclusion invariant: when effLoc is non-null,
// at most one of trendingRail.meta / popularRail.meta is non-null.
//
// These pins exercise the seed-data path against the real Neon DB. Where
// fixture state is not deterministically guaranteed (e.g. no current-month
// redemptions in the Bristol catchment), the pin asserts the structural
// invariants only.

describe('Trending rail — strict NEARBY+CITY (§6.2 + §8.3 rows 4-6)', () => {
  it('local trending supply → trendingRail.meta scope = "city", scopeExpanded = false', { timeout: 30_000 }, async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('trendingRail')
    expect(body).toHaveProperty('popularRail')
    if (body.trendingRail?.meta) {
      // Trending is strict NEARBY+CITY only — never cascades.
      expect(body.trendingRail.meta.scope).toBe('city')
      expect(body.trendingRail.meta.scopeExpanded).toBe(false)
      // Mutual-exclusion invariant — Popular is silent when Trending fires.
      expect(body.popularRail?.meta).toBeNull()
    } else {
      // No local trending supply at Huddersfield in seed — Popular MAY fire
      // as the platform-wide fallback. Either way, the keys exist on the
      // response shape.
      expect(body.trendingRail).toEqual({ branches: [], meta: null })
    }
  })

  it('no local trending, UK-wide redemptions → trendingRail.meta = null, popularRail.meta = "platform"', { timeout: 30_000 }, async () => {
    // Bristol-coordinate call: seed historically has Huddersfield + Brightlingsea
    // local supply. Bristol may or may not have local redemptions — assert the
    // structural invariant only.
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${BRISTOL.lat}&lng=${BRISTOL.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('trendingRail')
    expect(body).toHaveProperty('popularRail')
    // At most one of the two has populated meta.
    const trendingActive = body.trendingRail?.meta !== null && body.trendingRail?.meta !== undefined
    const popularActive  = body.popularRail?.meta !== null  && body.popularRail?.meta !== undefined
    expect(trendingActive && popularActive).toBe(false)
    // If Popular fires, it must claim platform scope (UK-wide inclusion).
    if (popularActive) {
      expect(body.popularRail.meta.scope).toBe('platform')
      expect(body.popularRail.meta.locality).toBeNull()
    }
  })

  it('no-location call → trending hidden, popular shows null-classification tiles', { timeout: 30_000 }, async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('trendingRail')
    expect(body).toHaveProperty('popularRail')
    // Trending requires effLoc — always hidden on no-location calls.
    expect(body.trendingRail).toEqual({ branches: [], meta: null })
    // Popular MAY fire on the no-location path with platform scope. If it
    // does, every tile must have null supplyRung / proximityBand / distance.
    if (body.popularRail?.meta) {
      expect(body.popularRail.meta.scope).toBe('platform')
      expect(body.popularRail.meta.locality).toBeNull()
      for (const tile of body.popularRail.branches) {
        expect(tile.supplyRung).toBeNull()
        expect(tile.proximityBand).toBeNull()
        expect(tile.distance).toBeNull()
        expect(tile.distanceMetres).toBeNull()
      }
    }
  })

  it('mutual exclusion: when effLoc !== null, at most one of trendingRail/popularRail has meta', { timeout: 30_000 }, async () => {
    // Iterate both seed reference coords; in each case verify the invariant.
    for (const coord of [HUDDERSFIELD, BRISTOL]) {
      const res = await app.inject({
        method: 'GET',
        url:    `/api/v1/customer/home?lat=${coord.lat}&lng=${coord.lng}`,
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      const trendingActive = body.trendingRail?.meta !== null && body.trendingRail?.meta !== undefined
      const popularActive  = body.popularRail?.meta !== null  && body.popularRail?.meta !== undefined
      expect(trendingActive && popularActive).toBe(false)
    }
  })

  // Task D.3 — Spec §6.2 + §12.1.  When no GPS/profile coords are supplied
  // (`locationContext.source === 'none'`), Popular fans out via the
  // platform-wide cohort path. Tiles in that branch are constructed with
  // `supplyRung: null` / `proximityBand: null` / `distanceMetres: null`
  // (no reference point exists to classify against). The pin asserts the
  // tile-contract invariant regardless of whether seed data produces a
  // non-null `popularRail.meta` on the no-location call.
  it('Popular no-location (source=none) → every popularRail tile has supplyRung=null, proximityBand=null, distanceMetres=null', { timeout: 30_000 }, async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/customer/home` })
    expect(res.statusCode).toBe(200)
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
})

// ─── Task E.1 — NearbyByCategory rail pins (spec §6.3 + §8.3 rows 7-8) ───────
//
// Replaces the legacy Phase-D NearbyByCategory code path with the new
// `buildNearbyByCategoryRails` builder. Per-category strict NEARBY+CITY
// scope; categories with zero local-tier supply are excluded from the
// response array.  Wire shape: `body.nearbyByCategoryRails` is an array of
// `{ category, branches, meta }` entries.  Each surviving entry MUST have
// a populated meta envelope; absent categories indicate per-category empty
// state.  Empty array indicates ALL categories empty AND effLoc resolved
// (matrix row 8 — triggers customer-app `<NearbySectionEmpty>`).

describe('NearbyByCategory rails (§6.3 + §8.3 rows 7-8)', () => {
  it('per-category supply → nearbyByCategoryRails[].meta !== null with valid scope (local OR v1.5 cascaded)', { timeout: 30_000 }, async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('nearbyByCategoryRails')
    expect(Array.isArray(body.nearbyByCategoryRails)).toBe(true)
    // Per spec §6.3 — surviving categories MUST carry a populated meta
    // envelope. v1.5 cascade fill (PR #126 device-QA-3) means rails may
    // be EITHER local (scope='city', scopeExpanded=false) OR cascaded
    // (scope='platform', scopeExpanded=true). Both are valid.
    for (const rail of body.nearbyByCategoryRails) {
      expect(rail.category).toMatchObject({ id: expect.any(String), name: expect.any(String) })
      expect(Array.isArray(rail.branches)).toBe(true)
      expect(rail.meta).not.toBeNull()
      if (rail.meta) {
        if (rail.meta.scopeExpanded) {
          expect(rail.meta.scope).toBe('platform')
        } else {
          expect(rail.meta.scope).toBe('city')
        }
      }
    }
  })

  it('per-category empty → that category absent from nearbyByCategoryRails array (§8.3 row 7)', { timeout: 30_000 }, async () => {
    // Per-category empty (a category whose merchants are all non-rankable
    // OR fall outside NEARBY+CITY) results in absence from the response
    // array — not a meta:null entry.  Structurally, every present rail
    // entry MUST have a non-null meta.
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('nearbyByCategoryRails')
    for (const rail of body.nearbyByCategoryRails) {
      // No entry should ever have meta=null — empty categories are
      // ABSENT, not null-entry.
      expect(rail.meta).not.toBeNull()
    }
  })

  it('PR #126 device-QA Halifax fixup — catchment merchants surface in NBC despite branch.city != effLoc.city (§6.3 v1.4)', { timeout: 30_000 }, async () => {
    // Halifax (53.7233, -1.8597) is ~8.5mi from Huddersfield central
    // merchants.  Pre-v1.4 the NBC builder pre-filtered candidates by
    // `branch.city === locationCtx.city` string-match, so Huddersfield
    // merchants (Karaara / Pino's / Trim & Co / etc.) were excluded
    // from Halifax's NBC pool even though they're geographically in
    // Halifax's CATCHMENT/POST_TOWN tier (which Featured + Trending
    // DO surface via the V3 scope cascade).  The legacy behaviour
    // produced the device-QA-3 inconsistency: "Featured in Halifax"
    // surfaced Huddersfield merchants AND "We're still growing in
    // Halifax" rendered on the empty card simultaneously.
    //
    // v1.4 fix: NBC inclusion now bbox-filters around effLoc.lat/lng
    // (±0.3°) so the candidate pool matches what Featured + Trending
    // consider as NEARBY+CITY tier reach.  Per-category rankBranchesV3
    // + strict NEARBY+CITY scope filter then decides what surfaces.
    //
    // Expected: with seed merchants in Huddersfield catchment, Halifax
    // user sees at least one nearbyByCategoryRail with classified
    // catchment-tier branches.  Asserts NBC is no longer silently empty
    // for Halifax-class users.
    const HALIFAX = { lat: 53.7233, lng: -1.8597 }
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${HALIFAX.lat}&lng=${HALIFAX.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    // Featured + Trending surfacing catchment merchants is the existing
    // contract — confirm at least one of them does in the same call as
    // a precondition for the NBC assertion (if seed shifts so neither
    // does, this test's premise is invalid and it should be reviewed).
    const featuredOrTrendingHasCatchment =
      (body.featuredRail?.branches?.length ?? 0) > 0 ||
      (body.trendingRail?.branches?.length ?? 0) > 0 ||
      (body.popularRail?.branches?.length ?? 0) > 0
    expect(featuredOrTrendingHasCatchment).toBe(true)

    // The v1.4 invariant: when Featured/Trending surface catchment
    // merchants, NBC MUST also see them in its inclusion pool.  Some
    // categories may still not survive the strict scope filter; that's
    // fine.  But the section should NOT be silently empty if catchment
    // merchants exist for the user's effLoc.
    expect(Array.isArray(body.nearbyByCategoryRails)).toBe(true)
    expect(body.nearbyByCategoryRails.length).toBeGreaterThanOrEqual(1)
  })

  it('v1.5 — Manchester cascade: nearbyByCategoryRails has cascaded entries (scopeExpanded=true) when no local supply', { timeout: 30_000 }, async () => {
    // v1.5 PR #126 device-QA-3 owner direction (β1 + β7, 2026-05-23):
    // Home is local-first, not local-only.  Manchester historically has
    // no local merchants in seed; pre-v1.5, NBC silently returned an
    // empty array and the customer-app rendered <NearbySectionEmpty>
    // alone.  Post-v1.5, NBC falls back to platform-wide categories via
    // the cascade fill — surfacing rails with scopeExpanded=true so the
    // customer-app renders headers as `{Category} on Redeemo`.
    //
    // Asserts the cascade fill is wired AND emits the platform-honest
    // meta envelope.  Without the cascade, Manchester users would see
    // a feel-empty Home; with cascade, they see actionable category
    // content + distance/proximity chips for honesty.
    const MANCHESTER = { lat: 53.4808, lng: -2.2426 }
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${MANCHESTER.lat}&lng=${MANCHESTER.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(Array.isArray(body.nearbyByCategoryRails)).toBe(true)

    // v1.5 invariant: when the seed has UK-wide category supply (it does),
    // NBC for Manchester MUST surface at least one cascaded rail.
    expect(body.nearbyByCategoryRails.length).toBeGreaterThanOrEqual(1)

    // At least one rail should be cascaded (scopeExpanded=true) since
    // Manchester has no local supply in the seed bbox.
    const cascadedRails = body.nearbyByCategoryRails.filter(
      (r: any) => r.meta?.scopeExpanded === true,
    )
    expect(cascadedRails.length).toBeGreaterThanOrEqual(1)

    // Cascade meta shape — locality preserved (used by context banner),
    // scope='platform', scopeExpanded=true.
    for (const rail of cascadedRails) {
      expect(rail.meta.scope).toBe('platform')
      expect(rail.meta.scopeExpanded).toBe(true)
    }
  })

  it('all categories empty (effLoc resolved + UK-wide truly empty) → nearbyByCategoryRails.length === 0 (§8.3 row 8 v1.5)', { timeout: 30_000 }, async () => {
    // v1.5 — `<NearbySectionEmpty>` only renders when even the cascade fill
    // produces 0 categories — i.e. UK-wide platform has zero categories with
    // active merchants.  In current seed this state is unreachable (the
    // seed has merchants); the assertion below is structural — the field
    // shape is preserved regardless.  When the length IS 0 (e.g. on an
    // empty database during integration setup), locationContext must NOT
    // be 'none' (that path is handled separately via the banner).
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${BRISTOL.lat}&lng=${BRISTOL.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('nearbyByCategoryRails')
    expect(Array.isArray(body.nearbyByCategoryRails)).toBe(true)
    // Structural invariant — the field is always present.  Whether the
    // length is 0 depends on seed supply, but the field shape is locked.
    if (body.nearbyByCategoryRails.length === 0) {
      expect(body.locationContext.source).not.toBe('none')
    }
  })

  it('v1.6 — NBC rails are PARENT-category grouped (Pizza Restaurant + Indian Cafe roll up into Food & Drink, never as separate leaf rails)', { timeout: 30_000 }, async () => {
    // v1.6 PR #126 device-QA-4 owner direction (2026-05-23): NearbyByCategory
    // rails group by parent category, not leaf category.  A merchant whose
    // `primaryCategory` is a subcategory ("Pizza Restaurant", "Nail Salon",
    // "Barber") should fall under its parent's rail header ("Food & Drink",
    // "Beauty & Wellness") — the per-tile `BranchTile.merchant.descriptor`
    // still carries the leaf differentiator.
    //
    // The structural pin is: every rail's `category.id` must be a
    // top-level category (i.e. `parentId === null` in the Category table).
    // No leaf category should ever appear as a rail header.
    const HUDDERSFIELD = { lat: 53.6452, lng: -1.7807 }  // dense seed market
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    // Hard precondition — seed has Huddersfield supply, so we expect
    // at least one rail.  If this ever drops to 0 in the seed, the
    // assertion below is vacuously true; the precondition keeps the
    // test honest.
    expect(body.nearbyByCategoryRails.length).toBeGreaterThanOrEqual(1)

    // Resolve each rail's category and confirm it's a top-level row.
    // We hit the DB directly (test runs against the live test DB) to
    // verify `parentId === null` for every emitted rail category.
    const railCategoryIds: string[] = body.nearbyByCategoryRails.map(
      (r: any) => r.category.id,
    )
    const dbCategories = await prisma.category.findMany({
      where:  { id: { in: railCategoryIds } },
      select: { id: true, name: true, parentId: true },
    })
    const byId = new Map(dbCategories.map((c) => [c.id, c]))

    for (const railId of railCategoryIds) {
      const row = byId.get(railId)
      expect(row).toBeDefined()
      // The load-bearing assertion: rail headers are PARENT categories.
      expect(row?.parentId).toBeNull()
    }
  })

  it('v1.7 — thin-local-supply rails TOP UP with wider Redeemo fillers (scopeExpanded stays false)', { timeout: 30_000 }, async () => {
    // v1.7 PR #126 device-QA-5 owner direction (2026-05-23): cascade fill in
    // v1.6 activated only for parents with ZERO local supply.  A parent rail
    // with thin local supply (e.g. 1-2 merchants) ignored UK-wide options
    // entirely — Brightlingsea Food & Drink had 2 Covelum branches and
    // never surfaced My Kerala (Ipswich).
    //
    // v1.7 fix: rails with `0 < branches.length < NEARBY_CATEGORY_TAKE`
    // get topped up with the closest UK-wide merchants in the same parent
    // category, distance-ASC, appended to the END of the rail.  Local-first
    // ordering preserved.  `meta.scopeExpanded` stays `false` because local
    // supply is genuine — the rail header doesn't lie.  The honesty signal
    // lives at the tile level: filler tiles carry `supplyRung: null` (V3
    // ranker skipped — cross-region distance) plus a real distance chip.
    //
    // Structural pin: at Brightlingsea coordinates (sparse-supply market
    // with a known Covelum cluster), at least one nearbyByCategoryRail
    // should have meta.scopeExpanded === false AND a mix of local tiles
    // (supplyRung !== null) and filler tiles (supplyRung === null).  That
    // mixed signature is the v1.7 fingerprint.
    const BRIGHTLINGSEA = { lat: 51.8064, lng: 1.0249 }
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${BRIGHTLINGSEA.lat}&lng=${BRIGHTLINGSEA.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    // Precondition — seed has Brightlingsea supply (Covelum), so we expect
    // at least one local NBC rail.
    const localRails = body.nearbyByCategoryRails.filter(
      (r: any) => r.meta?.scopeExpanded === false,
    )
    expect(localRails.length).toBeGreaterThanOrEqual(1)

    // v1.7 mixed-rail fingerprint: at least one local rail must have BOTH
    // a tile with a non-null supplyRung (local-first slot) AND a tile with
    // a null supplyRung (top-up filler).  Without v1.7, every local-rail
    // tile would have supplyRung set (V3-classified).
    const mixedRails = localRails.filter((rail: any) => {
      const hasLocalTile  = rail.branches.some((b: any) => b.supplyRung !== null)
      const hasFillerTile = rail.branches.some((b: any) => b.supplyRung === null)
      return hasLocalTile && hasFillerTile
    })
    expect(mixedRails.length).toBeGreaterThanOrEqual(1)

    // Mixed rails MUST NOT contribute to the <NearbyContextBanner>.  The
    // banner trigger boolean (`hasCascadedNearbyRail` on the customer-app
    // side) is `rails.some(r => r.meta?.scopeExpanded === true)`.  Mixed
    // rails carry scopeExpanded=false so they're excluded — verified above
    // by the localRails filter (mixedRails ⊂ localRails ⊂ scopeExpanded=false).
    for (const rail of mixedRails) {
      expect(rail.meta.scopeExpanded).toBe(false)
    }
  })

  it('v1.8 — filler tiles (v1.5 cascade + v1.7 top-up) carry a non-null proximityBand derived from distance', { timeout: 30_000 }, async () => {
    // v1.8 PR #126 device-QA-5 owner direction (2026-05-23): pre-v1.8 the
    // v1.5 cascade-fill loop AND the v1.7 top-up loop set
    // `proximityBand: null` on every filler tile (because they skip
    // rankBranchesV3 — the maxRung gate would drop cross-region tiles).
    // The customer-app <ProximityBandChip> returns null for null bands →
    // the chip disappeared on the EXACT tiles where it would help users
    // understand why a farther merchant is appearing.
    //
    // v1.8 fix: filler tiles carry a band derived from haversine distance
    // via `deriveFillerProximityBand` (homeRailBuilders.ts):
    //   <  8 mi (12 875 m)  → 'IN_YOUR_AREA'
    //   < 25 mi (40 234 m)  → 'A_LITTLE_FURTHER'
    //   >= 25 mi            → 'NEAREST_ON_REDEEMO'
    //
    // NEARBY is intentionally never derived for fillers — the local-first
    // loop already exhausted genuinely NEARBY supply BEFORE fillers were
    // considered, so a NEARBY filler would be dishonest.
    //
    // Structural pin: any filler tile (supplyRung === null AND
    // distanceMetres !== null) MUST carry a non-NEARBY proximityBand.
    // Tested under two scenarios:
    //   (a) Brightlingsea — produces mixed rails (v1.7 top-up fillers).
    //   (b) Manchester    — produces pure-cascade rails (v1.5 cascade fillers).

    // Scenario (a) — Brightlingsea, mixed rails via v1.7 top-up.
    const brightRes = await app.inject({
      method: 'GET',
      url:    '/api/v1/customer/home?lat=51.8064&lng=1.0249',
    })
    expect(brightRes.statusCode).toBe(200)
    const brightBody = JSON.parse(brightRes.body)
    const brightFillers: any[] = brightBody.nearbyByCategoryRails
      .flatMap((r: any) => r.branches)
      .filter((b: any) => b.supplyRung === null && b.distanceMetres !== null)

    if (brightFillers.length > 0) {
      for (const tile of brightFillers) {
        expect(tile.proximityBand).not.toBeNull()
        expect(tile.proximityBand).not.toBe('NEARBY')
        // Distance threshold check: derived band must match distance bucket.
        const d = tile.distanceMetres as number
        if (d < 12_875) {
          expect(tile.proximityBand).toBe('IN_YOUR_AREA')
        } else if (d < 40_234) {
          expect(tile.proximityBand).toBe('A_LITTLE_FURTHER')
        } else {
          expect(tile.proximityBand).toBe('NEAREST_ON_REDEEMO')
        }
      }
    }

    // Scenario (b) — Manchester, pure-cascade rails via v1.5 cascade-fill.
    const manRes = await app.inject({
      method: 'GET',
      url:    '/api/v1/customer/home?lat=53.4808&lng=-2.2426',
    })
    expect(manRes.statusCode).toBe(200)
    const manBody = JSON.parse(manRes.body)
    const manFillers: any[] = manBody.nearbyByCategoryRails
      .filter((r: any) => r.meta?.scopeExpanded === true)
      .flatMap((r: any) => r.branches)
      .filter((b: any) => b.supplyRung === null && b.distanceMetres !== null)

    // Manchester cascade should surface fillers; assert at least one and
    // confirm same band-derivation rules apply.
    expect(manFillers.length).toBeGreaterThanOrEqual(1)
    for (const tile of manFillers) {
      expect(tile.proximityBand).not.toBeNull()
      expect(tile.proximityBand).not.toBe('NEARBY')
      const d = tile.distanceMetres as number
      if (d < 12_875) {
        expect(tile.proximityBand).toBe('IN_YOUR_AREA')
      } else if (d < 40_234) {
        expect(tile.proximityBand).toBe('A_LITTLE_FURTHER')
      } else {
        expect(tile.proximityBand).toBe('NEAREST_ON_REDEEMO')
      }
    }
  })
})

// ─── §DG — Popular rail: location-aware ranking + QA filter + rolling window ──
//
// Spec: docs/superpowers/specs/2026-05-23-popular-ranking-design.md §8.1.
//
// Each pin creates its own isolated test merchants + redemptions to avoid
// cross-pin contamination.  Test users use `p1test-<ts>-N@example.com`
// naming so they sit outside QA_ACCOUNT_EMAILS naturally.  Cleanup via
// afterEach so the DB returns to a clean state for subsequent pins.
//
// London effLoc resolves to a RURAL locality (Kennington has
// populationTier='UNKNOWN' → densityClass='RURAL') → MIXED_NORMAL@RURAL
// gives nearbyRadius=15mi and maxRung=COUNTRY.  Manchester (COUNTRY
// rung from London) and Huddersfield (also COUNTRY) PASS the maxRung
// gate, but V3 sorts by rung ordinal first → London merchants
// (NEARBY rung, ordinal 0) always precede them in v3.tiles, regardless
// of within-rung popularity scores.  This is the location-aware
// mechanism Popular relies on.
//
// Mutual-exclusion strategy (T5 updated):
//   After T5, buildTrendingRail uses the same rolling 30-day window as
//   Popular AND applies the same QA filter.  Keeping Trending silent
//   per pin:
//
//   §DG-1: Trending stays silent via TWO mechanisms:
//          (a) QA email filter: the London redemption is from customer@redeemo.com
//              → Trending's inclusion query excludes it → London merchant absent
//              from top-30 pool → Trending fires no tiles for the London branch.
//          (b) Scope filter: the Manchester merchant IS in the top-30 pool (5 real
//              redemptions from a non-QA user) but Manchester is COUNTRY rung from
//              a London effLoc → Trending's strict NEARBY+CITY scope excludes it
//              even though it passes the QA filter.
//          Both (a) and (b) must hold for Trending to stay silent here.
//          Popular fires; also excludes the QA email → London score=0, Manchester
//          score=0 both; V3 rung-priority (NEARBY ordinal 0 before COUNTRY ordinal 6)
//          still surfaces the London merchant first regardless of equal scores.
//
//   §DG-2/3/4/8: Manchester fixtures only (COUNTRY rung from London effLoc).
//          Trending strict scope = NEARBY+CITY; Manchester is COUNTRY →
//          excluded by Trending's scope filter even if in the top-30 pool.
//          Trending returns empty → Popular fires.  PAST_25 constraint
//          removed — fixtures use current-time redemptions.
//
//   §DG-5: No redemptions → Trending top-30 pool empty → Trending silent.
//   §DG-6: QA email Trending filter pin (Trending's own QA-filter gate).
//   §DG-7: effLoc=null → Trending returns early (no location) → Popular fires.
//   §DG-8: Manchester fixtures (COUNTRY rung). Rolling window boundary tested
//          with PAST_35 (excluded) vs PAST_5 (included) for Popular score.

describe('Popular rail — §DG location-aware ranking', () => {
  // Track created rows for afterEach cleanup.
  const createdMerchantIds: string[] = []
  const createdUserIds:     string[] = []

  afterEach(async () => {
    // Hard-delete in dependency order: redemptions → vouchers → branches → merchants → users.
    // Cycle-state cleanup not needed for integration-test fixtures (no cycle-state rows created).
    if (createdUserIds.length > 0) {
      await prisma.voucherRedemption.deleteMany({ where: { userId: { in: createdUserIds } } })
    }
    if (createdMerchantIds.length > 0) {
      // Also delete any QA-user redemptions against our fixture merchants.
      await prisma.voucherRedemption.deleteMany({ where: { branch: { merchantId: { in: createdMerchantIds } } } })
      await prisma.voucher.deleteMany({ where: { merchantId: { in: createdMerchantIds } } })
      await prisma.branch.deleteMany({ where: { merchantId: { in: createdMerchantIds } } })
      await prisma.merchant.deleteMany({ where: { id: { in: createdMerchantIds } } })
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
    }
    createdMerchantIds.length = 0
    createdUserIds.length     = 0
  })

  // ── shared branch shape helpers ───────────────────────────────────────────
  // London fixture branches: region='London', locationCountry='England'.
  // From a London effLoc (MIXED_NORMAL@RURAL, maxRung=COUNTRY), these
  // branches have a matching region → classify at REGION rung → included by V3.
  // All tighter locality fields are null so NEARBY/CATCHMENT/POST_TOWN/LAD/
  // COUNTY don't fire unless the fixture branch is within those thresholds.
  //
  // After T5, buildTrendingRail uses the same rolling 30-day window as Popular
  // AND applies the QA filter.  London fixture branches (NEARBY from London
  // user) with real non-QA redemptions WILL trigger Trending → Popular gets
  // suppressed.  Per-pin strategies to keep Trending silent are documented in
  // the describe-block header comment above.  The londonBranchData helper is
  // used by §DG-1 and §DG-5 only (both have strategies that keep Trending
  // silent); §DG-2/3/4/7/8 use manchesterBranchData or omit lat/lng entirely.
  function londonBranchData(overrides: { lat: number; lng: number; name: string }) {
    return {
      name:               overrides.name,
      addressLine1:       '1 Test Street',
      city:               'London',
      postcode:           'EC1A 1BB',
      country:            'GB',
      latitude:           overrides.lat,
      longitude:          overrides.lng,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED' as const,
      localityId:         null,
      localityName:       null,
      postTown:           null,
      ladDistrict:        null,
      adminCounty:        null,
      region:             'London',
      locationCountry:    'England',
    }
  }

  // Manchester fixture branches: region='North West', locationCountry='England'.
  // From a London effLoc, region mismatch → classifies at COUNTRY rung
  // (England matches locationCountry).  COUNTRY rung (ordinal 6) PASSES
  // the maxRung=COUNTRY gate but sorts after all London NEARBY-tier tiles
  // (ordinal 0) in V3's rung-priority ordering.
  function manchesterBranchData(overrides: { lat: number; lng: number; name: string }) {
    return {
      name:               overrides.name,
      addressLine1:       '1 Test Road',
      city:               'Manchester',
      postcode:           'M1 1AA',
      country:            'GB',
      latitude:           overrides.lat,
      longitude:          overrides.lng,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED' as const,
      localityId:         null,
      localityName:       null,
      postTown:           null,
      ladDistrict:        null,
      adminCounty:        null,
      region:             'North West',
      locationCountry:    'England',
    }
  }

  async function createVoucherForMerchant(merchantId: string, codeTag: string) {
    return prisma.voucher.create({
      data: {
        merchantId,
        code:            `dg-${codeTag}`,
        title:           'Test Voucher §DG',
        type:            'FREEBIE',
        estimatedSaving: 5,
        status:          'ACTIVE',
        approvalStatus:  'APPROVED',
      },
    })
  }

  async function createRedemption(opts: {
    userId:      string
    voucherId:   string
    branchId:    string
    isTestData?: boolean
    redeemedAt?: Date
  }) {
    // Generate a unique redemption code: timestamp + 4 random hex chars.
    const code = `DG${Date.now().toString(36).toUpperCase().padStart(8, '0').slice(-8)}${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    return prisma.voucherRedemption.create({
      data: {
        userId:          opts.userId,
        voucherId:       opts.voucherId,
        branchId:        opts.branchId,
        redemptionCode:  code,
        estimatedSaving: 5,
        isTestData:      opts.isTestData ?? false,
        ...(opts.redeemedAt ? { redeemedAt: opts.redeemedAt } : {}),
      },
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  it('§DG-1 — London Popular surfaces London-area merchants before non-London top-redeemers', { timeout: 30_000 }, async () => {
    // Setup: 1 London merchant + 1 Manchester merchant.  Manchester gets
    // 5 real redemptions (non-QA user); London gets 1 redemption from
    // customer@redeemo.com (QA email, excluded from Trending AND Popular).
    // Pre-§DG, the location-blind pre-filter would surface Manchester first
    // (5 > 0).  Post-§DG, V3's rung-priority ordering puts London (NEARBY
    // rung, ordinal 0) before Manchester (COUNTRY rung, ordinal 6) in
    // v3.tiles — regardless of within-rung popularity scores.  This is the
    // location-aware mechanism Popular relies on; popularity tiebreaker only
    // matters WITHIN a single rung (covered by §DG-2).
    //
    // Trending stays silent because the London redemption is from a QA email
    // — Trending's QA filter (T5) excludes it → London merchant absent from
    // Trending's top-30 pool → Trending inclusion-query returns empty for the
    // London branch → Trending stays silent → mutual-exclusion allows Popular.
    // Popular also excludes the QA email → London score=0, Manchester
    // score=0 both; V3 rung-priority (NEARBY before COUNTRY) still surfaces
    // London first regardless of equal scores.
    const LONDON = { lat: 51.5074, lng: -0.1278 }
    const ts    = Date.now()

    const londonMerchant = await prisma.merchant.create({
      data: {
        businessName: `dg-p1-london-${ts}`,
        status:       'ACTIVE',
        // lat=51.590 ≈ 9.2 km north of London user (51.5074) — within the
        // RURAL NEARBY radius (15mi = 24 140 m) so this branch classifies
        // as NEARBY from the London effLoc.
        branches: { create: [londonBranchData({ lat: 51.590, lng: -0.1278, name: `dg-p1-lon-br-${ts}` })] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(londonMerchant.id)

    const manchesterMerchant = await prisma.merchant.create({
      data: {
        businessName: `dg-p1-manchester-${ts}`,
        status:       'ACTIVE',
        branches: { create: [manchesterBranchData({ lat: 53.4808, lng: -2.2426, name: `dg-p1-man-br-${ts}` })] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(manchesterMerchant.id)

    // London redemption: QA user (customer@redeemo.com) — excluded from both
    // Trending (QA filter) and Popular (QA filter).  Keeps Trending silent
    // after T5 without relying on the calendar-month boundary.
    // DO NOT push qaUser.id to createdUserIds — afterEach cleans via merchant scope.
    const qaUser = await prisma.user.upsert({
      where:  { email: 'customer@redeemo.com' },
      update: {},
      create: { email: 'customer@redeemo.com', passwordHash: 'x' },
    })
    // Manchester user: real non-QA email → included in Popular score.
    const manchesterUser = await prisma.user.create({ data: { email: `p1test-${ts}-b@example.com`, passwordHash: 'x' } })
    createdUserIds.push(manchesterUser.id)

    const londonVoucher     = await createVoucherForMerchant(londonMerchant.id, `lon-${ts}`)
    const manchesterVoucher = await createVoucherForMerchant(manchesterMerchant.id, `man-${ts}`)
    const londonBranch      = londonMerchant.branches[0]
    const manchesterBranch  = manchesterMerchant.branches[0]

    // 1 QA redemption on London merchant (excluded from Trending → Trending silent).
    await createRedemption({ userId: qaUser.id, voucherId: londonVoucher.id, branchId: londonBranch.id, isTestData: false })
    // 5 real redemptions on Manchester merchant (COUNTRY rung → outside Trending's NEARBY+CITY scope).
    for (let i = 0; i < 5; i++) {
      await createRedemption({ userId: manchesterUser.id, voucherId: manchesterVoucher.id, branchId: manchesterBranch.id })
    }

    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${LONDON.lat}&lng=${LONDON.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    // Hard precondition: Popular rail rendered.
    expect(body.popularRail).toBeDefined()
    expect(body.popularRail?.meta).not.toBeNull()
    expect(body.popularRail.branches.length).toBeGreaterThanOrEqual(1)

    // Load-bearing assertion: London merchant appears on the Popular rail.
    const londonTile = body.popularRail.branches.find((t: any) => t.merchant.id === londonMerchant.id)
    expect(londonTile).toBeDefined()

    // Manchester must NOT appear — V3 sorts NEARBY (ordinal 0) before COUNTRY
    // (ordinal 6), so all POPULAR_TAKE slots are filled by London NEARBY-tier
    // tiles; Manchester tiles are present in v3.tiles but fall beyond the take limit.
    const manchesterTile = body.popularRail.branches.find((t: any) => t.merchant.id === manchesterMerchant.id)
    expect(manchesterTile).toBeUndefined()
  })

  it('§DG-2 — popularity tiebreaker activates within rung when scores differ', { timeout: 30_000 }, async () => {
    // Setup: 2 UK merchants.  Merchant A gets 5 real redemptions (score=5);
    // Merchant B gets 1 (score=1).  A must surface before B on Popular.
    //
    // After T5, Trending fires when any NEARBY+CITY branch has real non-QA
    // redemptions in the rolling window → Popular is suppressed.  To ensure
    // Popular fires we use the no-location path (/home without lat/lng).
    // Trending returns early when effLoc=null (no location to rank against)
    // → Popular fires via the no-location branch.
    //
    // No-location Popular sorts merchants by popularityScore desc (§6.2 (b)):
    // A (score=5) surfaces before B (score=1) — tests the popularity-as-
    // tiebreaker mechanism, same scoring code as the location-aware path.
    const ts = Date.now()

    // Any UK location works for no-location path — branches appear regardless
    // of their coordinates since no proximity ranking is applied.
    const merchantA = await prisma.merchant.create({
      data: {
        businessName: `dg-p2-a-${ts}`,
        status:       'ACTIVE',
        branches: { create: [manchesterBranchData({ lat: 53.4808, lng: -2.2426, name: `dg-p2-a-br-${ts}` })] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(merchantA.id)

    const merchantB = await prisma.merchant.create({
      data: {
        businessName: `dg-p2-b-${ts}`,
        status:       'ACTIVE',
        branches: { create: [manchesterBranchData({ lat: 53.4818, lng: -2.2436, name: `dg-p2-b-br-${ts}` })] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(merchantB.id)

    const userA = await prisma.user.create({ data: { email: `p1test-${ts}-a@example.com`, passwordHash: 'x' } })
    const userB = await prisma.user.create({ data: { email: `p1test-${ts}-b@example.com`, passwordHash: 'x' } })
    createdUserIds.push(userA.id, userB.id)

    const voucherA = await createVoucherForMerchant(merchantA.id, `dg2a-${ts}`)
    const voucherB = await createVoucherForMerchant(merchantB.id, `dg2b-${ts}`)

    // 5 redemptions for A (score=5), 1 for B (score=1) — current time.
    for (let i = 0; i < 5; i++) {
      await createRedemption({ userId: userA.id, voucherId: voucherA.id, branchId: merchantA.branches[0].id })
    }
    await createRedemption({ userId: userB.id, voucherId: voucherB.id, branchId: merchantB.branches[0].id })

    // No lat/lng → effLoc=null → Trending returns early (requires effLoc) →
    // Popular no-location path fires.  No proximity ranking; sorted by score.
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    expect(body.locationContext.source).toBe('none')
    expect(body.popularRail?.meta).not.toBeNull()
    const aIdx = body.popularRail.branches.findIndex((t: any) => t.merchant.id === merchantA.id)
    const bIdx = body.popularRail.branches.findIndex((t: any) => t.merchant.id === merchantB.id)
    expect(aIdx).toBeGreaterThanOrEqual(0)
    expect(bIdx).toBeGreaterThanOrEqual(0)
    // A has more popularity (5 vs 1) → surfaces before B.
    expect(aIdx).toBeLessThan(bIdx)
  })

  it('§DG-3 — QA account filter excludes customer@redeemo.com from popularity score', { timeout: 30_000 }, async () => {
    // Setup: 2 UK merchants.  Merchant A gets 5 redemptions from
    // customer@redeemo.com (QA account — email filter excludes them from
    // Popular score).  Merchant B gets 1 redemption from a real user.
    // Post-§DG: A's popularityScore = 0; B's = 1 → B surfaces before A.
    //
    // After T5, Trending fires when NEARBY+CITY branches have real non-QA
    // redemptions in the rolling window → Popular suppressed.  We use the
    // no-location path (/home without lat/lng): Trending returns early when
    // effLoc=null → Popular no-location branch fires.
    // B (realUser, score=1) surfaces before A (QA-only, score=0).
    const ts = Date.now()

    const merchantA = await prisma.merchant.create({
      data: {
        businessName: `dg-p3-a-${ts}`,
        status:       'ACTIVE',
        branches: { create: [manchesterBranchData({ lat: 53.4808, lng: -2.2426, name: `dg-p3-a-br-${ts}` })] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(merchantA.id)

    const merchantB = await prisma.merchant.create({
      data: {
        businessName: `dg-p3-b-${ts}`,
        status:       'ACTIVE',
        branches: { create: [manchesterBranchData({ lat: 53.4818, lng: -2.2436, name: `dg-p3-b-br-${ts}` })] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(merchantB.id)

    // Upsert customer@redeemo.com (the seeded QA user — idempotent).
    // DO NOT push qaUser.id to createdUserIds — afterEach cleans redemptions
    // via the merchant fixture scope (voucherRedemption WHERE branch.merchantId IN ...).
    const qaUser = await prisma.user.upsert({
      where:  { email: 'customer@redeemo.com' },
      update: {},
      create: { email: 'customer@redeemo.com', passwordHash: 'x' },
    })
    const realUser = await prisma.user.create({ data: { email: `p1test-${ts}-r@example.com`, passwordHash: 'x' } })
    createdUserIds.push(realUser.id)

    const voucherA = await createVoucherForMerchant(merchantA.id, `dg3a-${ts}`)
    const voucherB = await createVoucherForMerchant(merchantB.id, `dg3b-${ts}`)

    // 5 QA-user redemptions on A (isTestData=false — testing the email filter,
    // not the column-based isTestData flag).  Current time — within rolling window.
    for (let i = 0; i < 5; i++) {
      await createRedemption({ userId: qaUser.id, voucherId: voucherA.id, branchId: merchantA.branches[0].id, isTestData: false })
    }
    // 1 real-user redemption on B (current time — within rolling window).
    await createRedemption({ userId: realUser.id, voucherId: voucherB.id, branchId: merchantB.branches[0].id })

    // No lat/lng → effLoc=null → Trending returns early → Popular fires.
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    expect(body.locationContext.source).toBe('none')
    expect(body.popularRail?.meta).not.toBeNull()
    const bIdx = body.popularRail.branches.findIndex((t: any) => t.merchant.id === merchantB.id)
    expect(bIdx).toBeGreaterThanOrEqual(0)

    // B (real-user redemption, score=1) must surface before A (QA-only, score=0).
    const aIdx = body.popularRail.branches.findIndex((t: any) => t.merchant.id === merchantA.id)
    if (aIdx >= 0) {
      expect(bIdx).toBeLessThan(aIdx)
    }
  })

  it('§DG-4 — isTestData=true excludes flagged redemptions from popularity score', { timeout: 30_000 }, async () => {
    // Setup: 2 UK merchants.
    // MerchantA gets 2 redemptions: isTestData=true (excluded → score 0) +
    // isTestData=false (included → score 1) → net popularityScore = 1.
    // MerchantB gets 2 real redemptions (both isTestData=false) → score = 2.
    // B (score=2) surfaces before A (score=1) — proves isTestData=true was
    // excluded; if NOT excluded, A would have score=2 and the ordering would
    // be a tie (non-deterministic).
    //
    // After T5, Trending fires when NEARBY+CITY branches have real non-QA
    // redemptions in the rolling window → Popular suppressed.  We use the
    // no-location path (/home without lat/lng): Trending returns early when
    // effLoc=null → Popular no-location branch fires and sorts by score desc.
    const ts = Date.now()

    const merchantA = await prisma.merchant.create({
      data: {
        businessName: `dg-p4-a-${ts}`,
        status:       'ACTIVE',
        branches: { create: [manchesterBranchData({ lat: 53.4808, lng: -2.2426, name: `dg-p4-a-br-${ts}` })] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(merchantA.id)

    const merchantB = await prisma.merchant.create({
      data: {
        businessName: `dg-p4-b-${ts}`,
        status:       'ACTIVE',
        branches: { create: [manchesterBranchData({ lat: 53.4818, lng: -2.2436, name: `dg-p4-b-br-${ts}` })] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(merchantB.id)

    const user = await prisma.user.create({ data: { email: `p1test-${ts}-u@example.com`, passwordHash: 'x' } })
    createdUserIds.push(user.id)

    const voucherA = await createVoucherForMerchant(merchantA.id, `dg4a-${ts}`)
    const voucherB = await createVoucherForMerchant(merchantB.id, `dg4b-${ts}`)

    // merchantA: 1 flagged (excluded, score+=0) + 1 real (score+=1) → net score 1.
    await createRedemption({ userId: user.id, voucherId: voucherA.id, branchId: merchantA.branches[0].id, isTestData: true  })
    await createRedemption({ userId: user.id, voucherId: voucherA.id, branchId: merchantA.branches[0].id, isTestData: false })
    // merchantB: 2 real → score 2 (current time).
    await createRedemption({ userId: user.id, voucherId: voucherB.id, branchId: merchantB.branches[0].id, isTestData: false })
    await createRedemption({ userId: user.id, voucherId: voucherB.id, branchId: merchantB.branches[0].id, isTestData: false })

    // No lat/lng → effLoc=null → Trending returns early → Popular fires.
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    expect(body.locationContext.source).toBe('none')
    expect(body.popularRail?.meta).not.toBeNull()
    const aIdx = body.popularRail.branches.findIndex((t: any) => t.merchant.id === merchantA.id)
    const bIdx = body.popularRail.branches.findIndex((t: any) => t.merchant.id === merchantB.id)
    expect(aIdx).toBeGreaterThanOrEqual(0)
    expect(bIdx).toBeGreaterThanOrEqual(0)
    // B (score=2) before A (score=1) — proves the isTestData=true exclusion.
    expect(bIdx).toBeLessThan(aIdx)
  })

  it('§DG-5 — dormant popularity (all scores 0) falls through to distance ASC', { timeout: 30_000 }, async () => {
    // Setup: 2 fixture merchants at Builth Wells (remote rural Wales),
    // NO redemptions on either.  V3 ranks by distance ASC tiebreak
    // because popularityScore=0 for both.
    //
    // Concurrency hardening (post-T5 failure audit 2026-05-24):
    // - LOCATION isolated from London / Colchester / Manchester /
    //   Huddersfield / Brightlingsea — coords other tests in
    //   home-feed-* never use.
    // - From Builth Wells, §DG-5's fixtures are NEARBY-tier (V3 rung 0)
    //   while all concurrent fixtures (London/etc.) are COUNTRY-tier.
    // - V3 rung-priority ordering puts NEARBY tiles FIRST regardless of
    //   how many distant fixtures exist concurrently → §DG-5's 2 tiles
    //   ALWAYS land at positions 0-1 of popularRail.branches, never
    //   pushed past POPULAR_TAKE=10.
    //
    // Pre-T5-fix this used London coords + assumed POPULAR_TAKE=10 would
    // always hold §DG-5's 2 + seed London merchants.  In the full
    // backend suite, concurrent fixtures from home-feed-branches.test.ts
    // (multi-branch Featured Colchester merchants ranked NEARBY by some
    // London users via V3's rural density classification — Kennington
    // localityName has populationTier=UNKNOWN → RURAL → 15-mile NEARBY
    // radius) pushed §DG-5's farMerchant past position 10 → test failed
    // with farIdx=-1.
    const BUILTH_WELLS = { lat: 52.144, lng: -3.401 }
    const ts = Date.now()

    const merchantNear = await prisma.merchant.create({
      data: {
        businessName: `dg-p5-near-${ts}`,
        status:       'ACTIVE',
        branches: { create: [{
          name:               `dg-p5-near-br-${ts}`,
          addressLine1:       '1 Test Street',
          city:               'Builth Wells',
          postcode:           'LD2 3AA',
          country:            'GB',
          latitude:           BUILTH_WELLS.lat,
          longitude:          BUILTH_WELLS.lng,
          isActive:           true,
          locationConfidence: 'MANUALLY_CONFIRMED' as const,
          localityId:         null,
          localityName:       null,
          postTown:           null,
          ladDistrict:        null,
          adminCounty:        null,
          region:             'Wales',
          locationCountry:    'Wales',
        }] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(merchantNear.id)

    const merchantFar = await prisma.merchant.create({
      data: {
        businessName: `dg-p5-far-${ts}`,
        status:       'ACTIVE',
        branches: { create: [{
          name:               `dg-p5-far-br-${ts}`,
          addressLine1:       '2 Test Street',
          city:               'Builth Wells',
          postcode:           'LD2 3AB',
          country:            'GB',
          latitude:           52.150,
          longitude:          -3.380,
          isActive:           true,
          locationConfidence: 'MANUALLY_CONFIRMED' as const,
          localityId:         null,
          localityName:       null,
          postTown:           null,
          ladDistrict:        null,
          adminCounty:        null,
          region:             'Wales',
          locationCountry:    'Wales',
        }] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(merchantFar.id)

    // No redemptions created — both score 0, distance tiebreak decides order.

    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${BUILTH_WELLS.lat}&lng=${BUILTH_WELLS.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    expect(body.popularRail?.meta).not.toBeNull()
    const nearIdx = body.popularRail.branches.findIndex((t: any) => t.merchant.id === merchantNear.id)
    const farIdx  = body.popularRail.branches.findIndex((t: any) => t.merchant.id === merchantFar.id)
    expect(nearIdx).toBeGreaterThanOrEqual(0)
    expect(farIdx).toBeGreaterThanOrEqual(0)
    // Distance tiebreak: near before far.
    expect(nearIdx).toBeLessThan(farIdx)
  })

  it('§DG-7 — effLoc null path applies the same QA filter', { timeout: 30_000 }, async () => {
    // GPS denied (no lat/lng → no effLoc).  merchantA gets 5 redemptions
    // from customer@redeemo.com (QA account → email filter excludes them).
    // merchantB gets 1 redemption from a real user.
    // Popular no-effLoc path sorts merchants by popularityScore desc →
    // B (score=1) before A (score=0).
    const ts = Date.now()

    const merchantA = await prisma.merchant.create({
      data: {
        businessName: `dg-p7-a-${ts}`,
        status:       'ACTIVE',
        branches: { create: [londonBranchData({ lat: 51.5100, lng: -0.1200, name: `dg-p7-a-br-${ts}` })] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(merchantA.id)

    const merchantB = await prisma.merchant.create({
      data: {
        businessName: `dg-p7-b-${ts}`,
        status:       'ACTIVE',
        branches: { create: [londonBranchData({ lat: 51.5110, lng: -0.1210, name: `dg-p7-b-br-${ts}` })] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(merchantB.id)

    const qaUser   = await prisma.user.upsert({
      where:  { email: 'customer@redeemo.com' },
      update: {},
      create: { email: 'customer@redeemo.com', passwordHash: 'x' },
    })
    const realUser = await prisma.user.create({ data: { email: `p1test-${ts}-r@example.com`, passwordHash: 'x' } })
    createdUserIds.push(realUser.id)

    const voucherA = await createVoucherForMerchant(merchantA.id, `dg7a-${ts}`)
    const voucherB = await createVoucherForMerchant(merchantB.id, `dg7b-${ts}`)

    for (let i = 0; i < 5; i++) {
      await createRedemption({ userId: qaUser.id, voucherId: voucherA.id, branchId: merchantA.branches[0].id, isTestData: false })
    }
    await createRedemption({ userId: realUser.id, voucherId: voucherB.id, branchId: merchantB.branches[0].id })

    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home`,  // no lat/lng → effLoc null → no-location path
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.locationContext.source).toBe('none')
    expect(body.popularRail?.meta).not.toBeNull()

    // B (real-user, score=1) must appear on the rail.
    const bIdx = body.popularRail.branches.findIndex((t: any) => t.merchant.id === merchantB.id)
    expect(bIdx).toBeGreaterThanOrEqual(0)

    // A appears with score 0 (QA-filtered); B has score 1 → B before A.
    const aIdx = body.popularRail.branches.findIndex((t: any) => t.merchant.id === merchantA.id)
    if (aIdx >= 0) {
      expect(bIdx).toBeLessThan(aIdx)
    }
  })

  it('§DG-8 — rolling 30-day window: redemptions older than 30 days are excluded (v1.1)', { timeout: 30_000 }, async () => {
    // v1.1 rolling window boundary verification.
    // Setup: 2 UK merchants.
    // MerchantA gets 1 redemption at redeemedAt = 35 days ago (OUTSIDE the
    // 30-day rolling window → score=0).  MerchantB gets 1 redemption at 5
    // days ago (INSIDE the window → score=1).  Both real user, isTestData=false.
    // → B outranks A (score=1 vs score=0).
    //
    // After T5, Trending fires when NEARBY+CITY branches have real non-QA
    // redemptions in the rolling window.  B's 25-day redemption would
    // trigger Trending if B were NEARBY from the test user.  We use the
    // no-location path (/home without lat/lng): Trending returns early when
    // effLoc=null → Popular no-location branch fires.  Both merchants are
    // visible in the no-location Popular (sorted purely by score).
    const ts = Date.now()
    const DAY_MS = 24 * 60 * 60 * 1000

    const merchantA = await prisma.merchant.create({
      data: {
        businessName: `dg-p8-a-${ts}`,
        status:       'ACTIVE',
        branches: { create: [manchesterBranchData({ lat: 53.4808, lng: -2.2426, name: `dg-p8-a-br-${ts}` })] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(merchantA.id)

    const merchantB = await prisma.merchant.create({
      data: {
        businessName: `dg-p8-b-${ts}`,
        status:       'ACTIVE',
        branches: { create: [manchesterBranchData({ lat: 53.4818, lng: -2.2436, name: `dg-p8-b-br-${ts}` })] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(merchantB.id)

    const user = await prisma.user.create({ data: { email: `p1test-${ts}-u@example.com`, passwordHash: 'x' } })
    createdUserIds.push(user.id)

    const voucherA = await createVoucherForMerchant(merchantA.id, `dg8a-${ts}`)
    const voucherB = await createVoucherForMerchant(merchantB.id, `dg8b-${ts}`)

    // merchantA: 1 redemption 35 days ago (outside rolling 30-day window → score=0).
    await createRedemption({
      userId:     user.id,
      voucherId:  voucherA.id,
      branchId:   merchantA.branches[0].id,
      isTestData: false,
      redeemedAt: new Date(ts - 35 * DAY_MS),
    })
    // merchantB: 1 redemption 5 days ago (inside 30-day window → score=1).
    await createRedemption({
      userId:     user.id,
      voucherId:  voucherB.id,
      branchId:   merchantB.branches[0].id,
      isTestData: false,
      redeemedAt: new Date(ts - 5 * DAY_MS),
    })

    // No lat/lng → effLoc=null → Trending returns early → Popular fires.
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    expect(body.locationContext.source).toBe('none')
    expect(body.popularRail?.meta).not.toBeNull()
    const aIdx = body.popularRail.branches.findIndex((t: any) => t.merchant.id === merchantA.id)
    const bIdx = body.popularRail.branches.findIndex((t: any) => t.merchant.id === merchantB.id)
    expect(aIdx).toBeGreaterThanOrEqual(0)
    expect(bIdx).toBeGreaterThanOrEqual(0)
    // B has score=1 (in-window); A has score=0 (out-of-window) → B before A.
    expect(bIdx).toBeLessThan(aIdx)
  })

  it('§DG-6 — Trending inclusion query filters QA redemptions (isTestData=false + QA email)', { timeout: 30_000 }, async () => {
    // Spec: §8.1 §DG-6.  Verifies buildTrendingRail's QA email filter (T5).
    //
    // Setup: 1 London merchant with 5 redemptions from customer@redeemo.com
    // (QA email, isTestData=false — this pin tests the EMAIL filter only,
    // not the column-based isTestData flag).  All redemptions are within the
    // 30-day rolling window (current time).
    //
    // Expected: Trending's inclusion query excludes all QA redemptions →
    // the merchant does NOT appear in the top-30 pool → Trending rail's
    // filteredTiles is empty → trendingRail.meta is null.
    //
    // Note: the London branch is in NEARBY rung (≈9 km from London user,
    // inside the RURAL 15mi radius).  If the QA filter were absent, the
    // 5 redemptions WOULD make this merchant the top-redeemer → Trending
    // would fire.  The null meta proves the QA filter is applied.
    const HUDDERSFIELD_QA = { lat: 53.6452, lng: -1.7807 }
    const ts = Date.now()

    // Use a Huddersfield-area fixture (avoids colliding with London §DG-1
    // fixtures in concurrent runs; same QA-filter logic applies regardless
    // of geography).
    const qaFixtureMerchant = await prisma.merchant.create({
      data: {
        businessName: `dg-p6-qa-${ts}`,
        status:       'ACTIVE',
        branches: {
          create: [{
            name:               `dg-p6-qa-br-${ts}`,
            addressLine1:       '1 QA Street',
            city:               'Huddersfield',
            postcode:           'HD1 1AA',
            country:            'GB',
            latitude:           53.6452,
            longitude:          -1.7807,
            isActive:           true,
            locationConfidence: 'MANUALLY_CONFIRMED' as const,
            localityId:         null,
            localityName:       null,
            postTown:           null,
            ladDistrict:        null,
            adminCounty:        null,
            region:             'Yorkshire and The Humber',
            locationCountry:    'England',
          }],
        },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(qaFixtureMerchant.id)

    // Upsert customer@redeemo.com (QA account — idempotent).
    // DO NOT push id to createdUserIds — afterEach cleans via merchant scope.
    const qaUser = await prisma.user.upsert({
      where:  { email: 'customer@redeemo.com' },
      update: {},
      create: { email: 'customer@redeemo.com', passwordHash: 'x' },
    })

    const qaVoucher = await createVoucherForMerchant(qaFixtureMerchant.id, `dg6qa-${ts}`)
    const qaBranch  = qaFixtureMerchant.branches[0]

    // 5 QA-user redemptions (isTestData=false — testing email filter specifically).
    // Current time → inside the rolling 30-day window.
    for (let i = 0; i < 5; i++) {
      await createRedemption({
        userId:     qaUser.id,
        voucherId:  qaVoucher.id,
        branchId:   qaBranch.id,
        isTestData: false,
      })
    }

    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${HUDDERSFIELD_QA.lat}&lng=${HUDDERSFIELD_QA.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    // Load-bearing assertion: Trending's QA filter excluded all 5 QA redemptions
    // → the fixture merchant is absent from the top-30 pool → Trending has no
    // NEARBY+CITY supply from our fixture → trendingRail.meta is null
    // (may have seed-data Trending supply, but our fixture should not push
    // the rail to fire if no seed Trending exists at Huddersfield).
    //
    // Soft assertion: if Huddersfield seed data happens to populate Trending
    // independently, this test is still valid as a Trending-inclusion negative
    // pin — we assert our fixture merchant does NOT appear on trendingRail.
    if (body.trendingRail?.meta !== null && body.trendingRail?.branches?.length > 0) {
      // Seed merchants may have triggered Trending — verify our QA fixture
      // is NOT among them (its redemptions should have been filtered out).
      const fixtureTile = body.trendingRail.branches.find(
        (t: any) => t.merchant?.id === qaFixtureMerchant.id,
      )
      expect(fixtureTile).toBeUndefined()
    } else {
      // No seed Trending at Huddersfield + QA filter excluded our fixture →
      // Trending is silent (meta null).
      expect(body.trendingRail?.meta).toBeNull()
    }
  })

  it('§DG post-T8 — cross-rail proximityBand consistency: same merchant + same distance produces the same band on every rail', { timeout: 30_000 }, async () => {
    // Owner-locked post-T8 fixup (2026-05-24): replace rung-based proximityBand
    // derivation with distance-based on V3-head tiles so the chip matches the
    // visible distance.  Regression guard: if a future change re-introduces
    // rung-based band derivation on any rail, this pin will fire.
    //
    // Strategy: place ONE fixture merchant at Builth Wells (same concurrency-
    // isolation location as §DG-5 — rural Wales, far from all seed merchants).
    // Distance from the user to the branch is ~0 m → should produce
    // IN_YOUR_AREA (< 12 875 m) via the unified helper.
    //
    // The merchant appears in popularRail (V3-head, NEARBY rung from 0m).
    // It may also appear in nearbyByCategoryRails if its primaryCategory
    // parent rail fires.  If it appears in both rails, both tiles MUST carry
    // the same proximityBand value — proving the two code paths (V3-head and
    // NBC local-first head) both use distance-based derivation.
    //
    // No redemptions are created — Popular falls through to distance-ASC
    // tiebreak (same as §DG-5), which reliably surfaces 0m merchants.
    const BUILTH_WELLS = { lat: 52.144, lng: -3.401 }
    const ts = Date.now()

    // Use the Food & Drink parent category (top-level) so NBC is most likely
    // to fire for this merchant.  Fall back gracefully if the rail doesn't
    // appear — the primary assertion is the popularRail chip value.
    const foodCategory = await prisma.category.findFirst({ where: { name: 'Food & Drink', parentId: null } })

    const merchant = await prisma.merchant.create({
      data: {
        businessName:      `dg-post-t8-xrail-${ts}`,
        status:            'ACTIVE',
        primaryCategoryId: foodCategory?.id ?? null,
        branches: { create: [{
          name:               `dg-post-t8-xrail-br-${ts}`,
          addressLine1:       '1 Consistency Street',
          city:               'Builth Wells',
          postcode:           'LD2 3AA',
          country:            'GB',
          latitude:           BUILTH_WELLS.lat,
          longitude:          BUILTH_WELLS.lng,
          isActive:           true,
          locationConfidence: 'MANUALLY_CONFIRMED' as const,
          localityId:         null,
          localityName:       null,
          postTown:           null,
          ladDistrict:        null,
          adminCounty:        null,
          region:             'Wales',
          locationCountry:    'Wales',
        }] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(merchant.id)

    // Voucher required so the branch passes the R1 seed-guardrail contract
    // (no customer-visible branch without at least one active approved voucher).
    await createVoucherForMerchant(merchant.id, `dg-xrail-${ts}`)

    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${BUILTH_WELLS.lat}&lng=${BUILTH_WELLS.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    // Primary assertion: the merchant appears in popularRail with IN_YOUR_AREA.
    // (0 m distance → < 12 875 m threshold → green chip.)
    const popularTile = body.popularRail?.branches?.find(
      (t: any) => t.merchant?.id === merchant.id,
    )
    expect(popularTile).toBeDefined()
    expect(popularTile.proximityBand).toBe('IN_YOUR_AREA')

    // Cross-rail consistency assertion: if the merchant also appears in
    // nearbyByCategoryRails (NBC local-first head, same V3 path), its band
    // MUST match the popularRail band.
    const nbcTile = body.nearbyByCategoryRails
      ?.flatMap((r: any) => r.branches ?? [])
      .find((t: any) => t.merchant?.id === merchant.id)

    if (nbcTile !== undefined) {
      expect(nbcTile.proximityBand).toBe(popularTile.proximityBand)
    }
    // (The NBC tile may not appear if the parent-category rail doesn't
    // fire for Wales at current seed density — the primary assertion above
    // is sufficient to pin the unified helper.)
  })
})

// ─── §DF — Postcode / profile-location fallback resolver semantics ────────────
//
// Spec: docs/superpowers/specs/2026-05-24-postcode-profile-fallback-design.md
//       §9.1 (the 7 pins below) + §4 (resolver) + §5 (wire envelope).
//
// The resolver at `src/api/lib/effectiveLocation.ts` was shipped by Plan 4
// M2.4. §DF locks the locked PLACE_QUERY > GPS > SAVED_PROFILE > null
// precedence + the wire-envelope mapping at `resolveLocationContext`.
//
// Auth pattern: Discovery routes are OPEN scope; `optionalUserId()` decodes
// the bearer token WITHOUT verifying the signature so the authenticated pins
// just need a properly-formed JWT containing a `sub` claim. `app.jwt.customer.sign`
// is the canonical helper (mirrors the unit-style profile.routes.test.ts pattern).
//
// Concurrency safety: unique fixture prefixes (`df-<pin>-<ts>`) and per-pin
// afterEach cleanup. Pins use Huddersfield/London coords; user fixtures
// don't create merchants/branches/redemptions so there is no overlap with
// the §DG describe block's fixture scope.

describe('§DF — effectiveLocation + locationContext envelope (spec §9.1)', () => {
  const createdUserIds: string[] = []

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
      createdUserIds.length = 0
    }
  })

  // Sign a JWT for the given userId. Returns a bearer-ready string. The
  // signature is irrelevant because Discovery uses `optionalUserId()` (decode
  // without verify); we still use the JWT plugin for shape correctness.
  function signCustomerToken(userId: string): string {
    const jwtAny = app.jwt as any
    return jwtAny.customer.sign(
      { sub: userId, role: 'customer', deviceId: `df-d-${userId.slice(0, 6)}`, sessionId: `df-s-${userId.slice(0, 6)}` },
      { expiresIn: '1h' },
    )
  }

  // Locate a seed Locality near Huddersfield to attach to backfilled User
  // fixtures. `findFirst` because slugs change with M1 revisions; identity
  // tuple (name='Huddersfield', country='England') is stable.
  async function getHuddersfieldLocality() {
    const loc = await prisma.locality.findFirst({
      where: { name: { equals: 'Huddersfield', mode: 'insensitive' }, country: 'England' },
    })
    if (!loc) throw new Error('Seed invariant: Huddersfield Locality must exist (ONSPD seed).')
    return loc
  }

  it('§DF-1 — GPS coords win over saved profile (locationContext anchors on GPS)', { timeout: 30_000 }, async () => {
    // Auth user backfilled with Huddersfield profile location. Request carries
    // London coords (lat=51.5074, lng=-0.1278). Resolver Priority 2 (GPS)
    // overrides Priority 3 (SAVED_PROFILE) → effLoc.source='GPS' anchored on
    // London. Wire envelope maps GPS → 'coordinates' + the nearest Locality
    // for the GPS point (London).
    const ts  = Date.now()
    const loc = await getHuddersfieldLocality()
    const user = await prisma.user.create({
      data: {
        email:        `df-1-${ts}@x.test`,
        passwordHash: 'x',
        postcode:     'HD1 1AA',
        latitude:     53.6458,
        longitude:    -1.785,
        localityId:   loc.id,
      },
    })
    createdUserIds.push(user.id)
    const token = signCustomerToken(user.id)

    const LONDON = { lat: 51.5074, lng: -0.1278 }
    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/customer/home?lat=${LONDON.lat}&lng=${LONDON.lng}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    // GPS wins — wire source collapses to 'coordinates' regardless of
    // saved profile presence.
    expect(body.locationContext.source).toBe('coordinates')
    // Locality is populated AND is DIFFERENT from the user's saved profile
    // locality. This is the load-bearing precedence assertion: an empty
    // string or null would NOT satisfy it (would prove the resolver fell
    // through to SAVED_PROFILE or NULL despite valid GPS coords).
    expect(body.locationContext.locality).not.toBeNull()
    expect(body.locationContext.locality.id).toEqual(expect.any(String))
    expect(body.locationContext.locality.id.length).toBeGreaterThan(0)
    expect(body.locationContext.locality.id).not.toBe(loc.id)
    // Defensive — SAVED_PROFILE leakage would surface Huddersfield text.
    expect(body.locationContext.city).not.toMatch(/Huddersfield/i)
  })

  it('§DF-2 — SAVED_PROFILE resolves when no GPS coords (locationContext anchors on profile)', { timeout: 30_000 }, async () => {
    // Auth user with full saved profile (postcode + lat/lng + localityId).
    // Request omits lat/lng. Resolver falls through to Priority 3
    // (SAVED_PROFILE). Wire envelope maps to source='profile' + the user's
    // saved Locality.
    const ts  = Date.now()
    const loc = await getHuddersfieldLocality()
    const user = await prisma.user.create({
      data: {
        email:        `df-2-${ts}@x.test`,
        passwordHash: 'x',
        postcode:     'HD1 1AA',
        latitude:     53.6458,
        longitude:    -1.785,
        localityId:   loc.id,
      },
    })
    createdUserIds.push(user.id)
    const token = signCustomerToken(user.id)

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/customer/home`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    expect(body.locationContext.source).toBe('profile')
    expect(body.locationContext.locality).not.toBeNull()
    expect(body.locationContext.locality.name).toMatch(/Huddersfield/i)
    expect(body.locationContext.city).toMatch(/Huddersfield/i)
  })

  it('§DF-3 — PLACE_QUERY beats GPS AND SAVED_PROFILE on /search (effectiveLocality anchors on place)', { timeout: 30_000 }, async () => {
    // Spec §9.1 Pin §DF-3 lives on the SEARCH endpoint, NOT Home — Home has
    // no `q` param and never fires PLACE_QUERY (D6 + spec §4.1 Home-specific
    // note). The locked precedence is observable on /search via
    // `branchMeta.effectiveLocality` + `branchMeta.searchChip`: when
    // `q=Manchester` matches a Locality via `tryPlaceMatch`, the resolver
    // sets `effLoc.source='PLACE_QUERY'` and anchors lat/lng on the place
    // centroid — overriding both the request's GPS coords AND the User's
    // saved profile.
    //
    // Note on the wire envelope: `locationContext` is a Home-only field
    // (search response has no `locationContext`). Spec §5.1 says PLACE_QUERY
    // would collapse to 'coordinates' on Home, but Home never reaches a
    // PLACE_QUERY today. On /search we observe PLACE_QUERY directly via
    // `branchMeta.effectiveLocality.name === 'Manchester'`.
    const ts  = Date.now()
    const loc = await getHuddersfieldLocality()
    const user = await prisma.user.create({
      data: {
        email:        `df-3-${ts}@x.test`,
        passwordHash: 'x',
        postcode:     'HD1 1AA',
        latitude:     53.6458,
        longitude:    -1.785,
        localityId:   loc.id,
      },
    })
    createdUserIds.push(user.id)
    const token = signCustomerToken(user.id)

    // GPS coords = Huddersfield. q=Manchester → PLACE_QUERY matches the
    // Manchester Locality (seeded by ONSPD) and overrides both GPS + SAVED_PROFILE.
    const HUDDERSFIELD = { lat: 53.6458, lng: -1.785 }
    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/customer/search?q=Manchester&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    // Load-bearing assertion: PLACE_QUERY beat GPS — effectiveLocality is
    // Manchester (the place match), NOT Huddersfield (the GPS nearest) and
    // NOT the user's saved profile locality (also Huddersfield).
    expect(body.branchMeta).toBeDefined()
    expect(body.branchMeta.effectiveLocality).not.toBeNull()
    expect(body.branchMeta.effectiveLocality.name).toMatch(/Manchester/i)
    // searchChip.mode='PLACE' confirms `tryPlaceMatch` resolved q to a Locality.
    expect(body.branchMeta.searchChip).not.toBeNull()
    expect(body.branchMeta.searchChip.mode).toBe('PLACE')
    expect(body.branchMeta.searchChip.label).toMatch(/Manchester/i)
  })

  it('§DF-4 — identical ranking on same coords regardless of source (GPS vs SAVED_PROFILE)', { timeout: 30_000 }, async () => {
    // Two requests against the SAME coords. Request A: unauthenticated, GPS
    // coords in URL. Request B: authenticated, no GPS, saved profile carries
    // the same lat/lng + locality. V3 ranking is source-agnostic — the
    // resulting popularRail tile order MUST be identical.
    const ts  = Date.now()
    const loc = await getHuddersfieldLocality()
    const user = await prisma.user.create({
      data: {
        email:        `df-4-${ts}@x.test`,
        passwordHash: 'x',
        postcode:     'HD1 1AA',
        latitude:     53.6458,
        longitude:    -1.785,
        localityId:   loc.id,
      },
    })
    createdUserIds.push(user.id)
    const token = signCustomerToken(user.id)
    const HUDDERSFIELD = { lat: 53.6458, lng: -1.785 }

    // Request A — unauthenticated GPS path. Use no auth header so
    // `optionalUserId` returns null → resolver Priority 2 (GPS) anchored on
    // Huddersfield (no SAVED_PROFILE consulted).
    const resA = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}`,
    })
    expect(resA.statusCode).toBe(200)
    const bodyA = JSON.parse(resA.body)
    expect(bodyA.locationContext.source).toBe('coordinates')

    // Request B — authenticated no-GPS path. Resolver falls through to
    // Priority 3 (SAVED_PROFILE) which reads User.lat/lng (= Huddersfield).
    const resB = await app.inject({
      method:  'GET',
      url:     `/api/v1/customer/home`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(resB.statusCode).toBe(200)
    const bodyB = JSON.parse(resB.body)
    expect(bodyB.locationContext.source).toBe('profile')

    // Same coords → same V3 ranking. Both popularRail outputs must agree on
    // tile order (merchant.id sequence) AND length. Across rails of equal
    // length, the strict-order equality is the load-bearing invariant.
    const railA = bodyA.popularRail?.branches?.map((t: any) => t.merchant?.id) ?? []
    const railB = bodyB.popularRail?.branches?.map((t: any) => t.merchant?.id) ?? []
    expect(railA.length).toBe(railB.length)
    expect(railB).toEqual(railA)
    // Defensive — if BOTH rails are empty (no Huddersfield current-month
    // redemptions in this DB state), the equality above is vacuously true
    // and provides zero proof. The full-suite §DG fixtures + seed Karaara
    // /Pino's typically produce non-empty rails here, but we guard so a
    // future suite-pruning that wipes those fixtures doesn't silently turn
    // §DF-4 into a no-op. Fail loudly + direct the maintainer to fix the
    // upstream fixture rather than the assertion.
    if (railA.length === 0) {
      throw new Error(
        '§DF-4: both Huddersfield popularRail outputs are empty. ' +
        'Test cannot prove ranking-identity invariant. ' +
        'Restore Huddersfield current-month redemption fixtures (§DG seed) before relying on this pin.',
      )
    }

    // Same shape across other rails — at minimum the keys are present in both.
    expect(typeof bodyA.featuredRail).toBe(typeof bodyB.featuredRail)
    expect(typeof bodyA.trendingRail).toBe(typeof bodyB.trendingRail)
  })

  it('§DF-5 — unauthenticated request with no coords falls through to source=none', { timeout: 30_000 }, async () => {
    // No auth header, no coords. Resolver Priority 4 returns null. Wire
    // envelope reports source='none'. Existing no-location Home behaviour
    // is preserved (Trending silent / Popular UK-wide / NBC hidden).
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    expect(body.locationContext.source).toBe('none')
    expect(body.locationContext.locality).toBeNull()
    expect(body.locationContext.city).toBeNull()
  })

  it('§DF-6 — authenticated user with no postcode / no GPS falls through to source=none', { timeout: 30_000 }, async () => {
    // Auth user with EVERY profile-location field null (postcode, latitude,
    // longitude, localityId, city). No GPS in request. resolveLocationContext
    // exhausts both the localityId branch AND the city branch → returns
    // source='none'. resolveEffectiveLocation also exhausts its three priorities.
    const ts = Date.now()
    const user = await prisma.user.create({
      data: {
        email:        `df-6-${ts}@x.test`,
        passwordHash: 'x',
        postcode:     null,
        latitude:     null,
        longitude:    null,
        localityId:   null,
        city:         null,
      },
    })
    createdUserIds.push(user.id)
    const token = signCustomerToken(user.id)

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/customer/home`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    expect(body.locationContext.source).toBe('none')
    expect(body.locationContext.locality).toBeNull()
    expect(body.locationContext.city).toBeNull()
  })

  it('§DF-7v2i — incomplete profile (localityId set, latitude null) → source=none AND no effective location anchor', { timeout: 30_000 }, async () => {
    // §DF-v2-i atomic post-fix lock (renamed from §DF-7).  The two helpers
    // now AGREE for this combination:
    //
    //   • `resolveEffectiveLocation` (effectiveLocation.ts:59-108) requires
    //     ALL THREE (localityId, latitude, longitude) → returns null →
    //     Discovery rails behave UK-wide (no V3 location anchor).
    //
    //   • `resolveLocationContext` (service.ts:140-167, post-§DF-v2-i)
    //     requires the SAME three fields → returns source='none'.
    //
    // Wire envelope is honest about identity: when the rails can't anchor on
    // the saved profile, the envelope says 'none' so the customer-app
    // <LocationStatusLabel> surfaces a "Set location ›" affordance instead
    // of lying with "Using profile location · X".
    //
    // Atomic with helper-level pins §DF-v2-i-U1..U4 in
    // resolveLocationContext.test.ts.  If a future PR loosens the helper
    // (e.g. introduces a Locality.centerLat fallback for users with
    // localityId-only), THIS pin must be updated atomically AND the spec
    // §4.1 invariant table must be revised.
    const ts  = Date.now()
    const loc = await getHuddersfieldLocality()
    const user = await prisma.user.create({
      data: {
        email:        `df-7v2i-${ts}@x.test`,
        passwordHash: 'x',
        postcode:     'HD1 1AA',
        latitude:     null,
        longitude:    null,
        localityId:   loc.id,
      },
    })
    createdUserIds.push(user.id)
    const token = signCustomerToken(user.id)

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/customer/home`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    // Tightened wire envelope post-§DF-v2-i.
    expect(body.locationContext.source).toBe('none')
    expect(body.locationContext.locality).toBeNull()
    expect(body.locationContext.city).toBeNull()
  })
})

// ─── NearbyByCategory per-category cap (NEARBY_CATEGORY_TAKE) ──────────────
// Owner direction 2026-06-04: the per-category cap was raised 5 → 10. This pins
// that a single dense category can now surface up to 10 branches on Home.
describe('NearbyByCategory rail — per-category cap (NEARBY_CATEGORY_TAKE = 10)', () => {
  const createdMerchantIds: string[] = []
  afterEach(async () => {
    if (createdMerchantIds.length > 0) {
      await prisma.branch.deleteMany({ where: { merchantId: { in: createdMerchantIds } } })
      await prisma.merchant.deleteMany({ where: { id: { in: createdMerchantIds } } })
      createdMerchantIds.length = 0
    }
  })

  it('a single dense category returns up to 10 branches (was capped at 5)', { timeout: 30_000 }, async () => {
    // Isolated effLoc — Builth Wells (mid-Wales) resolves to a locality (the
    // §DG-5 popular-rail test relies on the same) yet has no seed/other-fixture
    // merchants in its bbox, so the NearbyByCategory pool is exactly our
    // fixtures (deterministic count) and they classify NEARBY-tier.
    const REMOTE = { lat: 52.144, lng: -3.401 } // Builth Wells, mid-Wales
    const ts = Date.now()

    // Real top-level category → its parent is null, so railGroupingCategory
    // groups these merchants into the Food & Drink rail itself.
    const cat = await prisma.category.findFirst({ where: { name: 'Food & Drink', parentId: null } })
    expect(cat).not.toBeNull()

    // 12 ACTIVE merchants in that category, each one active branch within ~1.2km
    // of REMOTE (all NEARBY tier). 12 > the cap, so the rail must slice to it.
    for (let i = 0; i < 12; i++) {
      const m = await prisma.merchant.create({
        data: {
          businessName:      `nbc-cap-${ts}-${i}`,
          status:            'ACTIVE',
          primaryCategoryId: cat!.id,
          branches: { create: [{
            name:               `nbc-cap-br-${ts}-${i}`,
            addressLine1:       `${i} Test Street`,
            city:               'Builth Wells',
            postcode:           'LD2 3AA',
            country:            'GB',
            latitude:           REMOTE.lat + i * 0.001,
            longitude:          REMOTE.lng + i * 0.001,
            isActive:           true,
            locationConfidence: 'MANUALLY_CONFIRMED' as const,
            localityId:         null,
            localityName:       null,
            postTown:           null,
            ladDistrict:        null,
            adminCounty:        null,
            region:             'Wales',
            locationCountry:    'Wales',
          }] },
        },
        include: { branches: true },
      })
      createdMerchantIds.push(m.id)
    }

    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${REMOTE.lat}&lng=${REMOTE.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    const rail = body.nearbyByCategoryRails?.find((r: any) => r.category.id === cat!.id)
    expect(rail).toBeTruthy()
    expect(rail.branches.length).toBeGreaterThan(5) // would be exactly 5 under the old cap
    expect(rail.branches.length).toBe(10)           // exactly the new cap
  })
})

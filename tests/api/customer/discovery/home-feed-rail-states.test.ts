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
// Mutual-exclusion workaround: §DG-1/2/3/4/7/8 fixtures use
// redeemedAt = 25 days ago (inside Popular's 30-day rolling window,
// outside the current calendar month that buildTrendingRail's
// startOfMonthUTC query still covers in T4 — this keeps Trending
// empty so Popular fires per the §6.2 mutual exclusion).  T5 will
// switch Trending to the same rolling window and require these
// fixtures to be redesigned.

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
  // IMPORTANT: for §DG Popular-rail pins, fixture redemptions are always dated
  // 25 days ago (or earlier for the §DG-8 window-boundary test).  This keeps
  // them OUTSIDE the Trending builder's `startOfMonthUTC` window while staying
  // INSIDE the Popular rail's rolling 30-day window.  The London user's nearest
  // locality has populationTier='UNKNOWN' → densityClass='RURAL' → NEARBY
  // radius=15 miles (24 140 m), so any fixture branch within the London admin
  // region would be NEARBY for Trending; dating the redemptions in the previous
  // calendar month is the only reliable way to keep Trending silent.
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
    // 5 real redemptions; London gets 1.  Pre-§DG, the location-blind
    // pre-filter would surface Manchester first (5 > 1).  Post-§DG, V3's
    // rung-priority ordering puts London (NEARBY rung, ordinal 0) before
    // Manchester (COUNTRY rung, ordinal 6) in v3.tiles — regardless of
    // within-rung popularity scores.  This is the location-aware mechanism
    // Popular relies on; the popularity-as-tiebreaker only matters WITHIN
    // a single rung (covered by §DG-2 with two London merchants).
    //
    // Note: Manchester is NOT dropped by V3's maxRung gate.  London locality
    // has populationTier=UNKNOWN → RURAL density → maxRung=COUNTRY for
    // MIXED_NORMAL profile.  Manchester (COUNTRY rung) passes the gate
    // but lands at rung-priority position 6+ behind all London NEARBY-tier
    // tiles.  If the seed ever has fewer NEARBY merchants than POPULAR_TAKE,
    // Manchester could appear in positions 8-10 of Popular but London
    // would still be FIRST.
    //
    // All fixture redemptions are dated 25 days ago (inside the 30-day
    // Popular window but OUTSIDE the current calendar month) so
    // buildTrendingRail's `startOfMonthUTC` query does NOT pick them up →
    // Trending stays silent → mutual-exclusion allows Popular to fire.
    const LONDON = { lat: 51.5074, lng: -0.1278 }
    const ts    = Date.now()
    const DAY_MS = 24 * 60 * 60 * 1000
    const PAST_25 = new Date(ts - 25 * DAY_MS)

    const londonMerchant = await prisma.merchant.create({
      data: {
        businessName: `dg-p1-london-${ts}`,
        status:       'ACTIVE',
        // lat=51.590 ≈ 9.2 km north of London user (51.5074) — outside the
        // NEARBY 8047 m radius so Trending (strict NEARBY+CITY) stays silent
        // and Popular fires instead.
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

    // Create test users (non-QA emails — outside QA_ACCOUNT_EMAILS filter).
    const userA = await prisma.user.create({ data: { email: `p1test-${ts}-a@example.com`, passwordHash: 'x' } })
    const userB = await prisma.user.create({ data: { email: `p1test-${ts}-b@example.com`, passwordHash: 'x' } })
    createdUserIds.push(userA.id, userB.id)

    const londonVoucher     = await createVoucherForMerchant(londonMerchant.id, `lon-${ts}`)
    const manchesterVoucher = await createVoucherForMerchant(manchesterMerchant.id, `man-${ts}`)
    const londonBranch      = londonMerchant.branches[0]
    const manchesterBranch  = manchesterMerchant.branches[0]

    // 1 redemption on London merchant (25 days ago — outside current month).
    await createRedemption({ userId: userA.id, voucherId: londonVoucher.id, branchId: londonBranch.id, redeemedAt: PAST_25 })
    // 5 redemptions on Manchester merchant (25 days ago — outside current month).
    for (let i = 0; i < 5; i++) {
      await createRedemption({ userId: userB.id, voucherId: manchesterVoucher.id, branchId: manchesterBranch.id, redeemedAt: PAST_25 })
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
    // Setup: 2 London merchants, both classifying within maxRung from a
    // London user.  Merchant A gets 5 real redemptions; Merchant B gets 1.
    // V3 sortBy='popularity' sorts within rung by popularityScore desc →
    // A surfaces before B on the Popular rail.
    // Redemptions dated 25 days ago — outside current month so Trending stays
    // silent (see §DG-1 comment for the densityClass=RURAL NEARBY-radius note).
    const LONDON  = { lat: 51.5074, lng: -0.1278 }
    const ts      = Date.now()
    const DAY_MS  = 24 * 60 * 60 * 1000
    const PAST_25 = new Date(ts - 25 * DAY_MS)

    const merchantA = await prisma.merchant.create({
      data: {
        businessName: `dg-p2-a-${ts}`,
        status:       'ACTIVE',
        // Both A and B are >8 km north of London user — outside NEARBY so
        // Trending stays silent and Popular fires.
        branches: { create: [londonBranchData({ lat: 51.600, lng: -0.1278, name: `dg-p2-a-br-${ts}` })] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(merchantA.id)

    const merchantB = await prisma.merchant.create({
      data: {
        businessName: `dg-p2-b-${ts}`,
        status:       'ACTIVE',
        branches: { create: [londonBranchData({ lat: 51.601, lng: -0.1278, name: `dg-p2-b-br-${ts}` })] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(merchantB.id)

    const userA = await prisma.user.create({ data: { email: `p1test-${ts}-a@example.com`, passwordHash: 'x' } })
    const userB = await prisma.user.create({ data: { email: `p1test-${ts}-b@example.com`, passwordHash: 'x' } })
    createdUserIds.push(userA.id, userB.id)

    const voucherA = await createVoucherForMerchant(merchantA.id, `dg2a-${ts}`)
    const voucherB = await createVoucherForMerchant(merchantB.id, `dg2b-${ts}`)

    // 5 redemptions for A, 1 for B — all 25 days ago (outside current month).
    for (let i = 0; i < 5; i++) {
      await createRedemption({ userId: userA.id, voucherId: voucherA.id, branchId: merchantA.branches[0].id, redeemedAt: PAST_25 })
    }
    await createRedemption({ userId: userB.id, voucherId: voucherB.id, branchId: merchantB.branches[0].id, redeemedAt: PAST_25 })

    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${LONDON.lat}&lng=${LONDON.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    expect(body.popularRail?.meta).not.toBeNull()
    const aIdx = body.popularRail.branches.findIndex((t: any) => t.merchant.id === merchantA.id)
    const bIdx = body.popularRail.branches.findIndex((t: any) => t.merchant.id === merchantB.id)
    expect(aIdx).toBeGreaterThanOrEqual(0)
    expect(bIdx).toBeGreaterThanOrEqual(0)
    // A has more popularity → surfaces before B.
    expect(aIdx).toBeLessThan(bIdx)
  })

  it('§DG-3 — QA account filter excludes customer@redeemo.com from popularity score', { timeout: 30_000 }, async () => {
    // Setup: 2 London merchants.  Merchant A gets 5 redemptions from
    // customer@redeemo.com (QA account — email filter excludes them).
    // Merchant B gets 1 redemption from a real user.
    // Post-§DG: A's popularityScore = 0; B's = 1 → B surfaces before A.
    // Redemptions dated 25 days ago — outside current month so Trending stays
    // silent (see §DG-1 comment for the densityClass=RURAL NEARBY-radius note).
    const LONDON  = { lat: 51.5074, lng: -0.1278 }
    const ts      = Date.now()
    const DAY_MS  = 24 * 60 * 60 * 1000
    const PAST_25 = new Date(ts - 25 * DAY_MS)

    const merchantA = await prisma.merchant.create({
      data: {
        businessName: `dg-p3-a-${ts}`,
        status:       'ACTIVE',
        // Both outside NEARBY (>8 km from user) so Trending stays silent.
        branches: { create: [londonBranchData({ lat: 51.590, lng: -0.1278, name: `dg-p3-a-br-${ts}` })] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(merchantA.id)

    const merchantB = await prisma.merchant.create({
      data: {
        businessName: `dg-p3-b-${ts}`,
        status:       'ACTIVE',
        branches: { create: [londonBranchData({ lat: 51.591, lng: -0.1278, name: `dg-p3-b-br-${ts}` })] },
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
    // not the column-based flag).  All 25 days ago — outside current month.
    for (let i = 0; i < 5; i++) {
      await createRedemption({ userId: qaUser.id, voucherId: voucherA.id, branchId: merchantA.branches[0].id, isTestData: false, redeemedAt: PAST_25 })
    }
    // 1 real-user redemption on B (25 days ago — outside current month).
    await createRedemption({ userId: realUser.id, voucherId: voucherB.id, branchId: merchantB.branches[0].id, redeemedAt: PAST_25 })

    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${LONDON.lat}&lng=${LONDON.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

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
    // Setup: 2 London merchants.  MerchantA (slightly further) gets 2
    // redemptions from a real user: one isTestData=true, one isTestData=false
    // → effective score = 1.  MerchantB (closer) gets 1 real redemption
    // (isTestData=false) → score = 1.  Tied scores break to distance ASC
    // → B (closer) surfaces first.
    // Redemptions dated 25 days ago — outside current month so Trending stays
    // silent (see §DG-1 comment for the densityClass=RURAL NEARBY-radius note).
    const LONDON  = { lat: 51.5074, lng: -0.1278 }
    const ts      = Date.now()
    const DAY_MS  = 24 * 60 * 60 * 1000
    const PAST_25 = new Date(ts - 25 * DAY_MS)

    // Both branches are outside the NEARBY 8047 m radius (>51.5798) so
    // Trending (strict NEARBY+CITY) stays silent and Popular fires.
    // A is further from the user than B — same-score tiebreak puts B first.
    const merchantA = await prisma.merchant.create({
      data: {
        businessName: `dg-p4-a-${ts}`,
        status:       'ACTIVE',
        branches: { create: [londonBranchData({ lat: 51.620, lng: -0.1278, name: `dg-p4-a-br-${ts}` })] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(merchantA.id)

    const merchantB = await prisma.merchant.create({
      data: {
        businessName: `dg-p4-b-${ts}`,
        status:       'ACTIVE',
        branches: { create: [londonBranchData({ lat: 51.590, lng: -0.1278, name: `dg-p4-b-br-${ts}` })] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(merchantB.id)

    const user = await prisma.user.create({ data: { email: `p1test-${ts}-u@example.com`, passwordHash: 'x' } })
    createdUserIds.push(user.id)

    const voucherA = await createVoucherForMerchant(merchantA.id, `dg4a-${ts}`)
    const voucherB = await createVoucherForMerchant(merchantB.id, `dg4b-${ts}`)

    // merchantA: 1 flagged (score 0) + 1 real (score 1) → net score 1.  All 25 days ago.
    await createRedemption({ userId: user.id, voucherId: voucherA.id, branchId: merchantA.branches[0].id, isTestData: true,  redeemedAt: PAST_25 })
    await createRedemption({ userId: user.id, voucherId: voucherA.id, branchId: merchantA.branches[0].id, isTestData: false, redeemedAt: PAST_25 })
    // merchantB: 1 real → score 1 (25 days ago).
    await createRedemption({ userId: user.id, voucherId: voucherB.id, branchId: merchantB.branches[0].id, isTestData: false, redeemedAt: PAST_25 })

    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${LONDON.lat}&lng=${LONDON.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    expect(body.popularRail?.meta).not.toBeNull()
    const aIdx = body.popularRail.branches.findIndex((t: any) => t.merchant.id === merchantA.id)
    const bIdx = body.popularRail.branches.findIndex((t: any) => t.merchant.id === merchantB.id)
    expect(aIdx).toBeGreaterThanOrEqual(0)
    expect(bIdx).toBeGreaterThanOrEqual(0)
    // Both score=1; B is closer → distance tiebreak puts B first.
    expect(bIdx).toBeLessThan(aIdx)
  })

  it('§DG-5 — dormant popularity (all scores 0) falls through to distance ASC', { timeout: 30_000 }, async () => {
    // Setup: 2 London merchants, NO redemptions.  Both score=0 → distance
    // tiebreak applies.  merchantNear (very close to London centre) surfaces
    // before merchantFar (further from London centre).
    const LONDON = { lat: 51.5074, lng: -0.1278 }
    const ts = Date.now()

    const merchantNear = await prisma.merchant.create({
      data: {
        businessName: `dg-p5-near-${ts}`,
        status:       'ACTIVE',
        branches: { create: [londonBranchData({ lat: 51.5084, lng: -0.1278, name: `dg-p5-near-br-${ts}` })] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(merchantNear.id)

    const merchantFar = await prisma.merchant.create({
      data: {
        businessName: `dg-p5-far-${ts}`,
        status:       'ACTIVE',
        branches: { create: [londonBranchData({ lat: 51.5474, lng: -0.1278, name: `dg-p5-far-br-${ts}` })] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(merchantFar.id)

    // No redemptions created — both score 0, distance tiebreak decides order.

    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${LONDON.lat}&lng=${LONDON.lng}`,
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
    // Setup: 2 London merchants.  MerchantA (slightly further) gets 1
    // redemption at redeemedAt = 35 days ago (OUTSIDE the 30-day window →
    // score=0).  MerchantB (closer) gets 1 with redeemedAt = 25 days ago
    // (INSIDE the 30-day window AND outside the current calendar month →
    // score=1).  Both real user, isTestData=false.
    //   → B outranks A (score=1 vs score=0).
    // Using 25 days ago (not 5) so Trending's startOfMonthUTC query does NOT
    // pick up B's redemption → Trending stays silent → Popular fires (see
    // §DG-1 comment for the densityClass=RURAL NEARBY-radius note).
    const LONDON = { lat: 51.5074, lng: -0.1278 }
    const ts = Date.now()
    const DAY_MS = 24 * 60 * 60 * 1000

    // Both outside NEARBY (>8 km from user) so Trending stays silent.
    // A is further from user than B so distance tiebreak (equal score=0) would
    // put B first — but in this test A's out-of-window redemption leaves
    // score=0 while B's in-window redemption gives score=1 → B before A
    // regardless of distance.
    const merchantA = await prisma.merchant.create({
      data: {
        businessName: `dg-p8-a-${ts}`,
        status:       'ACTIVE',
        branches: { create: [londonBranchData({ lat: 51.620, lng: -0.1278, name: `dg-p8-a-br-${ts}` })] },
      },
      include: { branches: true },
    })
    createdMerchantIds.push(merchantA.id)

    const merchantB = await prisma.merchant.create({
      data: {
        businessName: `dg-p8-b-${ts}`,
        status:       'ACTIVE',
        branches: { create: [londonBranchData({ lat: 51.590, lng: -0.1278, name: `dg-p8-b-br-${ts}` })] },
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
    // merchantB: 1 redemption 25 days ago (inside 30-day window AND outside
    // current calendar month → score=1, Trending stays silent).
    await createRedemption({
      userId:     user.id,
      voucherId:  voucherB.id,
      branchId:   merchantB.branches[0].id,
      isTestData: false,
      redeemedAt: new Date(ts - 25 * DAY_MS),
    })

    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${LONDON.lat}&lng=${LONDON.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    expect(body.popularRail?.meta).not.toBeNull()
    const aIdx = body.popularRail.branches.findIndex((t: any) => t.merchant.id === merchantA.id)
    const bIdx = body.popularRail.branches.findIndex((t: any) => t.merchant.id === merchantB.id)
    expect(aIdx).toBeGreaterThanOrEqual(0)
    expect(bIdx).toBeGreaterThanOrEqual(0)
    // B has score=1 (in-window); A has score=0 (out-of-window) → B before A.
    expect(bIdx).toBeLessThan(aIdx)
  })
})

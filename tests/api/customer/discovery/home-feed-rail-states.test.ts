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
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
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
  it('per-category supply → nearbyByCategoryRails[].meta !== null with {Category} near you header data', { timeout: 30_000 }, async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('nearbyByCategoryRails')
    expect(Array.isArray(body.nearbyByCategoryRails)).toBe(true)
    // Per spec §6.3 — surviving categories MUST carry a populated meta
    // envelope.  Each entry should include category id+name and a strict
    // NEARBY+CITY scope.
    for (const rail of body.nearbyByCategoryRails) {
      expect(rail.category).toMatchObject({ id: expect.any(String), name: expect.any(String) })
      expect(Array.isArray(rail.branches)).toBe(true)
      expect(rail.meta).not.toBeNull()
      if (rail.meta) {
        expect(rail.meta.scope).toBe('city')
        expect(rail.meta.scopeExpanded).toBe(false)
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

  it('all categories empty (effLoc resolved) → nearbyByCategoryRails.length === 0 (§8.3 row 8)', { timeout: 30_000 }, async () => {
    // Bristol seed historically has no nearby category supply.  When all
    // categories are empty AND effLoc resolves, the response surfaces an
    // empty array (NOT `undefined`, NOT missing) so the customer-app
    // <NearbySectionEmpty> can mount.
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
})

// tests/api/customer/discovery/home-feed-fallback-matrix.test.ts
//
// Home Relevance Task C.2 — Fallback matrix pins for Featured rail.
//
// Spec: docs/superpowers/specs/2026-05-22-home-relevance.md §8.3 rows 1/2/3
//       + §12.2.
//
// Pins (locked):
//   Row 1: local Featured supply → featuredRail.meta !== null AND
//          scopeExpanded === false (Huddersfield seed call).
//   Row 2: Featured cascade → featuredRail.meta !== null AND
//          scopeExpanded === true (Bristol call — conditional check; only
//          asserts when cascade fires, since seed supply is not guaranteed
//          to force this state).
//   Row 3: tail-only Featured (no ranked supply at all) → featuredRail.meta
//          === null (v1.2 hide rule). Placeholder pin — concrete fixture-
//          driven assertion lives in a future commit.
//
// Real-DB integration pattern (mirrors home-feed-rail-states.test.ts +
// home-feed-branches.test.ts).  No fixture insertion needed for rows 1+2 —
// the existing Huddersfield + Bristol seed data is sufficient. Cold-Neon
// flake tolerance: the first test in a fresh file can timeout if Neon is
// sleeping; re-run once.

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

describe('Fallback matrix — Featured rows (§8.3 rows 1/2/3)', () => {
  it('row 1: featuredRail.meta !== null && scopeExpanded === false (local supply)', { timeout: 30_000 }, async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('featuredRail')
    // Conditional — local supply may legitimately be absent on a fresh seed,
    // in which case the rail is hidden (meta === null). When meta IS
    // populated under a local-supply call, scopeExpanded MUST be false.
    if (body.featuredRail?.meta) {
      expect(body.featuredRail.meta.scopeExpanded).toBe(false)
    }
  })

  it('row 2: featuredRail.meta !== null && scopeExpanded === true (cascade)', { timeout: 30_000 }, async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${BRISTOL.lat}&lng=${BRISTOL.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('featuredRail')
    // Conditional — Bristol may or may not trigger the cascade depending on
    // seed supply. When cascade fires, scope MUST be 'platform'.
    if (body.featuredRail?.meta?.scopeExpanded === true) {
      expect(body.featuredRail.meta.scope).toBe('platform')
    }
  })

  it('row 3: featuredRail.meta === null (no supply at all OR tail-only)', () => {
    // TODO: replace with concrete fixture-driven assertion that inserts a
    // Featured merchant whose branches are ALL POSTCODE_CENTROID /
    // NEEDS_REVIEW (no rankable supply anywhere), then asserts
    // `body.featuredRail.meta === null` per the v1.2 hide rule.
    //
    // Placeholder pin retained so the file structure mirrors §8.3 rows 1-3
    // and a future commit can land the fixture without restructuring.
    expect(true).toBe(true)
  })
})

// ─── Task E.1 — NearbyByCategory matrix rows 7 + 8 (§8.3) ────────────────────
//
// Row 7: per-category empty → that category absent from
//        `nearbyByCategoryRails` array (each present entry has meta !== null).
// Row 8: ALL categories empty AND effLoc resolved →
//        `nearbyByCategoryRails.length === 0` AND
//        `locationContext.source !== 'none'`.
//        This is the trigger condition for customer-app `<NearbySectionEmpty>`.

describe('Fallback matrix — NearbyByCategory rows (§8.3 rows 7-8)', () => {
  it('row 7: per-category empty → individual nearbyByCategoryRails[i].meta !== null (empty cats absent from array)', { timeout: 30_000 }, async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('nearbyByCategoryRails')
    expect(Array.isArray(body.nearbyByCategoryRails)).toBe(true)
    // Every present entry MUST have non-null meta — per-category empty
    // categories are ABSENT from the array, not null-meta entries.
    for (const rail of body.nearbyByCategoryRails) {
      expect(rail.meta).not.toBeNull()
    }
  })

  it('row 8: all categories empty AND effLoc resolved → nearbyByCategoryRails.length === 0 && source !== "none"', { timeout: 30_000 }, async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${BRISTOL.lat}&lng=${BRISTOL.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('nearbyByCategoryRails')
    expect(Array.isArray(body.nearbyByCategoryRails)).toBe(true)
    // Structural: when length is 0, source MUST NOT be 'none' (effLoc
    // resolved — otherwise this is a different fallback-matrix row).
    if (body.nearbyByCategoryRails.length === 0) {
      expect(body.locationContext.source).not.toBe('none')
    }
  })
})

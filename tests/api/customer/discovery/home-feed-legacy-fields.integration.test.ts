// tests/api/customer/discovery/home-feed-legacy-fields.test.ts
//
// Home Relevance Task C.4 — Hard-invariant pin: legacy response fields
// MUST remain present on the home feed payload.
//
// Spec: docs/superpowers/plans/2026-05-22-home-relevance.md v1.1 Hard
//       Invariant + Phase G summary at §1953.
//
// Why this pin exists: Phase C.1 sources the legacy
// `featuredBranches` value from the new builder (featuredRail.branches);
// Phase D + E migrate trending and nearbyByCategory similarly.  At every
// step, the legacy WIRE FIELDS stay on the response so the
// customer-web bundle (which has not yet rebaselined to the new
// envelope) continues to render. This pin is the load-bearing guard
// against an accidental future removal of any legacy key.
//
// Pins (locked):
//   1. GPS call (Huddersfield) — every legacy field present + correctly
//      shaped (arrays, locationContext object with city/source).
//   2. No-location call — same legacy fields still present (possibly
//      empty/null but the KEYS must exist).
//
// Real-DB integration pattern (mirrors home-feed-branches.test.ts +
// home-feed-rail-states.test.ts). Cold-Neon flake tolerance: the first
// test in a fresh file can timeout if Neon is sleeping; re-run once.

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

describe('Hard Invariant — legacy response fields preserved (v1.1 plan)', () => {
  it('GPS call: every legacy field is present in the response', { timeout: 30_000 }, async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home?lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    // Branch-themed legacy fields (Phase 1 of the discovery rebaseline,
    // PR #110 §1.5 onward — these are the load-bearing keys the
    // customer-app and customer-web bundles read today).
    expect(body).toHaveProperty('featuredBranches')
    expect(Array.isArray(body.featuredBranches)).toBe(true)

    expect(body).toHaveProperty('trendingBranches')
    expect(Array.isArray(body.trendingBranches)).toBe(true)

    expect(body).toHaveProperty('nearbyByCategoryBranches')
    expect(Array.isArray(body.nearbyByCategoryBranches)).toBe(true)

    // Banner-level + locationContext fields.
    expect(body).toHaveProperty('locationContext')
    expect(body.locationContext).toHaveProperty('city')
    expect(body.locationContext).toHaveProperty('source')

    expect(body).toHaveProperty('campaigns')
    expect(Array.isArray(body.campaigns)).toBe(true)

    // Merchant-themed legacy keys (pre-Phase-1 customer-web shape; still
    // emitted alongside the branch-themed variants per the Phase B.1
    // audit).
    expect(body).toHaveProperty('featured')
    expect(Array.isArray(body.featured)).toBe(true)

    expect(body).toHaveProperty('trending')
    expect(Array.isArray(body.trending)).toBe(true)

    expect(body).toHaveProperty('nearbyByCategory')
    expect(Array.isArray(body.nearbyByCategory)).toBe(true)
  })

  it('no-location call: legacy fields still present (possibly empty / null)', { timeout: 30_000 }, async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/home`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    // Keys MUST exist on every response shape — values may be empty
    // arrays or null fields under the no-location call but the wire
    // shape stays stable for downstream parsers.
    expect(body).toHaveProperty('featuredBranches')
    expect(body).toHaveProperty('trendingBranches')
    expect(body).toHaveProperty('nearbyByCategoryBranches')
    expect(body).toHaveProperty('featured')
    expect(body).toHaveProperty('trending')
    expect(body).toHaveProperty('nearbyByCategory')
    expect(body).toHaveProperty('locationContext')
    expect(body).toHaveProperty('campaigns')
  })
})

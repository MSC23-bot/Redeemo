// tests/api/customer/discovery/home-feed-bb-fix.test.ts
//
// Home Relevance Task D.1 — §BB fix integration pin.
//
// Spec: docs/superpowers/specs/2026-05-22-home-relevance.md §10.3 + §14.1.
// Plan: docs/superpowers/plans/2026-05-22-home-relevance.md Task D.1.
//
// Pin (locked):
//   GPS call (Huddersfield) populates `locationContext.locality` and
//   `locationContext.city` via `findNearestLocality`. Pre-fix behaviour
//   (the legacy `resolveLocationContext`) returned `city = null` and no
//   `locality` at all for GPS callers, so the Trending + NearbyByCategory
//   code paths that consumed `locationCtx.city` were always city-empty.
//   The §BB fix lands atomically with the new `buildTrendingRail` +
//   `buildPopularRail` (Task D.2) so the legacy code paths never see
//   the now-populated `locationCtx.city` interim value.
//
// Real-DB integration pattern (mirrors home-feed-branches.test.ts +
// home-feed-rail-states.test.ts). Cold-Neon flake tolerance: re-run once
// if the first request times out.

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
  it('GPS call populates locationContext.locality + city via findNearestLocality', { timeout: 30_000 }, async () => {
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

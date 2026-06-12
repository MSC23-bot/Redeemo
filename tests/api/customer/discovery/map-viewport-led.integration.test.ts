// tests/api/customer/discovery/map-viewport-led.test.ts
//
// Plan 4 M4.7 — Map `/discovery/in-area` uses VIEWPORT-LED
// EffectiveLocation regression pin.
//
// Backend M3.3 already wired the viewport-centre-derived effLoc for
// `getInAreaBranches` (search service.ts line 3606-3691 — the
// `viewportEffLoc` derivation).  The customer-app `<ViewportLocalityBadge>`
// already consumes `meta.effectiveLocality`.  This test is intentionally
// REGRESSION-only — it pins the behaviour against any future refactor
// that might silently revert to GPS-led derivation.
//
// Per §M4-AMENDMENT-2026-05-22 — pin-only, no code change required.  If
// this test fails on `main`, it's surfacing a real bug, not an M4-driven
// regression.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../../src/api/app'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
  app.decorate('prisma', prisma as any)
  app.decorate('redis', {
    get: async () => null,
    set: async () => 'OK',
    del: async () => 1,
  } as any)
  await app.ready()
}, 60_000)

afterAll(async () => {
  if (app) await app.close()
  await prisma.$disconnect()
})

describe('Plan 4 M4.7 — Map viewport-led EffectiveLocation (M3 regression pin)', () => {
  it('Huddersfield user GPS + London bbox returns London-centric effectiveLocality (NOT Huddersfield)', async () => {
    // User GPS = Huddersfield (53.6458, -1.785).
    // Bbox    = greater London (lat 51.3..51.7, lng -0.3..0.1).
    // Viewport centre = (51.5, -0.1) ≈ central London.
    // Expected: effectiveLocality reflects the BBOX-CENTRE-derived
    // nearest Locality, NOT the user's GPS-derived one.
    const res = await app.inject({
      method: 'GET',
      url:    '/api/v1/customer/discovery/in-area'
            + '?minLat=51.3&maxLat=51.7&minLng=-0.3&maxLng=0.1'
            + '&lat=53.6458&lng=-1.785',
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    const localityName = body.meta?.effectiveLocality?.name?.toLowerCase() ?? ''
    // Negative pin — must NOT be Huddersfield (the user's GPS-derived
    // locality).  If this fails, the in-area route silently regressed
    // to GPS-led derivation.
    expect(localityName).not.toContain('huddersfield')
    // Positive sanity check — effectiveLocality should be SOMETHING.
    // The exact London-area Locality depends on which seed entry lies
    // closest to (51.5, -0.1); we don't assert a specific name to keep
    // this resilient against seed-data evolution.
    expect(localityName.length).toBeGreaterThan(0)
  })
})

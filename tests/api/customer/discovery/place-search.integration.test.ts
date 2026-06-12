// tests/api/customer/discovery/place-search.test.ts
//
// Plan 4 M4.2 — Place detection in Search service.
//
// Pins the new `tryPlaceMatch` step in `searchBranches`:
//   - When the query matches a Locality.name (or postTown), the place
//     becomes the EffectiveLocation — overriding the user's GPS.
//     Branches inside / near that Locality surface even from a far-away
//     GPS, because the place IS the area.
//   - When the query is a merchant name (or anything that doesn't match
//     a Locality), tryPlaceMatch returns null and the existing fuzzy
//     OR + GPS-driven EffectiveLocation behaviour stays unchanged.
//   - The response `meta.searchChip` carries `{ mode: 'PLACE', label }`
//     when a place match wins; `null` otherwise.
//
// Per §M4-AMENDMENT-2026-05-22 A6 the wire shape is minimal:
//   searchChip: { mode: 'PLACE' | 'TAG'; label: string } | null
//
// Real-DB integration pattern; same decoration as
// `routes-additive-shape.test.ts` and `trending-searches.test.ts`.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../../src/api/app'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

// Manchester GPS — deliberately far from Brightlingsea (south-east coast)
// and Huddersfield (West Yorkshire) so the place-match's overriding
// behaviour is visible.
const MANCHESTER = { lat: 53.4808, lng: -2.2426 }

// Huddersfield GPS — used to confirm a NON-place merchant name still
// surfaces via the existing fuzzy / GPS-driven path.
const HUDDERSFIELD = { lat: 53.6458, lng: -1.785 }

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

describe('Plan 4 M4.2 — Place detection in searchBranches', () => {
  it('q=Brightlingsea returns Covelum even from Manchester GPS (place beats GPS)', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=Brightlingsea&lat=${MANCHESTER.lat}&lng=${MANCHESTER.lng}&limit=30`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    // Covelum (Brightlingsea waterfront) surfaces despite the user GPS
    // being in Manchester ~ 230 miles away.
    const businessNames = (body.branches as { merchant: { businessName: string } }[])
      .map(b => b.merchant.businessName.toLowerCase())
    expect(businessNames.some(n => n.includes('covelum'))).toBe(true)

    // EffectiveLocality reflects the matched place, NOT the user's GPS.
    const localityName = body.branchMeta?.effectiveLocality?.name?.toLowerCase() ?? ''
    expect(localityName).toContain('brightlingsea')

    // Wire shape: searchChip carries the matched place.
    expect(body.branchMeta?.searchChip).toEqual({
      mode:  'PLACE',
      label: 'Brightlingsea',
    })
  })

  it('q=Karaara (merchant name) falls through to fuzzy — no place match', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=Karaara&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    // Karaara surfaces via the existing fuzzy match on businessName.
    const businessNames = (body.branches as { merchant: { businessName: string } }[])
      .map(b => b.merchant.businessName.toLowerCase())
    expect(businessNames.some(n => n.includes('karaara'))).toBe(true)

    // EffectiveLocality is GPS-derived (Huddersfield-area), NOT a place
    // match — `Karaara` is not a Locality.
    const localityName = body.branchMeta?.effectiveLocality?.name?.toLowerCase() ?? ''
    expect(localityName).not.toBe('karaara')
    // searchChip MUST be null when no place + no tag match.
    expect(body.branchMeta?.searchChip ?? null).toBeNull()
  })
})

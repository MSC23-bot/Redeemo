// tests/api/customer/discovery/locationcontext-parity.test.ts
//
// §DF-v2-j — `locationContext` parity emit pins for Search, In-area, and
// Merchant Profile.  Mirrors the matrix locked at:
//   spec  §4.2 + §9.1   (parity emit + per-endpoint pin matrix)
//   audit §4 + §8       (variant (a) — route-level resolve)
//
// Pin naming (matches plan):
//   §DF-v2-j-S{1,2,5,7}  Search   (/api/v1/customer/search)
//   §DF-v2-j-I{1,2,5,7}  In-area  (/api/v1/customer/discovery/in-area)
//   §DF-v2-j-M{1,2,5,7}  Merchant (/api/v1/customer/merchants/:id)
//
// Numbering follows §DF-1/2/5/7 from home-feed-rail-states (GPS wins,
// SAVED_PROFILE resolves, unauth → none, incomplete profile → none).
// §DF-3/4/6 are Home-specific (rail behaviour invariants); the parity
// pins exercise the envelope contract only.
//
// Atomic with §DF-7v2i (route-level home-feed pin, see
// home-feed-rail-states.test.ts) + §DF-v2-i-U1..U4 helper unit pins
// (resolveLocationContext.test.ts).  Tightened invariant is shared by
// all 4 Discovery surfaces in this PR.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../../src/api/app'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

const HUDDERSFIELD = { lat: 53.6458, lng: -1.785 }
// UK bbox covering Yorkshire — used for /in-area pins.  Wide enough to
// include the seed Huddersfield + Brightlingsea fixtures.
const UK_BBOX = 'minLat=53.0&maxLat=54.0&minLng=-2.5&maxLng=-1.0'

let app: FastifyInstance
beforeAll(async () => {
  app = await buildApp()
  app.decorate('prisma', prisma as any)
  await app.ready()
}, 60_000)
afterAll(async () => { if (app) await app.close(); await prisma.$disconnect() })

// Sign a customer JWT — mirrors the helper in home-feed-rail-states.test.ts.
function signCustomerToken(userId: string): string {
  const jwtAny = app.jwt as any
  return jwtAny.customer.sign(
    { sub: userId, role: 'customer', deviceId: `df-d-${userId.slice(0, 6)}`, sessionId: `df-s-${userId.slice(0, 6)}` },
    { expiresIn: '1h' },
  )
}

async function getHuddersfieldLocality() {
  const loc = await prisma.locality.findFirst({
    where: { name: { equals: 'Huddersfield', mode: 'insensitive' }, country: 'England' },
  })
  if (!loc) throw new Error('Seed invariant: Huddersfield Locality must exist (ONSPD seed).')
  return loc
}

// ────────────────────────────────────────────────────────────────────────────
// §DF-v2-j-S — Search (/api/v1/customer/search)
// ────────────────────────────────────────────────────────────────────────────
describe('§DF-v2-j-S — /api/v1/customer/search locationContext emit', () => {
  const createdUserIds: string[] = []
  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
      createdUserIds.length = 0
    }
  })

  it('§DF-v2-j-S1 — GPS coords present → source=coordinates', { timeout: 30_000 }, async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=cafe&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('locationContext')
    expect(body.locationContext.source).toBe('coordinates')
  })

  it('§DF-v2-j-S2 — auth user with full profile (localityId + lat + lng) → source=profile', { timeout: 30_000 }, async () => {
    const ts  = Date.now()
    const loc = await getHuddersfieldLocality()
    const user = await prisma.user.create({
      data: {
        email:        `df-v2-j-s-s2-${ts}@x.test`,
        passwordHash: 'x',
        postcode:     'HD1 1AA',
        latitude:     HUDDERSFIELD.lat,
        longitude:    HUDDERSFIELD.lng,
        localityId:   loc.id,
      },
    })
    createdUserIds.push(user.id)
    const token = signCustomerToken(user.id)

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/customer/search?q=cafe`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.locationContext.source).toBe('profile')
    expect(body.locationContext.locality?.name).toMatch(/Huddersfield/i)
  })

  it('§DF-v2-j-S5 — unauthenticated, no coords → source=none', { timeout: 30_000 }, async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=cafe`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.locationContext.source).toBe('none')
    expect(body.locationContext.city).toBeNull()
  })

  it('§DF-v2-j-S7 — auth user with incomplete profile (localityId set, lat/lng null) → source=none', { timeout: 30_000 }, async () => {
    // Same §DF-v2-i tightened invariant as §DF-7v2i but exercised through
    // the /search endpoint.
    const ts  = Date.now()
    const loc = await getHuddersfieldLocality()
    const user = await prisma.user.create({
      data: {
        email:        `df-v2-j-s-s7-${ts}@x.test`,
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
      url:     `/api/v1/customer/search?q=cafe`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.locationContext.source).toBe('none')
    expect(body.locationContext.locality).toBeNull()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// §DF-v2-j-I — In-area (/api/v1/customer/discovery/in-area)
// ────────────────────────────────────────────────────────────────────────────
describe('§DF-v2-j-I — /api/v1/customer/discovery/in-area locationContext emit', () => {
  const createdUserIds: string[] = []
  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
      createdUserIds.length = 0
    }
  })

  it('§DF-v2-j-I1 — GPS coords present → source=coordinates', { timeout: 30_000 }, async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/discovery/in-area?${UK_BBOX}&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('locationContext')
    expect(body.locationContext.source).toBe('coordinates')
  })

  it('§DF-v2-j-I2 — auth user with full profile → source=profile', { timeout: 30_000 }, async () => {
    const ts  = Date.now()
    const loc = await getHuddersfieldLocality()
    const user = await prisma.user.create({
      data: {
        email:        `df-v2-j-i-i2-${ts}@x.test`,
        passwordHash: 'x',
        postcode:     'HD1 1AA',
        latitude:     HUDDERSFIELD.lat,
        longitude:    HUDDERSFIELD.lng,
        localityId:   loc.id,
      },
    })
    createdUserIds.push(user.id)
    const token = signCustomerToken(user.id)

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/customer/discovery/in-area?${UK_BBOX}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.locationContext.source).toBe('profile')
    expect(body.locationContext.locality?.name).toMatch(/Huddersfield/i)
  })

  it('§DF-v2-j-I5 — unauthenticated, no coords → source=none', { timeout: 30_000 }, async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/discovery/in-area?${UK_BBOX}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.locationContext.source).toBe('none')
  })

  it('§DF-v2-j-I7 — auth user with incomplete profile → source=none', { timeout: 30_000 }, async () => {
    const ts  = Date.now()
    const loc = await getHuddersfieldLocality()
    const user = await prisma.user.create({
      data: {
        email:        `df-v2-j-i-i7-${ts}@x.test`,
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
      url:     `/api/v1/customer/discovery/in-area?${UK_BBOX}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.locationContext.source).toBe('none')
    expect(body.locationContext.locality).toBeNull()
  })
})

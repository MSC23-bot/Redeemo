import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// Mock the Google wrapper so the route never touches the network / billing path.
// Each test sets the mock's return value before injecting.
const searchPlacesMock = vi.fn()
vi.mock('../../../src/api/lib/googlePlaces', () => ({
  searchPlaces: (...args: any[]) => searchPlacesMock(...args),
}))

// Mock the limiter so the route's happy-path tests don't depend on Redis-script
// behaviour; the limiter's own atomic semantics are pinned in its unit test +
// the service test. One test overrides this to reject.
const limiterMock = vi.fn().mockResolvedValue(undefined)
vi.mock('../../../src/api/shared/merchantLocationLimiter', async (orig) => {
  const actual = await (orig as any)()
  return { ...actual, consumeMerchantLocationSearch: (...args: any[]) => limiterMock(...args) }
})

const OK_CANDIDATES = {
  ok: true as const,
  candidates: [
    {
      placeId: 'place-1',
      name: 'Karaara',
      formattedAddress: '11 Cross Church Street, Huddersfield HD1 2PY, UK',
      latitude: 53.6458,
      longitude: -1.7847,
      types: ['restaurant'],
      googleMapsUrl: 'https://www.google.com/maps/place/?q=place_id:place-1',
    },
  ],
}

// Membership rows for resolveMerchantContext (getActiveMembership -> findMany).
function membershipRow(role: 'OWNER' | 'BRANCH_MANAGER' | 'STAFF') {
  return {
    id: `mm-${role}`,
    merchantId: 'm1',
    merchantAdminId: 'ma1',
    role,
    status: 'ACTIVE',
    allBranches: role === 'OWNER' || role === 'BRANCH_MANAGER',
    canManageVouchers: false,
    merchant: { status: 'ACTIVE', businessName: 'X' },
    branches: role === 'OWNER' ? [] : [{ branchId: 'b1' }],
  }
}

function decorate(app: FastifyInstance, role: 'OWNER' | 'BRANCH_MANAGER' | 'STAFF') {
  app.decorate('prisma', {
    merchantMembership: {
      findMany: vi.fn().mockResolvedValue([membershipRow(role)]),
    },
  } as any)
  app.decorate('redis', {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    // authenticateMerchant checks the session refresh-token key via exists().
    exists: vi.fn().mockResolvedValue(1),
  } as any)
}

function sign(app: FastifyInstance): string {
  const jwtAny = app.jwt as any
  return jwtAny.merchant.sign({ sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
}

describe('POST /api/v1/merchant/location/search', () => {
  let app: FastifyInstance
  let token: string

  beforeEach(async () => {
    searchPlacesMock.mockReset().mockResolvedValue(OK_CANDIDATES)
    limiterMock.mockReset().mockResolvedValue(undefined)
    app = await buildApp()
    decorate(app, 'OWNER')
    await app.ready()
    token = sign(app)
  })
  afterEach(async () => { await app.close() })

  it('returns candidates for a valid query (mocked searchPlaces ok:true)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/location/search',
      headers: { authorization: `Bearer ${token}` }, payload: { query: 'Karaara Huddersfield' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(Array.isArray(body.candidates)).toBe(true)
    expect(body.candidates).toHaveLength(1)
    expect(body.candidates[0]).toMatchObject({
      name: 'Karaara',
      formattedAddress: '11 Cross Church Street, Huddersfield HD1 2PY, UK',
    })
    expect(typeof body.candidates[0].candidateToken).toBe('string')
    expect(body.candidates[0].candidateToken.length).toBeGreaterThan(0)
    // §4d address-parse autofill present.
    expect(body.candidates[0].addressParts).toMatchObject({
      addressLine1: '11 Cross Church Street',
      city: 'Huddersfield',
      postcode: 'HD1 2PY',
    })
  })

  it('NEVER exposes latitude / longitude / googleMapsUrl / placeId on the wire', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/location/search',
      headers: { authorization: `Bearer ${token}` }, payload: { query: 'Karaara Huddersfield' },
    })
    expect(res.statusCode).toBe(200)
    // String-level scan: the literal coord/url/placeId values must NOT appear.
    expect(res.body).not.toContain('latitude')
    expect(res.body).not.toContain('longitude')
    expect(res.body).not.toContain('googleMapsUrl')
    expect(res.body).not.toContain('placeId')
    expect(res.body).not.toContain('53.6458')
    expect(res.body).not.toContain('-1.7847')
    expect(res.body).not.toContain('maps/place')
    expect(res.body).not.toContain('place-1')
    // Object-shape scan: each candidate carries ONLY the safe keys.
    const body = JSON.parse(res.body)
    for (const c of body.candidates) {
      expect(Object.keys(c).sort()).toEqual(['addressParts', 'candidateToken', 'formattedAddress', 'name'])
      expect(c).not.toHaveProperty('latitude')
      expect(c).not.toHaveProperty('longitude')
      expect(c).not.toHaveProperty('googleMapsUrl')
      expect(c).not.toHaveProperty('placeId')
    }
  })

  it('calls searchPlaces with the merchant_portal usage bucket', async () => {
    await app.inject({
      method: 'POST', url: '/api/v1/merchant/location/search',
      headers: { authorization: `Bearer ${token}` }, payload: { query: 'Karaara Huddersfield' },
    })
    expect(searchPlacesMock).toHaveBeenCalledTimes(1)
    expect(searchPlacesMock).toHaveBeenCalledWith('Karaara Huddersfield', { source: 'merchant_portal' })
  })

  it('OWNER -> 200', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/location/search',
      headers: { authorization: `Bearer ${token}` }, payload: { query: 'Karaara Huddersfield' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('rejects past the cap (limiter throws -> 429 LOCATION_SEARCH_RATE_LIMITED, Google NOT called)', async () => {
    const { AppError } = await import('../../../src/api/shared/errors')
    limiterMock.mockRejectedValueOnce(new AppError('LOCATION_SEARCH_RATE_LIMITED', { retryAfter: 3600 }))
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/location/search',
      headers: { authorization: `Bearer ${token}` }, payload: { query: 'Karaara Huddersfield' },
    })
    expect(res.statusCode).toBe(429)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe('LOCATION_SEARCH_RATE_LIMITED')
    expect(body.error.retryAfter).toBe(3600)
    // The limiter fires BEFORE the billable Google call.
    expect(searchPlacesMock).not.toHaveBeenCalled()
  })

  it('maps searchPlaces NO_RESULTS -> 404 LOCATION_SEARCH_NO_RESULTS (no provider internals)', async () => {
    searchPlacesMock.mockResolvedValueOnce({ ok: false, error: 'NO_RESULTS' })
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/location/search',
      headers: { authorization: `Bearer ${token}` }, payload: { query: 'nothing real here' },
    })
    expect(res.statusCode).toBe(404)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe('LOCATION_SEARCH_NO_RESULTS')
  })

  it.each(['API_KEY_MISSING', 'QUOTA_EXCEEDED', 'GOOGLE_UNAVAILABLE', 'LOCAL_DAILY_CAP_REACHED', 'LOCAL_MONTHLY_CAP_REACHED'])(
    'maps searchPlaces %s -> 503 LOCATION_SEARCH_UNAVAILABLE without leaking internals',
    async (providerError) => {
      searchPlacesMock.mockResolvedValueOnce({ ok: false, error: providerError })
      const res = await app.inject({
        method: 'POST', url: '/api/v1/merchant/location/search',
        headers: { authorization: `Bearer ${token}` }, payload: { query: 'Karaara Huddersfield' },
      })
      expect(res.statusCode).toBe(503)
      const body = JSON.parse(res.body)
      expect(body.error.code).toBe('LOCATION_SEARCH_UNAVAILABLE')
      // The raw provider error string must NOT leak to the client.
      expect(res.body).not.toContain(providerError)
    },
  )

  it('rejects a too-short query at the zod boundary (400)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/location/search',
      headers: { authorization: `Bearer ${token}` }, payload: { query: 'ab' },
    })
    expect(res.statusCode).toBe(400)
    expect(searchPlacesMock).not.toHaveBeenCalled()
  })

  it('returns 401 without a token', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/location/search', payload: { query: 'Karaara Huddersfield' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/v1/merchant/location/search — role gating', () => {
  let app: FastifyInstance

  beforeEach(() => {
    searchPlacesMock.mockReset().mockResolvedValue(OK_CANDIDATES)
    limiterMock.mockReset().mockResolvedValue(undefined)
  })
  afterEach(async () => { await app.close() })

  it('BRANCH_MANAGER -> 200 (search is branch-agnostic)', async () => {
    app = await buildApp()
    decorate(app, 'BRANCH_MANAGER')
    await app.ready()
    const token = sign(app)
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/location/search',
      headers: { authorization: `Bearer ${token}` }, payload: { query: 'Karaara Huddersfield' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('STAFF -> 403 INSUFFICIENT_PERMISSIONS (Google NOT called)', async () => {
    app = await buildApp()
    decorate(app, 'STAFF')
    await app.ready()
    const token = sign(app)
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/location/search',
      headers: { authorization: `Bearer ${token}` }, payload: { query: 'Karaara Huddersfield' },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(searchPlacesMock).not.toHaveBeenCalled()
  })
})

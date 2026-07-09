import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Google wrapper + the limiter so searchMerchantLocations can be driven
// without network/Redis-script dependence.
const searchPlacesMock = vi.fn()
vi.mock('../../../src/api/lib/googlePlaces', () => ({
  searchPlaces: (...args: any[]) => searchPlacesMock(...args),
}))
const limiterMock = vi.fn().mockResolvedValue(undefined)
vi.mock('../../../src/api/shared/merchantLocationLimiter', async (orig) => {
  const actual = await (orig as any)()
  return { ...actual, consumeMerchantLocationSearch: (...args: any[]) => limiterMock(...args) }
})

import {
  parseFormattedAddress,
  resolveLocationCandidate,
  searchMerchantLocations,
} from '../../../src/api/merchant/location/service'

// Minimal stateful fake redis: in-memory Map honouring get/set('EX')/del. The
// candidate stash + resolver only use these three calls.
function fakeRedis() {
  const store = new Map<string, string>()
  return {
    store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => { store.set(k, v); return 'OK' }),
    del: vi.fn(async (k: string) => { const had = store.has(k); store.delete(k); return had ? 1 : 0 }),
  } as any
}

describe('parseFormattedAddress (§4d formattedAddress-parse fallback)', () => {
  it('parses a standard UK address with trailing country', () => {
    expect(parseFormattedAddress('11 Cross Church Street, Huddersfield HD1 2PY, UK')).toEqual({
      addressLine1: '11 Cross Church Street',
      city: 'Huddersfield',
      postcode: 'HD1 2PY',
    })
  })

  it('parses a postcode in its own trailing segment', () => {
    expect(parseFormattedAddress('5 High St, London, SW1A 1AA, United Kingdom')).toEqual({
      addressLine1: '5 High St',
      city: 'London',
      postcode: 'SW1A 1AA',
    })
  })

  it('uppercases the postcode', () => {
    expect(parseFormattedAddress('1 A Road, Leeds ls1 4dy').postcode).toBe('LS1 4DY')
  })

  it('degrades gracefully when no postcode is present', () => {
    const r = parseFormattedAddress('Some Place, Townville')
    expect(r.addressLine1).toBe('Some Place')
    expect(r.city).toBe('Townville')
    expect(r.postcode).toBeNull()
  })

  it('returns all-null for empty / non-string input', () => {
    expect(parseFormattedAddress('')).toEqual({ addressLine1: null, city: null, postcode: null })
    expect(parseFormattedAddress(undefined as any)).toEqual({ addressLine1: null, city: null, postcode: null })
  })
})

describe('resolveLocationCandidate (candidate-token resolver)', () => {
  let redis: ReturnType<typeof fakeRedis>

  beforeEach(() => {
    searchPlacesMock.mockReset().mockResolvedValue({
      ok: true,
      candidates: [
        { placeId: 'p1', name: 'A', formattedAddress: '1 Foo St, Bar BA1 1AA, UK', latitude: 51.1, longitude: -0.1, types: [], googleMapsUrl: 'x' },
      ],
    })
    limiterMock.mockReset().mockResolvedValue(undefined)
    redis = fakeRedis()
  })

  it('returns the server-held coords + placeId for a fresh token (and consumes it)', async () => {
    const candidates = await searchMerchantLocations(redis, { userId: 'u1', merchantId: 'm1', ip: '1.2.3.4' }, 'A search query')
    const token = candidates[0].candidateToken

    const resolved = await resolveLocationCandidate(redis, 'm1', token)
    expect(resolved).toEqual({ placeId: 'p1', latitude: 51.1, longitude: -0.1, postcode: 'BA1 1AA' })

    // Single-use: a second resolve of the same token returns null (already consumed).
    const second = await resolveLocationCandidate(redis, 'm1', token)
    expect(second).toBeNull()
  })

  it('returns null for an unknown / expired token', async () => {
    expect(await resolveLocationCandidate(redis, 'm1', 'no-such-token')).toBeNull()
  })

  it('stashes the candidate postcode and returns it on resolve', async () => {
    // Slice 1: the postcode parsed from the Google formattedAddress at stash time
    // round-trips through Redis so the trust pipeline can cross-check it later.
    searchPlacesMock.mockResolvedValueOnce({
      ok: true,
      candidates: [
        { placeId: 'pg', name: 'Iron Forge Gym', formattedAddress: '3 Mill St, Huddersfield HD1 1AA, UK', latitude: 53.6, longitude: -1.78, types: [], googleMapsUrl: 'x' },
      ],
    })
    const [cand] = await searchMerchantLocations(redis, { userId: 'u1', merchantId: 'm1', ip: null }, 'Iron Forge Gym')
    const resolved = await resolveLocationCandidate(redis, 'm1', cand.candidateToken)
    expect(resolved).toMatchObject({ postcode: 'HD1 1AA' })
  })

  it('is scoped by merchantId — a token minted for m1 does not resolve under m2', async () => {
    const candidates = await searchMerchantLocations(redis, { userId: 'u1', merchantId: 'm1', ip: null }, 'A search query')
    const token = candidates[0].candidateToken
    expect(await resolveLocationCandidate(redis, 'm2', token)).toBeNull()
    // The legitimate merchant still resolves it.
    expect(await resolveLocationCandidate(redis, 'm1', token)).toEqual({ placeId: 'p1', latitude: 51.1, longitude: -0.1, postcode: 'BA1 1AA' })
  })

  it('peek (consume:false) does NOT delete the token', async () => {
    const candidates = await searchMerchantLocations(redis, { userId: 'u1', merchantId: 'm1', ip: null }, 'A search query')
    const token = candidates[0].candidateToken
    expect(await resolveLocationCandidate(redis, 'm1', token, { consume: false })).not.toBeNull()
    // Still resolvable after a peek.
    expect(await resolveLocationCandidate(redis, 'm1', token, { consume: false })).not.toBeNull()
  })

  it('stash NEVER appears with coords on the returned DTO; coords live only in Redis', async () => {
    const candidates = await searchMerchantLocations(redis, { userId: 'u1', merchantId: 'm1', ip: null }, 'A search query')
    expect(candidates[0]).not.toHaveProperty('latitude')
    expect(candidates[0]).not.toHaveProperty('longitude')
    expect(candidates[0]).not.toHaveProperty('placeId')
    // The Redis stash DOES hold the secret (server-side only).
    const token = candidates[0].candidateToken
    const stashed = JSON.parse(redis.store.get(`merchant:m1:loccand:${token}`)!)
    expect(stashed).toEqual({ placeId: 'p1', latitude: 51.1, longitude: -0.1, postcode: 'BA1 1AA' })
  })
})

describe('searchMerchantLocations — provider error mapping', () => {
  let redis: ReturnType<typeof fakeRedis>
  beforeEach(() => {
    limiterMock.mockReset().mockResolvedValue(undefined)
    searchPlacesMock.mockReset()
    redis = fakeRedis()
  })

  it('NO_RESULTS -> LOCATION_SEARCH_NO_RESULTS', async () => {
    searchPlacesMock.mockResolvedValue({ ok: false, error: 'NO_RESULTS' })
    await expect(searchMerchantLocations(redis, { userId: 'u1', merchantId: 'm1' }, 'q query')).rejects.toThrow('LOCATION_SEARCH_NO_RESULTS')
  })

  it.each(['API_KEY_MISSING', 'QUOTA_EXCEEDED', 'GOOGLE_UNAVAILABLE', 'LOCAL_DAILY_CAP_REACHED', 'LOCAL_MONTHLY_CAP_REACHED'])(
    '%s -> LOCATION_SEARCH_UNAVAILABLE',
    async (err) => {
      searchPlacesMock.mockResolvedValue({ ok: false, error: err })
      await expect(searchMerchantLocations(redis, { userId: 'u1', merchantId: 'm1' }, 'q query')).rejects.toThrow('LOCATION_SEARCH_UNAVAILABLE')
    },
  )

  it('limiter is consulted BEFORE Google (rejection short-circuits the search)', async () => {
    const { AppError } = await import('../../../src/api/shared/errors')
    limiterMock.mockRejectedValueOnce(new AppError('LOCATION_SEARCH_RATE_LIMITED', { retryAfter: 60 }))
    await expect(searchMerchantLocations(redis, { userId: 'u1', merchantId: 'm1' }, 'q query')).rejects.toThrow('LOCATION_SEARCH_RATE_LIMITED')
    expect(searchPlacesMock).not.toHaveBeenCalled()
  })
})

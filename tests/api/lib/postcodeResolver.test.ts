// tests/api/lib/postcodeResolver.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolvePostcode } from '../../../src/api/lib/postcodeResolver'

describe('resolvePostcode', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a normalised ResolvedPostcode for a valid UK postcode', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 200,
        result: {
          postcode: 'HD1 2PY',
          country: 'England',
          region: 'Yorkshire and the Humber',
          admin_district: 'Kirklees',
          admin_county: 'West Yorkshire',
          parish: 'Kirklees, unparished area',
          admin_ward: 'Newsome',
          parliamentary_constituency: 'Huddersfield',
          latitude: 53.6463,
          longitude: -1.7809,
        },
      }),
    } as Response)

    const result = await resolvePostcode('HD12PY')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.snapshot.postcode).toBe('HD1 2PY')
      expect(result.snapshot.country).toBe('England')
      expect(result.snapshot.ladDistrict).toBe('Kirklees')
      expect(result.snapshot.region).toBe('Yorkshire and the Humber')
      expect(result.snapshot.latitude).toBe(53.6463)
      expect(result.snapshot.longitude).toBe(-1.7809)
    }
  })

  it('returns ok:false with POSTCODE_NOT_FOUND for an invalid postcode (404)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ status: 404 }),
    } as Response)

    const result = await resolvePostcode('ZZ99 9ZZ')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('POSTCODE_NOT_FOUND')
    }
  })

  it('returns ok:false with GAZETTEER_UNAVAILABLE on network failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'))

    const result = await resolvePostcode('HD1 2PY')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('GAZETTEER_UNAVAILABLE')
    }
  })

  it('returns ok:false with GAZETTEER_UNAVAILABLE when the fetch times out (AbortSignal)', async () => {
    // Simulate the AbortError thrown by AbortSignal.timeout(5000) when the
    // postcodes.io request exceeds 5s. The catch block must map this to
    // GAZETTEER_UNAVAILABLE just like any other network failure.
    const abortError = new Error('The operation was aborted due to timeout')
    abortError.name = 'AbortError'
    vi.spyOn(global, 'fetch').mockRejectedValue(abortError)

    const result = await resolvePostcode('HD1 2PY')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('GAZETTEER_UNAVAILABLE')
    }
  })

  it('passes an AbortSignal with a timeout to fetch', async () => {
    // Defensive pin against future refactors that might drop the timeout.
    // We don't assert the exact ms value (could shift) — just that an
    // AbortSignal IS being supplied.
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ status: 200, result: {
        postcode: 'HD1 2PY', country: 'England', region: null,
        admin_district: 'X', admin_county: null, parish: null,
        admin_ward: null, parliamentary_constituency: null,
        latitude: 0, longitude: 0,
      } }),
    } as Response)

    await resolvePostcode('HD1 2PY')
    expect(fetchSpy).toHaveBeenCalledOnce()
    const opts = fetchSpy.mock.calls[0][1] as RequestInit | undefined
    expect(opts?.signal).toBeInstanceOf(AbortSignal)
  })
})

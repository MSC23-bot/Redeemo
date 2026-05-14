// tests/api/lib/googlePlaces.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchPlaces, bestCandidateConfidence } from '../../../src/api/lib/googlePlaces'

describe('searchPlaces', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.GOOGLE_MAPS_API_KEY = 'test-key'
  })

  it('returns API_KEY_MISSING when the env var is unset', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY
    const result = await searchPlaces('Karaara Huddersfield HD1 2PY')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('API_KEY_MISSING')
  })

  it('returns parsed candidates on a successful Places New API response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        places: [
          {
            id: 'ChIJabc',
            displayName: { text: 'Karaara' },
            formattedAddress: '11 Cross Church St, Huddersfield HD1 2PY',
            location: { latitude: 53.6473, longitude: -1.7812 },
            types: ['restaurant', 'point_of_interest', 'establishment'],
          },
        ],
      }),
    } as Response)

    const result = await searchPlaces('Karaara 11 Cross Church Street, Huddersfield HD1 2PY')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.candidates).toHaveLength(1)
      expect(result.candidates[0].placeId).toBe('ChIJabc')
      expect(result.candidates[0].name).toBe('Karaara')
      expect(result.candidates[0].latitude).toBe(53.6473)
      expect(result.candidates[0].longitude).toBe(-1.7812)
      expect(result.candidates[0].types).toContain('restaurant')
      expect(result.candidates[0].googleMapsUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/place\/\?q=place_id:ChIJabc/)
    }
  })

  it('returns NO_RESULTS when the API returns no places', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ places: [] }),
    } as Response)
    const result = await searchPlaces('nothing real')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('NO_RESULTS')
  })

  it('returns QUOTA_EXCEEDED on 429', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false, status: 429, json: async () => ({}),
    } as Response)
    const result = await searchPlaces('Karaara')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('QUOTA_EXCEEDED')
  })

  it('returns GOOGLE_UNAVAILABLE on network failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network'))
    const result = await searchPlaces('Karaara')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('GOOGLE_UNAVAILABLE')
  })

  it('returns GOOGLE_UNAVAILABLE on AbortError (timeout)', async () => {
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    vi.spyOn(global, 'fetch').mockRejectedValue(abort)
    const result = await searchPlaces('Karaara')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('GOOGLE_UNAVAILABLE')
  })

  it('passes an AbortSignal with a timeout to fetch', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ places: [] }),
    } as Response)
    await searchPlaces('Karaara')
    const opts = fetchSpy.mock.calls[0][1] as RequestInit | undefined
    expect(opts?.signal).toBeInstanceOf(AbortSignal)
  })

  it('uses POST with the small field-mask header AND pageSize: 5', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ places: [] }),
    } as Response)
    await searchPlaces('Karaara')
    const opts = fetchSpy.mock.calls[0][1] as RequestInit | undefined
    expect(opts?.method).toBe('POST')
    const headers = opts?.headers as Record<string, string>
    expect(headers['X-Goog-FieldMask']).toBe('places.id,places.displayName,places.formattedAddress,places.location,places.types')
    // No Place Details fields requested (no hours, photos, phone, website).
    expect(headers['X-Goog-FieldMask']).not.toMatch(/regularOpeningHours|photos|websiteUri|nationalPhoneNumber/)
    // Explicit cap at 5 candidates — Places New default is 20.
    const body = JSON.parse(opts?.body as string)
    expect(body.pageSize).toBe(5)
    expect(body.textQuery).toBe('Karaara')
  })

  it('filters out results missing location.latitude / longitude (never defaults to 0,0)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        places: [
          // First: missing location entirely — MUST be filtered out
          { id: 'no-loc', displayName: { text: 'No location' }, formattedAddress: 'x', types: ['establishment'] },
          // Second: location.latitude only (longitude missing) — MUST be filtered out
          { id: 'half', displayName: { text: 'Half' }, formattedAddress: 'y', location: { latitude: 53.0 }, types: ['establishment'] },
          // Third: valid — should pass through
          { id: 'ok', displayName: { text: 'OK' }, formattedAddress: 'z', location: { latitude: 53.6, longitude: -1.8 }, types: ['establishment'] },
        ],
      }),
    } as Response)
    const result = await searchPlaces('Karaara')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.candidates).toHaveLength(1)
      expect(result.candidates[0].placeId).toBe('ok')
      // CRITICAL: no candidate should ever have lat 0 or lng 0 unless Google
      // legitimately returned those coords (we can't distinguish "missing" from
      // "zero" in JSON, so we filter ALL missing-or-non-numeric coords up front).
      for (const c of result.candidates) {
        expect(typeof c.latitude).toBe('number')
        expect(typeof c.longitude).toBe('number')
        expect(Number.isFinite(c.latitude)).toBe(true)
        expect(Number.isFinite(c.longitude)).toBe(true)
      }
    }
  })

  it('returns NO_RESULTS when ALL candidates are filtered out for missing location', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        places: [
          { id: 'a', displayName: { text: 'A' }, formattedAddress: 'x', types: [] },     // no location
          { id: 'b', displayName: { text: 'B' }, formattedAddress: 'y', location: {} },  // empty location
        ],
      }),
    } as Response)
    const result = await searchPlaces('whatever')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('NO_RESULTS')
  })
})

describe('bestCandidateConfidence', () => {
  const POSTCODE_CENTROID = { lat: 53.6463, lng: -1.7809 }
  const merchantNames = ['Karaara']

  it('returns HIGH for a candidate within 50m + business type + name match', () => {
    const candidate = {
      placeId: 'x', name: 'Karaara', formattedAddress: '...',
      // ~26m from POSTCODE_CENTROID at this latitude:
      //   Δlat = 0.0002° ≈ 22.2m
      //   Δlng = 0.0002° at lat 53.6463 ≈ 13.2m (× cos(53.6463°))
      //   √(22.2² + 13.2²) ≈ 25.8m  — comfortably inside the 50m threshold
      latitude: 53.6465, longitude: -1.7807,
      types: ['restaurant', 'establishment'],
      googleMapsUrl: null,
    }
    expect(bestCandidateConfidence(candidate, POSTCODE_CENTROID, merchantNames)).toBe('HIGH')
  })

  it('returns LOW for a candidate >50m from the postcode centroid', () => {
    const candidate = {
      placeId: 'x', name: 'Karaara', formattedAddress: '...',
      // ~720m from POSTCODE_CENTROID at this latitude:
      //   Δlat = 0.0037° ≈ 411m
      //   Δlng = -0.0091° at lat 53.6463 ≈ 599m (× cos(53.6463°))
      //   √(411² + 599²) ≈ 727m  — well outside the 50m threshold
      latitude: 53.6500, longitude: -1.7900,
      types: ['restaurant'],
      googleMapsUrl: null,
    }
    expect(bestCandidateConfidence(candidate, POSTCODE_CENTROID, merchantNames)).toBe('LOW')
  })

  it('returns LOW when the candidate is only a route/locality, not a business', () => {
    const candidate = {
      placeId: 'x', name: 'Cross Church Street', formattedAddress: '...',
      latitude: 53.6463, longitude: -1.7809,
      types: ['route'],
      googleMapsUrl: null,
    }
    expect(bestCandidateConfidence(candidate, POSTCODE_CENTROID, merchantNames)).toBe('LOW')
  })

  it('returns LOW when no name-token matches the merchant', () => {
    const candidate = {
      placeId: 'x', name: 'Costa Coffee', formattedAddress: '...',
      latitude: 53.6463, longitude: -1.7809,
      types: ['restaurant'],
      googleMapsUrl: null,
    }
    expect(bestCandidateConfidence(candidate, POSTCODE_CENTROID, merchantNames)).toBe('LOW')
  })

  it('ignores trivial tokens (the, and, co, ltd) when matching names', () => {
    const candidate = {
      placeId: 'x', name: 'The Coffee Co Ltd', formattedAddress: '...',
      latitude: 53.6463, longitude: -1.7809,
      types: ['cafe'],
      googleMapsUrl: null,
    }
    expect(bestCandidateConfidence(candidate, POSTCODE_CENTROID, merchantNames)).toBe('LOW')
  })
})

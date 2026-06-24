import { searchLocation, locationCandidateSchema } from '../location'

// Branches PR-6 (Layer 3): the merchant-side location search client. We assert the
// exact HTTP verb/path/body against the Layer 1 backend route
// (POST /api/v1/merchant/location/search) and that the parsed candidate DTO carries
// ONLY the client-safe fields (the never-expose invariant: no lat/lng/placeId).
// apiFetch is mocked.

const apiFetch = jest.fn()
jest.mock('../client', () => {
  const actual = jest.requireActual('../client')
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) }
})

beforeEach(() => {
  apiFetch.mockReset()
})

const CANDIDATE = {
  candidateToken: 'tok_abc123',
  name: 'Old Foundry Kitchen',
  formattedAddress: '12 Mill Lane, Huddersfield, HD1 1AA, UK',
  addressParts: { addressLine1: '12 Mill Lane', city: 'Huddersfield', postcode: 'HD1 1AA' },
}

describe('searchLocation', () => {
  it('POSTs { query } to /api/v1/merchant/location/search with auth and parses candidates', async () => {
    apiFetch.mockResolvedValue({ candidates: [CANDIDATE] })

    const out = await searchLocation('old foundry')

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/location/search', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ query: 'old foundry' }),
    })
    expect(out).toHaveLength(1)
    expect(out[0].candidateToken).toBe('tok_abc123')
    expect(out[0].name).toBe('Old Foundry Kitchen')
    expect(out[0].addressParts.postcode).toBe('HD1 1AA')
  })

  it('returns an empty array when the route returns no candidates', async () => {
    apiFetch.mockResolvedValue({ candidates: [] })
    const out = await searchLocation('nowhere at all')
    expect(out).toEqual([])
  })

  it('tolerates null address parts (a degraded parse)', async () => {
    apiFetch.mockResolvedValue({
      candidates: [
        {
          ...CANDIDATE,
          addressParts: { addressLine1: null, city: null, postcode: null },
        },
      ],
    })
    const out = await searchLocation('some place')
    expect(out[0].addressParts).toEqual({ addressLine1: null, city: null, postcode: null })
  })
})

describe('locationCandidateSchema (the never-expose invariant)', () => {
  it('parses the client-safe DTO and DROPS any leaked coords/placeId', () => {
    // A defensive parse: even if a backend regression leaked coords, the schema does
    // not declare them, so the typed shape never carries lat/lng/placeId. .passthrough()
    // keeps unknown keys off the typed surface (they are not part of LocationCandidate).
    const parsed = locationCandidateSchema.parse({
      ...CANDIDATE,
      latitude: 53.6458,
      longitude: -1.7799,
      placeId: 'ChIJxxxx',
      googleMapsUrl: 'https://maps.google/?cid=1',
    })
    expect(parsed.candidateToken).toBe('tok_abc123')
    // The schema has NO declared coordinate/placeId fields.
    expect(locationCandidateSchema.shape).not.toHaveProperty('latitude')
    expect(locationCandidateSchema.shape).not.toHaveProperty('longitude')
    expect(locationCandidateSchema.shape).not.toHaveProperty('placeId')
    expect(locationCandidateSchema.shape).not.toHaveProperty('googleMapsUrl')
  })
})

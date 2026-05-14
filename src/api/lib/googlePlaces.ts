// src/api/lib/googlePlaces.ts
//
// Plan 4 M2.1 — Typed wrapper around Google Places API (New) Text Search.
//
// Used exclusively by `prisma/suggest-branch-pin.ts` (owner-run CLI). NOT a
// customer-facing API. NEVER call this from any customer code path. See
// docs/superpowers/specs/2026-05-14-merchant-exact-pin-confirmation-design.md
// (§4.2 wrapper signature, §4.4 confidence heuristic) before changing.
//
// Field mask is deliberately the *small* set (id, displayName, formattedAddress,
// location, types) — NO opening hours / photos / phone / website. We are
// confirming a pin, not importing a merchant profile.
import { haversineMetres } from '../shared/haversine'

const PLACES_NEW_TEXTSEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'
const REQUEST_TIMEOUT_MS = 10_000
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.location,places.types'
// Explicit cap. Places API (New) default is 20; we want predictable payload
// size, cost, and latency. 5 candidates is plenty for the owner to skim.
const REQUEST_PAGE_SIZE = 5

const HIGH_CONFIDENCE_RADIUS_METRES = 50
const TRIVIAL_TOKENS = new Set(['the', 'and', 'a', 'an', 'of', 'co', 'ltd', 'llp', 'plc', 'inc', 'limited'])
const BUSINESS_TYPES = new Set([
  'restaurant', 'cafe', 'bar', 'food', 'meal_takeaway', 'meal_delivery',
  'store', 'shopping_mall', 'clothing_store', 'shoe_store', 'book_store',
  'health', 'gym', 'beauty_salon', 'hair_care', 'nail_salon', 'spa',
  'lodging', 'establishment', 'point_of_interest',
  'pet_store', 'veterinary_care',
])

export type GooglePlaceCandidate = {
  placeId: string
  name: string
  formattedAddress: string
  latitude: number
  longitude: number
  types: string[]
  googleMapsUrl: string | null
}

export type SearchPlacesResult =
  | { ok: true; candidates: GooglePlaceCandidate[] }
  | { ok: false; error: 'NO_RESULTS' | 'API_KEY_MISSING' | 'QUOTA_EXCEEDED' | 'GOOGLE_UNAVAILABLE' }

export async function searchPlaces(query: string): Promise<SearchPlacesResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return { ok: false, error: 'API_KEY_MISSING' }

  try {
    const res = await fetch(PLACES_NEW_TEXTSEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query, pageSize: REQUEST_PAGE_SIZE }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (res.status === 429) return { ok: false, error: 'QUOTA_EXCEEDED' }
    if (!res.ok) return { ok: false, error: 'GOOGLE_UNAVAILABLE' }

    const json = await res.json() as {
      places?: Array<{
        id: string
        displayName?: { text: string }
        formattedAddress?: string
        location?: { latitude?: number; longitude?: number }
        types?: string[]
      }>
    }
    const places = json.places ?? []
    if (places.length === 0) return { ok: false, error: 'NO_RESULTS' }

    // CRITICAL: filter out any result without a usable numeric (latitude, longitude).
    // Storing (0,0) as a branch pin is a catastrophic-bug shape — defence in depth
    // at the wrapper boundary means callers can trust every emitted candidate has
    // finite numeric coords. If every result is unusable, treat as NO_RESULTS.
    const candidates: GooglePlaceCandidate[] = places.flatMap((p) => {
      const lat = p.location?.latitude
      const lng = p.location?.longitude
      if (typeof lat !== 'number' || !Number.isFinite(lat)) return []
      if (typeof lng !== 'number' || !Number.isFinite(lng)) return []
      return [{
        placeId: p.id,
        name: p.displayName?.text ?? '',
        formattedAddress: p.formattedAddress ?? '',
        latitude: lat,
        longitude: lng,
        types: p.types ?? [],
        googleMapsUrl: p.id
          ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(p.id)}`
          : null,
      }]
    })
    if (candidates.length === 0) return { ok: false, error: 'NO_RESULTS' }
    return { ok: true, candidates }
  } catch {
    return { ok: false, error: 'GOOGLE_UNAVAILABLE' }
  }
}

export function bestCandidateConfidence(
  candidate: GooglePlaceCandidate,
  postcodeCentroid: { lat: number; lng: number },
  merchantNames: string[],
): 'HIGH' | 'LOW' {
  const dist = haversineMetres(
    postcodeCentroid.lat, postcodeCentroid.lng,
    candidate.latitude, candidate.longitude,
  )
  if (dist > HIGH_CONFIDENCE_RADIUS_METRES) return 'LOW'

  const hasBusinessType = candidate.types.some(t => BUSINESS_TYPES.has(t))
  if (!hasBusinessType) return 'LOW'

  const candidateTokens = tokenize(candidate.name)
  const merchantTokens = new Set(merchantNames.flatMap(tokenize))
  const matches = candidateTokens.some(t => merchantTokens.has(t))
  if (!matches) return 'LOW'

  return 'HIGH'
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !TRIVIAL_TOKENS.has(t))
}

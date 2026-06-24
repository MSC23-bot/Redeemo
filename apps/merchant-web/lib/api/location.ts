import { z } from 'zod'
import { apiFetch } from './client'

// Branches PR-6 (Layer 3): the merchant-side location search client. Calls the
// server-proxied Google Text Search route POST /api/v1/merchant/location/search,
// body { query }. The merchant searches a business name / address, picks a result,
// and the UI autofills the address fields. The precise pin stays admin-confirmed.
//
// SECURITY (the never-expose invariant): the wire DTO carries ONLY an opaque
// candidateToken + the display/address fields. latitude / longitude / googleMapsUrl
// / placeId NEVER cross the wire (the coords stay server-side behind the token).
// This schema deliberately has NO coordinate fields, so a future backend regression
// that leaked coords would be dropped here rather than rendered.

// Best-effort structured address parts the route parses from the single Google
// formattedAddress string (§4d). Any part may be null; the merchant reviews/edits
// the autofilled fields before submitting.
const addressPartsSchema = z.object({
  addressLine1: z.string().nullable(),
  city: z.string().nullable(),
  postcode: z.string().nullable(),
})

// The client-safe candidate DTO. It uses zod's default strip behaviour (NOT
// .passthrough()), so any unknown key on a parsed candidate is dropped: a future
// backend regression that leaked latitude / longitude / placeId would be stripped
// here rather than retained, making the never-expose comment above literally true.
// A genuinely new display key is added by extending this schema explicitly.
export const locationCandidateSchema = z.object({
  candidateToken: z.string(),
  name: z.string(),
  formattedAddress: z.string(),
  addressParts: addressPartsSchema,
})

export type LocationCandidate = z.infer<typeof locationCandidateSchema>
export type LocationAddressParts = z.infer<typeof addressPartsSchema>

// POST /api/v1/merchant/location/search, body { query } (min 3 chars server-side).
// Gated OWNER-or-BRANCH_MANAGER on the backend (STAFF denied). Returns the candidate
// array. The route can fail with LOCATION_SEARCH_NO_RESULTS (no matches) or
// LOCATION_SEARCH_UNAVAILABLE (key/quota/transport collapsed to one client-safe code)
// or LOCATION_SEARCH_RATE_LIMITED (the multi-instance-safe cap); the caller maps
// those to calm UI states without leaking provider internals.
export async function searchLocation(query: string): Promise<LocationCandidate[]> {
  const res = await apiFetch<{ candidates: unknown }>('/api/v1/merchant/location/search', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ query }),
  })
  return z.array(locationCandidateSchema).parse(res.candidates)
}

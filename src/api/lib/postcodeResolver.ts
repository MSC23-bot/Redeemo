// src/api/lib/postcodeResolver.ts
//
// Plan 4 M1.17 — wraps postcodes.io (https://postcodes.io) for UK postcode
// → admin-hierarchy + lat/lng resolution. Used by:
//   - M1.19: GET /postcode/preview endpoint (read-only postcode → snapshot)
//   - M1.20: PC2 (consumer onboarding step 2) resolve-on-write
//   - M1.21: Branch resolve-on-write
//   - M1.18: findOrCreateLocality (auto-create on miss)
//
// Result type uses a discriminated union so callers branch cleanly on success
// vs. POSTCODE_NOT_FOUND vs. GAZETTEER_UNAVAILABLE. The two error variants
// drive distinct user-facing copy + retry behaviour (NOT_FOUND = ask user to
// re-check the postcode; UNAVAILABLE = transient, retry).
//
// postcodes.io semantics:
//   - 200: postcode found, full result block returned.
//   - 404: postcode does not exist (terminated / never issued).
//   - 5xx / network failure: service unavailable.

export type ResolvedPostcodeSnapshot = {
  postcode: string         // canonical form with single space, e.g. "HD1 2PY"
  latitude: number         // postcode centroid (WGS84)
  longitude: number
  country: 'England' | 'Scotland' | 'Wales' | 'Northern Ireland'
  region: string | null
  ladDistrict: string
  adminCounty: string | null
  // Raw admin-hierarchy fields used to find or auto-create a matching Locality
  // at write time (M1.18 findOrCreateLocality). All nullable because postcodes.io
  // doesn't guarantee every postcode has a parish / ward / constituency.
  parish: string | null
  adminWard: string | null
  parliamentaryConstituency: string | null
  postTown: string | null  // postcodes.io may omit; nullable
}

export type ResolvePostcodeResult =
  | { ok: true; snapshot: ResolvedPostcodeSnapshot }
  | { ok: false; error: 'POSTCODE_NOT_FOUND' | 'GAZETTEER_UNAVAILABLE' }

const POSTCODES_IO_BASE = 'https://api.postcodes.io'

// Plan 4 M1 PR #81 review — 5-second AbortSignal timeout. Without it, a slow
// or hanging postcodes.io connection blocks the Fastify request until OS-
// level TCP timeout (~30-120s), which freezes PC2 typing and exhausts our
// connection pool. 5s is generous: real postcodes.io p99 is well under 1s;
// timeouts here almost always indicate a real outage worth degrading on.
// The catch block below already maps any thrown error (including
// AbortError from timeout) to GAZETTEER_UNAVAILABLE.
const POSTCODES_IO_TIMEOUT_MS = 5_000

export async function resolvePostcode(rawPostcode: string): Promise<ResolvePostcodeResult> {
  // Canonical-form normalisation: strip whitespace, uppercase. We rely on
  // postcodes.io to return the canonically-spaced form in its response body
  // (the API tolerates both "HD12PY" and "HD1 2PY" on input).
  const cleaned = rawPostcode.trim().replace(/\s/g, '').toUpperCase()
  if (cleaned.length < 5) return { ok: false, error: 'POSTCODE_NOT_FOUND' }

  try {
    const res = await fetch(`${POSTCODES_IO_BASE}/postcodes/${encodeURIComponent(cleaned)}`, {
      signal: AbortSignal.timeout(POSTCODES_IO_TIMEOUT_MS),
    })
    if (res.status === 404) return { ok: false, error: 'POSTCODE_NOT_FOUND' }
    if (!res.ok) return { ok: false, error: 'GAZETTEER_UNAVAILABLE' }

    const json = await res.json() as {
      status: number
      result?: {
        postcode: string
        country: string
        region: string | null
        admin_district: string
        admin_county: string | null
        parish: string | null
        admin_ward: string | null
        parliamentary_constituency: string | null
        post_town?: string | null
        latitude: number
        longitude: number
      }
    }
    if (json.status !== 200 || !json.result) {
      return { ok: false, error: 'POSTCODE_NOT_FOUND' }
    }

    const r = json.result
    return {
      ok: true,
      snapshot: {
        postcode: r.postcode,
        latitude: r.latitude,
        longitude: r.longitude,
        country: r.country as ResolvedPostcodeSnapshot['country'],
        region: r.region,
        ladDistrict: r.admin_district,
        adminCounty: r.admin_county,
        parish: r.parish,
        adminWard: r.admin_ward,
        parliamentaryConstituency: r.parliamentary_constituency,
        postTown: r.post_town ?? null,
      },
    }
  } catch {
    return { ok: false, error: 'GAZETTEER_UNAVAILABLE' }
  }
}

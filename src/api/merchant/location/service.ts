// src/api/merchant/location/service.ts
//
// Branches PR-6 (§4a / §4b / §4d / §4e) — Layer 1: the merchant-side Google
// location search + candidate-token stash. The merchant searches a business name
// / address, picks a Google Text Search result, and the UI autofills the address
// fields. lat/lng + the placeId NEVER cross the wire in either direction (trust
// spec 2026-07-09 invariant L1: unchanged).
//
// What the pick MAY set (Branch Location Trust Slice 1, spec 2026-07-09,
// supersedes the PR-6 §7 "never a confirmed confidence" rule by owner direction):
//   - CREATE lane: the resolved suggestion feeds the server-side cross-check
//     pipeline (crossCheckGoogleLocation); a PASS auto-trusts the pin as
//     ADDRESS_GEOCODED (customer-visible), a FAIL degrades to POSTCODE_CENTROID
//     coords + a NEEDS_REVIEW stamp.
//   - REVIEWED-EDIT lane: still admin-review metadata only, until Slice 1b.
//   - MANUALLY_CONFIRMED remains writable ONLY by the admin's
//     confirmBranchLocation (the only human-confirm path).
//
// The candidate-token flow keeps the coords server-side:
//   - On search, each Google candidate's { placeId, latitude, longitude } is
//     stashed in Redis keyed by `merchant:<merchantId>:loccand:<token>` (15-min
//     TTL) and ONLY a client-safe DTO ({ candidateToken, name, formattedAddress,
//     addressParts }) is returned.
//   - At the apply step (Layer 2), the client submits the chosen candidateToken
//     (NOT lat/lng, NOT placeId); the backend resolves it via the Redis lookup —
//     NEVER a fresh billable Google call. Expired -> null -> the merchant
//     re-searches.

import type Redis from 'ioredis'
import { AppError } from '../../shared/errors'
import { RedisKey } from '../../shared/redis-keys'
import { generateSecureToken } from '../../shared/tokens'
import { consumeMerchantLocationSearch } from '../../shared/merchantLocationLimiter'
import { searchPlaces } from '../../lib/googlePlaces'

const CANDIDATE_TTL_SECONDS = 15 * 60 // 15 minutes (§4a)

// Best-effort UK-postcode regex for the trailing token of a formattedAddress.
// Standard UK outward+inward shape (e.g. "HD1 1AA", "SW1A 1AA", "M1 1AE").
// Anchored + case-insensitive; the merchant always reviews/edits the parse.
const UK_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i

/**
 * The CLIENT-SAFE candidate DTO. It MUST NOT carry latitude / longitude /
 * googleMapsUrl / placeId — those stay server-side (the candidate-token stash).
 */
export interface MerchantLocationCandidate {
  /** Server-issued opaque token. The client holds this; coords stay server-side. */
  candidateToken: string
  name: string
  formattedAddress: string
  /** Best-effort structured address parts parsed from formattedAddress (§4d). */
  addressParts: {
    addressLine1: string | null
    city: string | null
    postcode: string | null
  }
}

/** The server-held secret behind a candidate token (NEVER serialized to the client). */
export interface ResolvedLocationCandidate {
  placeId: string
  latitude: number
  longitude: number
  /** Slice 1: postcode parsed from the Google formattedAddress at stash time
   *  (parseFormattedAddress). Null when Google's address had no parseable UK
   *  postcode: the trust pipeline treats null as a failed postcode check. */
  postcode: string | null
}

/**
 * Parse a single Google `formattedAddress` string into best-effort structured
 * parts for autofill (§4d recorded fallback). Splits on commas; treats a trailing
 * token matching the UK-postcode shape as the postcode (and the token before it as
 * the city); the first segment is addressLine1. Imperfect by design — the merchant
 * reviews/edits before submitting. Empty / single-segment input degrades
 * gracefully (every part may be null).
 */
export function parseFormattedAddress(formattedAddress: string): MerchantLocationCandidate['addressParts'] {
  const empty = { addressLine1: null, city: null, postcode: null }
  if (!formattedAddress || typeof formattedAddress !== 'string') return empty

  // Drop a trailing country segment ("United Kingdom" / "UK") so the postcode
  // detection looks at the real trailing token.
  let segments = formattedAddress
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (segments.length === 0) return empty

  const last = segments[segments.length - 1]
  if (/^(uk|united kingdom)$/i.test(last)) {
    segments = segments.slice(0, -1)
  }
  if (segments.length === 0) return empty

  let postcode: string | null = null
  const tail = segments[segments.length - 1]
  if (UK_POSTCODE_RE.test(tail)) {
    postcode = tail.toUpperCase()
    segments = segments.slice(0, -1)
  } else {
    // The postcode is sometimes appended to the city segment ("Huddersfield HD1 1AA").
    const m = tail.match(/(.*?)\s+([A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})$/i)
    if (m) {
      postcode = m[2].toUpperCase()
      segments[segments.length - 1] = m[1].trim()
      if (segments[segments.length - 1].length === 0) segments = segments.slice(0, -1)
    }
  }

  const addressLine1 = segments.length > 0 ? segments[0] : null
  const city = segments.length > 1 ? segments[segments.length - 1] : null
  return { addressLine1, city, postcode }
}

/**
 * Run a merchant location search: enforce the limiter, call Google in the
 * `merchant_portal` usage bucket, stash each candidate's coords + placeId behind a
 * fresh opaque token, and return the client-safe DTO array (coords NEVER on the
 * wire). Maps every searchPlaces ok:false union member to a client-safe AppError
 * without leaking provider internals.
 */
export async function searchMerchantLocations(
  redis: Redis,
  ctx: { userId: string; merchantId: string; ip?: string | null },
  query: string,
): Promise<MerchantLocationCandidate[]> {
  // Limiter FIRST (the LOCKED pre-live multi-instance-safe cap) — before any
  // billable Google call. Throws LOCATION_SEARCH_RATE_LIMITED past the cap.
  await consumeMerchantLocationSearch(redis, {
    userId: ctx.userId,
    merchantId: ctx.merchantId,
    ip: ctx.ip ?? null,
  })

  const result = await searchPlaces(query, { source: 'merchant_portal' })

  if (!result.ok) {
    // Map provider internals to client-safe codes. NO_RESULTS -> a soft 404 the
    // UI shows as "no matches"; everything else (key missing / quota / transport /
    // local caps) collapses to a single "unavailable" so the merchant can fall
    // back to manual entry without learning anything about the provider.
    if (result.error === 'NO_RESULTS') throw new AppError('LOCATION_SEARCH_NO_RESULTS')
    throw new AppError('LOCATION_SEARCH_UNAVAILABLE')
  }

  // Stash coords + placeId behind opaque tokens; return only the client-safe DTO.
  const out: MerchantLocationCandidate[] = []
  for (const c of result.candidates) {
    const candidateToken = generateSecureToken(16)
    // Parse once and reuse for both the server-side stash (trust pipeline) and
    // the client-safe DTO (autofill). The postcode NEVER leaks coords/placeId.
    const addressParts = parseFormattedAddress(c.formattedAddress)
    const stash: ResolvedLocationCandidate = {
      placeId: c.placeId,
      latitude: c.latitude,
      longitude: c.longitude,
      postcode: addressParts.postcode,
    }
    await redis.set(
      RedisKey.merchantLocationCandidate(ctx.merchantId, candidateToken),
      JSON.stringify(stash),
      'EX',
      CANDIDATE_TTL_SECONDS,
    )
    out.push({
      candidateToken,
      name: c.name,
      formattedAddress: c.formattedAddress,
      addressParts,
    })
  }
  return out
}

/**
 * Resolve a candidate token to its server-held { placeId, latitude, longitude }.
 * Reused by Layer 2 at the apply step — it MUST be this Redis cache lookup, NEVER
 * a fresh billable Google call. Returns null when the token is missing / expired
 * (the caller then requires a re-search). Scoped by merchantId so a token minted
 * for one merchant can never be replayed against another merchant's apply.
 *
 * Single-use by default (`consume: true`): once resolved the entry is deleted so a
 * token cannot be replayed across multiple applies. Pass `consume: false` for a
 * read-only peek.
 */
export async function resolveLocationCandidate(
  redis: Redis,
  merchantId: string,
  token: string,
  opts: { consume?: boolean } = {},
): Promise<ResolvedLocationCandidate | null> {
  const consumeToken = opts.consume ?? true
  const key = RedisKey.merchantLocationCandidate(merchantId, token)
  const raw = await redis.get(key)
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    if (consumeToken) await redis.del(key)
    return null
  }

  const obj = parsed as Partial<ResolvedLocationCandidate>
  if (
    typeof obj.placeId !== 'string' ||
    typeof obj.latitude !== 'number' ||
    !Number.isFinite(obj.latitude) ||
    typeof obj.longitude !== 'number' ||
    !Number.isFinite(obj.longitude)
  ) {
    if (consumeToken) await redis.del(key)
    return null
  }

  // Slice 1: accept string-or-null with a back-compat default. An in-flight
  // pre-deploy stash entry lacks the postcode field; treat it as null (which the
  // trust pipeline reads as a failed postcode check, degrading to NEEDS_REVIEW).
  const postcode = typeof obj.postcode === 'string' ? obj.postcode : null

  if (consumeToken) await redis.del(key)
  return { placeId: obj.placeId, latitude: obj.latitude, longitude: obj.longitude, postcode }
}

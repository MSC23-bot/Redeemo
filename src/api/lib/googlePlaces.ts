// src/api/lib/googlePlaces.ts
//
// Plan 4 M2.1 — Typed wrapper around Google Places API (New) Text Search.
// Plan 4 M2.3.5 — Local daily + monthly cap hard-stop + source tracking.
//
// Originally exclusive to `prisma/suggest-branch-pin.ts` (owner-run CLI); the
// banner below is stale on that point — the merchant location-search flow
// (src/api/merchant/location/service.ts, `merchant_portal` bucket) and the
// customer merchant-invite place-search flow (M1,
// src/api/customer/invites/service.ts, `customer_invite` bucket) both call
// this wrapper directly, each behind its own atomic Redis limiter
// (merchantLocationLimiter.ts / inviteLocationLimiter.ts) that runs BEFORE
// this call. See
// docs/superpowers/specs/2026-05-14-merchant-exact-pin-confirmation-design.md
// (§4.2 wrapper signature, §4.4 confidence heuristic, §4.8 local caps).
//
// Field mask is deliberately the *small* set (id, displayName, formattedAddress,
// location, types) — NO opening hours / photos / phone / website. We are
// confirming a pin, not importing a merchant profile.
//
// Local cap policy: Google does NOT let us adjust the per-day quota for
// Places API (New) downward. To bound bug loops and surprise invoices we
// enforce two caps before fetch:
//   - daily   (default 500/local-calendar-day,  env GOOGLE_PLACES_DAILY_CAP)
//   - monthly (default 4,500/local-calendar-month, env GOOGLE_PLACES_MONTHLY_CAP)
// Usage state lives in `.cache/google-places-usage.json` (gitignored).
import * as fs from 'node:fs'
import * as path from 'node:path'
import { haversineMetres } from '../shared/haversine'

const PLACES_NEW_TEXTSEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'
const REQUEST_TIMEOUT_MS = 10_000
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.location,places.types'
// Explicit cap. Places API (New) default is 20; we want predictable payload
// size, cost, and latency. 5 candidates is plenty for the owner to skim.
const REQUEST_PAGE_SIZE = 5

// Local cap defaults. Monthly default sits below Google's 5,000 free
// Text Search Pro monthly events to keep us inside the free tier even at
// worst-case usage; the daily cap is a circuit-breaker that prevents a
// runaway loop from burning the whole monthly allowance in one afternoon.
const DEFAULT_DAILY_CAP = 500
const DEFAULT_MONTHLY_CAP = 4_500
const DEFAULT_USAGE_FILE_REL = '.cache/google-places-usage.json'

type UsageSource = 'admin_cli' | 'merchant_portal' | 'customer_invite'
type DayBucket = { total: number; bySource: Record<string, number> }
type UsageState = {
  month: string                       // 'YYYY-MM' local
  monthTotal: number
  monthBySource: Record<string, number>
  days: Record<string, DayBucket>     // keyed by 'YYYY-MM-DD' local
}

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
  | {
      ok: false
      error:
        | 'NO_RESULTS'
        | 'API_KEY_MISSING'
        | 'QUOTA_EXCEEDED'
        | 'GOOGLE_UNAVAILABLE'
        | 'LOCAL_DAILY_CAP_REACHED'
        | 'LOCAL_MONTHLY_CAP_REACHED'
    }

// Shape of a Google API JSON error body (Places API (New) uses the standard
// google.rpc.Status envelope). All fields optional/defensive — we only ever
// read this for observability, never to change behaviour.
type GoogleErrorBody = {
  error?: {
    status?: string
    message?: string
    details?: Array<{ reason?: string }>
  }
}

// Logs the diagnostic shape of a non-OK Google response so an expired /
// invalid / disabled API key (or any other Google-side rejection) is visible
// in server logs WITHOUT needing a live probe. Every non-429 Google failure
// collapses to the single client-safe `GOOGLE_UNAVAILABLE` error below — this
// log is the only place the real cause is recorded.
//
// CRITICAL: never log the API key, any header, or the request body. Only the
// HTTP status and Google's own error envelope (status / reason / message) —
// none of which can contain the key.
function logGoogleErrorDiagnostics(httpStatus: number, body: unknown): void {
  const err = (body as GoogleErrorBody | null)?.error
  console.error('[googlePlaces] non-OK response from Places API (New) Text Search', {
    httpStatus,
    googleErrorStatus: err?.status ?? null,
    googleErrorReasons: Array.isArray(err?.details)
      ? err.details.map((d) => d?.reason).filter((r): r is string => typeof r === 'string')
      : [],
    googleErrorMessage: err?.message ?? null,
  })
}

export type SearchPlacesOptions = {
  /**
   * Which subsystem is calling. Phase 1 is `admin_cli` only — merchant
   * portal stays out of scope until brainstorm-locked. Tracked in the
   * usage file's `bySource` buckets so future per-source budgets and
   * audits don't require a schema change.
   */
  source?: UsageSource
}

// ── Local cap helpers (M2.3.5) ──────────────────────────────────────────

function todayLocalISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function thisMonthLocalISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function usageFilePath(): string {
  return process.env.GOOGLE_PLACES_USAGE_FILE
    ?? path.join(process.cwd(), DEFAULT_USAGE_FILE_REL)
}

function dailyCap(): number {
  const raw = process.env.GOOGLE_PLACES_DAILY_CAP
  if (!raw) return DEFAULT_DAILY_CAP
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_CAP
}
function monthlyCap(): number {
  const raw = process.env.GOOGLE_PLACES_MONTHLY_CAP
  if (!raw) return DEFAULT_MONTHLY_CAP
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MONTHLY_CAP
}

function freshState(): UsageState {
  return {
    month: thisMonthLocalISO(),
    monthTotal: 0,
    monthBySource: {},
    days: {},
  }
}

function readUsage(): UsageState {
  const file = usageFilePath()
  if (!fs.existsSync(file)) return freshState()
  let raw: string
  try { raw = fs.readFileSync(file, 'utf-8') } catch { return freshState() }
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return freshState() }
  if (!parsed || typeof parsed !== 'object') return freshState()
  const obj = parsed as Partial<UsageState>
  // Month rollover: throw the whole structure away. Stale months would
  // otherwise grow `days` unboundedly.
  if (obj.month !== thisMonthLocalISO()) return freshState()
  return {
    month: obj.month,
    monthTotal: typeof obj.monthTotal === 'number' ? obj.monthTotal : 0,
    monthBySource: (obj.monthBySource && typeof obj.monthBySource === 'object')
      ? obj.monthBySource as Record<string, number>
      : {},
    days: (obj.days && typeof obj.days === 'object')
      ? obj.days as Record<string, DayBucket>
      : {},
  }
}

function writeUsage(state: UsageState): void {
  const file = usageFilePath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(state, null, 2))
}

function bumpUsage(source: UsageSource): void {
  const state = readUsage()
  const today = todayLocalISO()
  const day = state.days[today] ?? { total: 0, bySource: {} }
  day.total += 1
  day.bySource[source] = (day.bySource[source] ?? 0) + 1
  state.days[today] = day
  state.monthTotal += 1
  state.monthBySource[source] = (state.monthBySource[source] ?? 0) + 1
  writeUsage(state)
}

function checkCaps(): null | 'LOCAL_DAILY_CAP_REACHED' | 'LOCAL_MONTHLY_CAP_REACHED' {
  const state = readUsage()
  const today = todayLocalISO()
  const dailyCount = state.days[today]?.total ?? 0
  // Daily is checked first — order is load-bearing for the deterministic
  // user-facing message (pinned by the "daily takes precedence" test).
  if (dailyCount >= dailyCap()) return 'LOCAL_DAILY_CAP_REACHED'
  if (state.monthTotal >= monthlyCap()) return 'LOCAL_MONTHLY_CAP_REACHED'
  return null
}

// ────────────────────────────────────────────────────────────────────────

export async function searchPlaces(
  query: string,
  opts: SearchPlacesOptions = {},
): Promise<SearchPlacesResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return { ok: false, error: 'API_KEY_MISSING' }

  // Local cap gate: refuse BEFORE any fetch. Once we're past this gate
  // we commit to counting the attempt (bumpUsage) so transport failures
  // and retry storms can't escape the bound.
  const capFailure = checkCaps()
  if (capFailure) return { ok: false, error: capFailure }

  const source: UsageSource = opts.source ?? 'admin_cli'
  // Count the attempt *before* fetch fires. If the process crashes
  // between this line and the caller's DB transaction / AuditLog write,
  // the `.cache/google-places-usage.json` counter will over-report by 1
  // relative to the AuditLog rows. That asymmetry is intentional:
  //   - The usage counter exists to protect spend / billing — conservative
  //     over-counting is the safe direction (counts attempts, not successes).
  //   - The AuditLog records *successful confirmations* only — written
  //     atomically with the branch update inside `prisma.$transaction(...)`.
  // The two are not expected to match; both are correct for what they
  // measure. See spec §4.8 + plan §M2.3.5.
  bumpUsage(source)

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
    if (!res.ok) {
      // Best-effort: Google's error responses are JSON, but stay defensive —
      // a malformed/non-JSON body must never crash the wrapper or change the
      // GOOGLE_UNAVAILABLE contract returned to the caller.
      let errorBody: unknown = null
      try { errorBody = await res.json() } catch { /* non-JSON body; nothing to log */ }
      logGoogleErrorDiagnostics(res.status, errorBody)
      return { ok: false, error: 'GOOGLE_UNAVAILABLE' }
    }

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

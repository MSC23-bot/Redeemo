// src/api/lib/googleStaticMap.ts
//
// Branch Location Trust Slice 3 (spec 2026-07-09 pin-drop addendum §7 option (d),
// APPROVED). Backend-proxied Google Static Maps fetch for the merchant pin-drop
// map preview. The merchant-web UI renders the returned image bytes SAME-ORIGIN
// (`<img src="/api/.../map-preview">`) and overlays an HTML draggable pin, so:
//   - there is ZERO merchant-web CSP change (no external tile/script host);
//   - the Google key stays SERVER-SIDE and is NEVER exposed to the browser.
//
// Discipline mirrors `src/api/lib/googlePlaces.ts`:
//   - DARK BY DEFAULT: with no `GOOGLE_MAPS_API_KEY` configured, this returns a
//     typed API_KEY_MISSING error and NEVER constructs a provider request
//     (the STORAGE_ENABLED / EMAIL_ENABLED fail-closed pattern).
//   - Local daily + monthly usage caps hard-stop BEFORE fetch to bound spend on
//     the billable Static Maps SKU (owner-gated, D-O2). Usage state lives in
//     `.cache/google-static-map-usage.json` (gitignored), separate from the
//     Places usage file so the two SKUs are tracked independently.
//   - A small in-process response cache (keyed by the exact request params, short
//     TTL) means repeated previews of the SAME branch centroid do not re-bill.
//
// CRITICAL: never log the API key, and never place the key anywhere it can reach
// the client. The key rides ONLY in the server-side request URL to Google; the
// route streams back the image BYTES only.
import * as fs from 'node:fs'
import * as path from 'node:path'

const STATIC_MAP_URL = 'https://maps.googleapis.com/maps/api/staticmap'
const REQUEST_TIMEOUT_MS = 10_000

// Fixed viewport that frames roughly the LOCATION_TRUST_RADIUS_METRES (1 km)
// sanity disc for a UK latitude at this image size (see addendum §5.3: the fixed
// viewport visually enforces the postcode-area constraint). zoom 14 @ 640x400,
// scale 2 puts a ~2 km span across the frame, comfortably enclosing the disc.
export const STATIC_MAP_ZOOM = 14
export const STATIC_MAP_WIDTH_PX = 640
export const STATIC_MAP_HEIGHT_PX = 400
const STATIC_MAP_SCALE = 2

// Local cap defaults (independent of the Places caps). Merchant pin-drop preview
// volume is low (a merchant sets a pin once per branch with occasional
// re-adjustment); these are cost circuit-breakers, not throughput limits.
const DEFAULT_DAILY_CAP = 500
const DEFAULT_MONTHLY_CAP = 4_500
const DEFAULT_USAGE_FILE_REL = '.cache/google-static-map-usage.json'

// In-process response cache TTL. Short enough that a moved postcode centroid is
// refreshed promptly, long enough that opening the pin-drop map (which may fetch
// on mount + on a resize) does not re-bill within a session.
const CACHE_TTL_MS = 5 * 60_000
const CACHE_MAX_ENTRIES = 200

type UsageSource = 'merchant_portal'
type DayBucket = { total: number; bySource: Record<string, number> }
type UsageState = {
  month: string
  monthTotal: number
  monthBySource: Record<string, number>
  days: Record<string, DayBucket>
}

export type StaticMapResult =
  | { ok: true; contentType: string; body: Buffer }
  | {
      ok: false
      error:
        | 'API_KEY_MISSING'
        | 'QUOTA_EXCEEDED'
        | 'GOOGLE_UNAVAILABLE'
        | 'LOCAL_DAILY_CAP_REACHED'
        | 'LOCAL_MONTHLY_CAP_REACHED'
    }

// ── Local cap helpers (mirror googlePlaces.ts) ──────────────────────────────

function todayLocalISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function thisMonthLocalISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function usageFilePath(): string {
  return process.env.GOOGLE_STATIC_MAP_USAGE_FILE
    ?? path.join(process.cwd(), DEFAULT_USAGE_FILE_REL)
}
function dailyCap(): number {
  const raw = process.env.GOOGLE_STATIC_MAP_DAILY_CAP
  if (!raw) return DEFAULT_DAILY_CAP
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_CAP
}
function monthlyCap(): number {
  const raw = process.env.GOOGLE_STATIC_MAP_MONTHLY_CAP
  if (!raw) return DEFAULT_MONTHLY_CAP
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MONTHLY_CAP
}
function freshState(): UsageState {
  return { month: thisMonthLocalISO(), monthTotal: 0, monthBySource: {}, days: {} }
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
  if (obj.month !== thisMonthLocalISO()) return freshState() // month rollover: reset
  return {
    month: obj.month,
    monthTotal: typeof obj.monthTotal === 'number' ? obj.monthTotal : 0,
    monthBySource: (obj.monthBySource && typeof obj.monthBySource === 'object')
      ? obj.monthBySource as Record<string, number> : {},
    days: (obj.days && typeof obj.days === 'object')
      ? obj.days as Record<string, DayBucket> : {},
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
  if (dailyCount >= dailyCap()) return 'LOCAL_DAILY_CAP_REACHED' // daily first (deterministic)
  if (state.monthTotal >= monthlyCap()) return 'LOCAL_MONTHLY_CAP_REACHED'
  return null
}

// ── In-process response cache ───────────────────────────────────────────────

type CacheEntry = { contentType: string; body: Buffer; expiresAt: number }
const responseCache = new Map<string, CacheEntry>()

function cacheKey(lat: number, lng: number): string {
  // Round the centroid to ~5 decimal places (~1 m) so equivalent requests hit
  // the same entry; zoom/size/scale are fixed constants so they need no key part.
  return `${lat.toFixed(5)},${lng.toFixed(5)}`
}

/** Exposed for tests: clear the in-process response cache. */
export function _clearStaticMapCache(): void {
  responseCache.clear()
}

// ────────────────────────────────────────────────────────────────────────────

export type FetchStaticMapInput = {
  centerLat: number
  centerLng: number
}

/**
 * Fetch a static map image centred on a postcode centroid, SERVER-SIDE, with the
 * key from env. Returns the image bytes + content-type, or a typed error. The
 * caller (the map-preview route) streams the bytes back to the client; the key
 * never leaves this module.
 */
export async function fetchStaticMap(input: FetchStaticMapInput): Promise<StaticMapResult> {
  // DARK BY DEFAULT: no key -> typed error, no request constructed.
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return { ok: false, error: 'API_KEY_MISSING' }

  const key = cacheKey(input.centerLat, input.centerLng)
  const cached = responseCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, contentType: cached.contentType, body: cached.body }
  }

  // Local cap gate: refuse BEFORE any fetch (cost circuit-breaker).
  const capFailure = checkCaps()
  if (capFailure) return { ok: false, error: capFailure }
  // Count the attempt before fetch fires (conservative over-count is the safe
  // direction for a spend guard; mirrors googlePlaces.ts).
  bumpUsage('merchant_portal')

  const params = new URLSearchParams({
    center: `${input.centerLat},${input.centerLng}`,
    zoom: String(STATIC_MAP_ZOOM),
    size: `${STATIC_MAP_WIDTH_PX}x${STATIC_MAP_HEIGHT_PX}`,
    scale: String(STATIC_MAP_SCALE),
    // No marker: the merchant-web overlay renders the draggable HTML pin, and the
    // fixed centred viewport visually frames the postcode-area constraint.
    key: apiKey,
  })

  try {
    const res = await fetch(`${STATIC_MAP_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (res.status === 429) return { ok: false, error: 'QUOTA_EXCEEDED' }
    if (!res.ok) {
      // Never log the URL / key; only the HTTP status is diagnostic-safe.
      console.error('[googleStaticMap] non-OK response from Static Maps API', { httpStatus: res.status })
      return { ok: false, error: 'GOOGLE_UNAVAILABLE' }
    }
    const contentType = res.headers.get('content-type') ?? 'image/png'
    const body = Buffer.from(await res.arrayBuffer())

    // Populate the cache (bounded; evict the oldest on overflow).
    if (responseCache.size >= CACHE_MAX_ENTRIES) {
      const oldest = responseCache.keys().next().value
      if (oldest !== undefined) responseCache.delete(oldest)
    }
    responseCache.set(key, { contentType, body, expiresAt: Date.now() + CACHE_TTL_MS })

    return { ok: true, contentType, body }
  } catch {
    return { ok: false, error: 'GOOGLE_UNAVAILABLE' }
  }
}

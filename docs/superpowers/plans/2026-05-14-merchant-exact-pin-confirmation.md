# Merchant Exact-Pin Confirmation (Phase 1 MVP) Implementation Plan

> **Status: DRAFT — awaiting owner approval before any implementation begins.** Direction approved in principle 2026-05-14; explicit implementation approval pending. Mocked-test development (tasks M2.1–M2.3) may proceed when approved; **live Google calls (M2.4) require the additional pause-points in that task's banner.**

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an owner-run CLI that suggests a Google Places candidate for a branch + deliberately confirms it, flipping `Branch.locationConfidence` from `POSTCODE_CENTROID` to `MANUALLY_CONFIRMED` with full audit trail.

**Architecture:** Two new files: `src/api/lib/googlePlaces.ts` (typed wrapper around Google Places Text Search) + `prisma/suggest-branch-pin.ts` (CLI with 4 modes: suggest / confirm-best / confirm-place-id / manual). Reuses the existing `AuditLog` table for the audit trail; zero schema migrations.

**Tech Stack:** Node 20.19, TypeScript, `node:fetch` + `AbortSignal.timeout`, Prisma 7 + `@prisma/adapter-pg`, vitest for tests. **No new dependencies.**

**Spec reference:** `docs/superpowers/specs/2026-05-14-merchant-exact-pin-confirmation-design.md` — read before starting.

**Owner-action prerequisite:** Google Cloud project setup per spec §4.6. The implementer **MUST pause and ask the owner** if `GOOGLE_MAPS_API_KEY` is missing during smoke-testing — never hardcode a key, never commit a key.

---

## File structure

| Path | Role | Status |
| --- | --- | --- |
| `src/api/lib/googlePlaces.ts` | Typed wrapper around Google Places Text Search; exports `searchPlaces(query)` returning a discriminated-union result, plus `bestCandidateConfidence(candidates, postcodeCentroid, merchantNames)` for the HIGH/LOW heuristic. | Create |
| `tests/api/lib/googlePlaces.test.ts` | Unit tests with mocked `fetch`. Covers success / NO_RESULTS / quota / network failure / timeout. Includes heuristic tests. | Create |
| `prisma/suggest-branch-pin.ts` | CLI script. Loads branch + merchant, builds query, calls `searchPlaces`, prints candidates, applies confirmation if flagged. Writes branch update + audit-log row on confirmation. | Create |
| `.env.example` | Add `GOOGLE_MAPS_API_KEY=` placeholder + comment pointing at spec §4.6. | Modify |
| `docs/operations/google-places-setup.md` | Setup checklist (mirrors spec §4.6 in operational form: enable API, restrict key, set quota cap, set billing alert, save key to `.env`). | Create |

The CLI deliberately lives in `prisma/` (not `src/`) — same convention as the M1.23 owner-run market scripts. It is **temporary operational tooling** pending the Phase 5 admin panel.

---

## Task M2.1: Create `src/api/lib/googlePlaces.ts` (TDD — failing test first)

**Files:**
- Create: `src/api/lib/googlePlaces.ts`
- Create: `tests/api/lib/googlePlaces.test.ts`

### - [ ] Step 1: Write the failing test scaffold

```typescript
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
```

### - [ ] Step 2: Run test (expect fail)

Run: `npx vitest run tests/api/lib/googlePlaces.test.ts`
Expected: FAIL — `Cannot find module ../../../src/api/lib/googlePlaces`.

### - [ ] Step 3: Implement the module

```typescript
// src/api/lib/googlePlaces.ts
import { haversineMetres } from '../shared/haversine'

const PLACES_NEW_TEXTSEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'
const REQUEST_TIMEOUT_MS = 10_000
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.location,places.types'
// Explicit cap. Places API New default is 20; we want predictable payload size,
// cost, and latency. 5 candidates is plenty for the owner to skim.
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
  // 1) Distance check
  const dist = haversineMetres(
    postcodeCentroid.lat, postcodeCentroid.lng,
    candidate.latitude, candidate.longitude,
  )
  if (dist > HIGH_CONFIDENCE_RADIUS_METRES) return 'LOW'

  // 2) Business-type check
  const hasBusinessType = candidate.types.some(t => BUSINESS_TYPES.has(t))
  if (!hasBusinessType) return 'LOW'

  // 3) Name-token match (≥1 non-trivial token from candidate.name appears in any merchant name)
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
```

### - [ ] Step 4: Run test (expect pass)

Run: `npx vitest run tests/api/lib/googlePlaces.test.ts`
Expected: PASS — 14/14 tests green (9 searchPlaces + 5 bestCandidateConfidence).

The 9 `searchPlaces` cases:
  1. API_KEY_MISSING when env var unset
  2. parsed candidates on success
  3. NO_RESULTS on empty places[]
  4. QUOTA_EXCEEDED on 429
  5. GOOGLE_UNAVAILABLE on network failure
  6. GOOGLE_UNAVAILABLE on AbortError
  7. fetch called with AbortSignal
  8. POST + correct field-mask header + `pageSize: 5` body
  9. Filters out candidates missing location + NO_RESULTS when all filtered (defence against the `0,0`-pin shape)

### - [ ] Step 5: Commit

```bash
git add src/api/lib/googlePlaces.ts tests/api/lib/googlePlaces.test.ts
git commit -m "feat(merchant-pin): Google Places Text Search wrapper + confidence heuristic"
```

---

## Task M2.2: Create the CLI script `prisma/suggest-branch-pin.ts`

**Files:**
- Create: `prisma/suggest-branch-pin.ts`

### - [ ] Step 1: Implement the CLI

```typescript
// prisma/suggest-branch-pin.ts
//
// Plan 4 M2.2 — admin/owner-run script that suggests a Google Places pin for
// a branch and (on explicit confirmation) flips the branch's
// locationConfidence to MANUALLY_CONFIRMED with full audit trail.
//
// Owner-run only. NOT a customer-facing endpoint. NEVER call this from any
// customer code path. See:
//   docs/superpowers/specs/2026-05-14-merchant-exact-pin-confirmation-design.md
//
// Usage:
//   npx tsx prisma/suggest-branch-pin.ts <branchId>                                  (suggest, no writes)
//   npx tsx prisma/suggest-branch-pin.ts <branchId> --confirm-best                   (suggest + confirm #1)
//   npx tsx prisma/suggest-branch-pin.ts <branchId> --confirm-place-id <placeId>    (suggest + confirm by id)
//   npx tsx prisma/suggest-branch-pin.ts <branchId> --manual --lat <n> --lng <n>    (manual override, no Google call)
//
// Optional flag (all modes that write): --note "<text>"
//
// Cost: 1 Google Places Text Search call per invocation in suggest /
// confirm-best / confirm-place-id modes. 0 calls in --manual mode.

import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { haversineMetres } from '../src/api/shared/haversine'
import { searchPlaces, bestCandidateConfidence, type GooglePlaceCandidate } from '../src/api/lib/googlePlaces'

const UK_BOUNDS = { minLat: 49.5, maxLat: 61.0, minLng: -8.5, maxLng: 2.0 }

function parseArgs(argv: string[]): {
  branchId: string
  mode: 'suggest' | 'confirm-best' | 'confirm-place-id' | 'manual'
  placeId?: string
  lat?: number
  lng?: number
  note?: string
} | { error: string } {
  const args = argv.slice(2)
  const branchId = args[0] && !args[0].startsWith('--') ? args[0] : undefined
  if (!branchId) return { error: 'branchId is required' }

  const hasConfirmBest = args.includes('--confirm-best')
  const placeIdIdx = args.indexOf('--confirm-place-id')
  const hasConfirmPlaceId = placeIdIdx !== -1
  const hasManual = args.includes('--manual')
  const modeFlags = [hasConfirmBest, hasConfirmPlaceId, hasManual].filter(Boolean).length
  if (modeFlags > 1) return { error: 'Modes --confirm-best / --confirm-place-id / --manual are mutually exclusive' }

  let mode: 'suggest' | 'confirm-best' | 'confirm-place-id' | 'manual' = 'suggest'
  let placeId: string | undefined
  let lat: number | undefined
  let lng: number | undefined

  if (hasConfirmBest)    mode = 'confirm-best'
  if (hasConfirmPlaceId) { mode = 'confirm-place-id'; placeId = args[placeIdIdx + 1] }
  if (hasManual) {
    mode = 'manual'
    const latIdx = args.indexOf('--lat')
    const lngIdx = args.indexOf('--lng')
    if (latIdx === -1 || lngIdx === -1) return { error: '--manual requires --lat and --lng' }
    lat = parseFloat(args[latIdx + 1])
    lng = parseFloat(args[lngIdx + 1])
    if (isNaN(lat) || isNaN(lng)) return { error: '--lat and --lng must be numeric' }
    if (lat < UK_BOUNDS.minLat || lat > UK_BOUNDS.maxLat || lng < UK_BOUNDS.minLng || lng > UK_BOUNDS.maxLng) {
      return { error: `--lat / --lng out of UK bounds (lat ${UK_BOUNDS.minLat}-${UK_BOUNDS.maxLat}, lng ${UK_BOUNDS.minLng}-${UK_BOUNDS.maxLng})` }
    }
  }

  const noteIdx = args.indexOf('--note')
  const note = noteIdx !== -1 ? args[noteIdx + 1] : undefined

  if (mode === 'confirm-place-id' && !placeId) {
    return { error: '--confirm-place-id requires a placeId argument' }
  }

  return { branchId, mode, placeId, lat, lng, note }
}

async function main() {
  const parsed = parseArgs(process.argv)
  if ('error' in parsed) {
    console.error(`Error: ${parsed.error}`)
    console.error('Usage:')
    console.error('  npx tsx prisma/suggest-branch-pin.ts <branchId>')
    console.error('  npx tsx prisma/suggest-branch-pin.ts <branchId> --confirm-best [--note "..."]')
    console.error('  npx tsx prisma/suggest-branch-pin.ts <branchId> --confirm-place-id <placeId> [--note "..."]')
    console.error('  npx tsx prisma/suggest-branch-pin.ts <branchId> --manual --lat <n> --lng <n> [--note "..."]')
    process.exit(1)
  }
  const { branchId, mode, placeId, lat: manualLat, lng: manualLng, note } = parsed

  const adapter = new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }))
  const prisma = new PrismaClient({ adapter })

  // Load branch + merchant
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    include: { merchant: { select: { businessName: true, tradingName: true } } },
  })
  if (!branch) {
    console.error(`Branch ${branchId} not found`)
    await prisma.$disconnect()
    process.exit(1)
  }

  // Print current state
  const merchantLabel = branch.merchant.tradingName ?? branch.merchant.businessName
  console.log(`Branch:       ${branch.id} (${branch.name})`)
  console.log(`Merchant:     ${merchantLabel}`)
  console.log(`Address:      ${branch.addressLine1}, ${branch.city} ${branch.postcode}`)
  console.log(`Current pin:  ${branch.latitude ?? 'null'}, ${branch.longitude ?? 'null'} (${branch.locationConfidence})`)
  console.log('')

  // --manual mode: skip Google entirely
  if (mode === 'manual') {
    await confirmPin(prisma, branch, {
      provider: 'manual',
      placeId: null,
      candidateName: null,
      candidateAddress: null,
      candidateTypes: null,
      googleMapsUrl: null,
      bestConfidence: null,
      distanceFromPostcodeCentroidMetres: null,
      newLatitude: manualLat!,
      newLongitude: manualLng!,
      apiCalls: 0,
      note: note ?? null,
    })
    await prisma.$disconnect()
    return
  }

  // Build query + call Google
  const query = `${merchantLabel} ${branch.addressLine1}, ${branch.city} ${branch.postcode}`
  console.log(`Google Places query: "${query}"`)
  const result = await searchPlaces(query)
  if (!result.ok) {
    console.error(`Google Places error: ${result.error}`)
    if (result.error === 'API_KEY_MISSING') {
      console.error('Set GOOGLE_MAPS_API_KEY in .env (see docs/operations/google-places-setup.md).')
    }
    await prisma.$disconnect()
    process.exit(1)
  }

  // Compute distance + confidence for each candidate
  const centroidLat = branch.latitude !== null ? Number(branch.latitude) : null
  const centroidLng = branch.longitude !== null ? Number(branch.longitude) : null
  const merchantNames = [branch.merchant.businessName, branch.merchant.tradingName ?? '', branch.name]
    .filter(Boolean)

  console.log(`\nCandidates (${result.candidates.length}):`)
  result.candidates.forEach((c, i) => {
    const dist = (centroidLat !== null && centroidLng !== null)
      ? Math.round(haversineMetres(centroidLat, centroidLng, c.latitude, c.longitude))
      : null
    const conf = (i === 0 && centroidLat !== null && centroidLng !== null)
      ? bestCandidateConfidence(c, { lat: centroidLat, lng: centroidLng }, merchantNames)
      : null
    const star = conf === 'HIGH' ? ' ★ HIGH-CONFIDENCE' : ''
    console.log(`  #${i + 1}  ${c.name}${star}`)
    console.log(`        ${c.formattedAddress}`)
    console.log(`        ${c.latitude}, ${c.longitude}`)
    console.log(`        placeId:  ${c.placeId}`)
    if (c.googleMapsUrl) console.log(`        gmaps:    ${c.googleMapsUrl}`)
    if (dist !== null) console.log(`        distance from postcode centroid: ~${dist}m`)
    console.log(`        types:    [${c.types.join(', ')}]`)
  })
  console.log('')

  // Read-only suggest mode: stop here.
  if (mode === 'suggest') {
    console.log('To confirm the best candidate:   re-run with --confirm-best')
    console.log('To confirm a specific candidate: re-run with --confirm-place-id <placeId>')
    console.log('To override manually:            re-run with --manual --lat <n> --lng <n>')
    console.log('No DB writes performed.')
    await prisma.$disconnect()
    return
  }

  // Pick chosen candidate
  let chosen: GooglePlaceCandidate | undefined
  if (mode === 'confirm-best') {
    chosen = result.candidates[0]
  } else {
    chosen = result.candidates.find(c => c.placeId === placeId)
    if (!chosen) {
      console.error(`placeId ${placeId} not present in top-${result.candidates.length} results.`)
      console.error('Re-run without --confirm-place-id to see candidates again.')
      await prisma.$disconnect()
      process.exit(1)
    }
  }

  const dist = (centroidLat !== null && centroidLng !== null)
    ? Math.round(haversineMetres(centroidLat, centroidLng, chosen.latitude, chosen.longitude))
    : null
  const conf = (centroidLat !== null && centroidLng !== null)
    ? bestCandidateConfidence(chosen, { lat: centroidLat, lng: centroidLng }, merchantNames)
    : null

  await confirmPin(prisma, branch, {
    provider: 'google_places',
    placeId: chosen.placeId,
    candidateName: chosen.name,
    candidateAddress: chosen.formattedAddress,
    candidateTypes: chosen.types,
    googleMapsUrl: chosen.googleMapsUrl,
    bestConfidence: conf,
    distanceFromPostcodeCentroidMetres: dist,
    newLatitude: chosen.latitude,
    newLongitude: chosen.longitude,
    apiCalls: 1,
    note: note ?? null,
  })
  await prisma.$disconnect()
}

async function confirmPin(
  prisma: PrismaClient,
  branch: {
    id: string
    latitude: any
    longitude: any
    locationConfidence: string
  },
  audit: {
    provider: 'google_places' | 'manual'
    placeId: string | null
    candidateName: string | null
    candidateAddress: string | null
    candidateTypes: string[] | null
    googleMapsUrl: string | null
    bestConfidence: 'HIGH' | 'LOW' | null
    distanceFromPostcodeCentroidMetres: number | null
    newLatitude: number
    newLongitude: number
    apiCalls: number
    note: string | null
  },
) {
  const oldLat = branch.latitude !== null ? Number(branch.latitude) : null
  const oldLng = branch.longitude !== null ? Number(branch.longitude) : null
  const oldConfidence = branch.locationConfidence

  await prisma.$transaction([
    prisma.branch.update({
      where: { id: branch.id },
      data: {
        latitude: audit.newLatitude,
        longitude: audit.newLongitude,
        locationConfidence: 'MANUALLY_CONFIRMED',
        locationResolvedAt: new Date(),
      },
    }),
    prisma.auditLog.create({
      data: {
        entityId: branch.id,
        entityType: 'branch',
        event: 'BRANCH_PIN_CONFIRMED',
        ipAddress: 'cli',
        userAgent: 'prisma/suggest-branch-pin.ts',
        metadata: {
          provider:                              audit.provider,
          placeId:                               audit.placeId,
          candidateName:                         audit.candidateName,
          candidateAddress:                      audit.candidateAddress,
          candidateTypes:                        audit.candidateTypes,
          googleMapsUrl:                         audit.googleMapsUrl,
          bestConfidence:                        audit.bestConfidence,
          distanceFromPostcodeCentroidMetres:    audit.distanceFromPostcodeCentroidMetres,
          oldLatitude:                           oldLat,
          oldLongitude:                          oldLng,
          oldConfidence:                         oldConfidence,
          newLatitude:                           audit.newLatitude,
          newLongitude:                          audit.newLongitude,
          newConfidence:                         'MANUALLY_CONFIRMED',
          confirmedBy:                           'cli',
          note:                                  audit.note,
          apiCalls:                              audit.apiCalls,
        },
      },
    }),
  ])

  console.log('Confirmation applied.')
  console.log(`  before:  ${oldLat ?? 'null'}, ${oldLng ?? 'null'} (${oldConfidence})`)
  console.log(`  after:   ${audit.newLatitude}, ${audit.newLongitude} (MANUALLY_CONFIRMED)`)
  console.log(`  audit:   logged ${audit.apiCalls} Google call(s); event=BRANCH_PIN_CONFIRMED`)
}

main().catch(e => { console.error(e); process.exit(1) })
```

### - [ ] Step 2: Smoke-test usage banner (no DB writes)

Run: `npx tsx prisma/suggest-branch-pin.ts`
Expected: usage banner + exit 1. No DB writes.

Run: `npx tsx prisma/suggest-branch-pin.ts some-id --confirm-best --confirm-place-id abc`
Expected: error "Modes ... are mutually exclusive" + exit 1.

Run: `npx tsx prisma/suggest-branch-pin.ts some-id --manual --lat 99 --lng 0`
Expected: error "--lat / --lng out of UK bounds" + exit 1.

### - [ ] Step 3: Commit

```bash
git add prisma/suggest-branch-pin.ts
git commit -m "feat(merchant-pin): suggest-branch-pin CLI with 4 modes + audit log"
```

---

## Task M2.3: `.env.example` + setup docs

**Files:**
- Modify: `.env.example` (or create if not present)
- Create: `docs/operations/google-places-setup.md`

### - [ ] Step 1: Update `.env.example`

Append (or insert under a "Google Maps / Places" section):

```bash
# Google Places API (Phase 1 merchant-pin confirmation only — see
# docs/superpowers/specs/2026-05-14-merchant-exact-pin-confirmation-design.md
# and docs/operations/google-places-setup.md).
# Used by prisma/suggest-branch-pin.ts ONLY. NOT a customer-flow key.
# Restrict to Places API (New). Daily/monthly Google-side quota knobs
# are NOT user-adjustable downward; the wrapper enforces a local hard-stop
# (see spec §4.8 / M2.3.5).
GOOGLE_MAPS_API_KEY=
```

### - [ ] Step 2: Write the setup checklist

```markdown
# Google Places — Setup Checklist (Phase 1 merchant-pin)

Owner-run setup. Done once per environment.

## What this key is for

Used by `prisma/suggest-branch-pin.ts` to suggest a merchant branch's exact
storefront pin via Google Places Text Search. The CLI requires explicit owner
confirmation before flipping the branch's `locationConfidence` to
`MANUALLY_CONFIRMED`. See:

- Spec: `docs/superpowers/specs/2026-05-14-merchant-exact-pin-confirmation-design.md`
- Plan: `docs/superpowers/plans/2026-05-14-merchant-exact-pin-confirmation.md`

## What this key is NOT for

- NOT a customer-facing API call.
- NOT used during postcode preview, PC2 onboarding, customer discovery, search,
  map, or merchant profile.
- NOT cached or pre-fetched in bulk.
- NOT used to import opening hours / photos / ratings / phone / website.

## Setup steps

1. Create / reuse a Google Cloud project.
2. Enable Billing on the project.
3. Enable the **Places API (New)** (NOT the legacy Places API).
4. Generate an API key. Restrict to "Places API (New)" only.
5. Application restriction: optional (skip for laptop with rotating IP; add IP restriction later if/when a static-IP server exists).
6. **Skip** the in-console daily quota cap — Google does not let Places API (New) be adjusted downward. The wrapper enforces local caps (§4.8 / M2.3.5 instead).
7. Set a **billing alert** at ~£5/month, 50% / 90% / 100% thresholds, "Actual" trigger.
8. Save to `.env` as `GOOGLE_MAPS_API_KEY=...`. NEVER commit.
9. Verify with a single suggest call:

   ```
   npx tsx prisma/suggest-branch-pin.ts tax-branch-karaara-001
   ```

   You should see Google candidates printed; no DB write occurs.

> The above is the abridged form. The as-shipped setup doc was further expanded in M2.3.5 with the **verified-2026-05-14 pricing table** and the **local daily/monthly cap section**. See `docs/operations/google-places-setup.md` for the live content.

## Expected cost (Phase 1) — verified 2026-05-14, subject to Google pricing changes

The wrapper requests `places.id,places.displayName,places.formattedAddress,places.location,places.types` — lands in the **Places API Text Search Pro** SKU.

| SKU | Free monthly cap | Per 1,000 calls (first 100k) |
| --- | --- | --- |
| Text Search Pro ← our SKU | **5,000 events** | **$32.00** |
| Text Search Enterprise | 1,000 events | $35.00 |
| Text Search Essentials (IDs-only — N/A) | Unlimited | $0 |

Practical Phase 1 cost: Huddersfield trial of ~60 calls = **$0**. The local caps (§4.8 / M2.3.5) bound the worst case at $0 regardless of bug loops.

## When to rotate this key

- If the key leaks (committed accidentally, posted in a screenshot, etc.).
- If a new admin / dev needs access (give them a new key, not the existing one).
- Annually as good hygiene.
```

### - [ ] Step 3: Commit

```bash
git add .env.example docs/operations/google-places-setup.md
git commit -m "docs(merchant-pin): Google Places setup checklist + .env.example"
```

---

## Task M2.3.5: Local daily + monthly cap hard-stop (added pre-M2.4 per owner direction 2026-05-14)

**Why added:** Google does NOT let us adjust the Places API (New) per-day quota downward through the Cloud Console (Adjustable: No). The £5/month billing alert is a notification, not a stop. To bound bug loops + surprise invoices, the wrapper enforces TWO local caps before any `fetch` call. Also: pricing skim during setup surfaced the spec's $5/1000 working assumption was stale — real pricing is $32/1000 in the Text Search Pro SKU with 5,000 free events/month. Both updates land in this task.

**Files:**
- Modify: `src/api/lib/googlePlaces.ts` — add daily + monthly cap guard, `LOCAL_DAILY_CAP_REACHED` / `LOCAL_MONTHLY_CAP_REACHED` error codes, source tracking (`admin_cli` default, `merchant_portal` reserved for Phase 2).
- Modify: `tests/api/lib/googlePlaces.test.ts` — append 15 new tests pinning the cap contract.
- Modify: `prisma/suggest-branch-pin.ts` — surface the new error codes with friendly hint + override env-var examples.
- Modify: `.gitignore` — add `.cache/` for the local usage file.
- Modify: `docs/operations/google-places-setup.md` — replace the un-settable Google quota step with the local-cap section, refresh pricing table to verified 2026-05-14 figures, add the Phase 1 intended call pattern.
- Modify: `docs/superpowers/specs/2026-05-14-merchant-exact-pin-confirmation-design.md` — patch §4.6 step 5 (skip the cap step), refresh §4.7 cost table, add §4.8 "Local daily + monthly hard-stop", renumber old §4.8 → §4.9.

**Locked defaults:**
- Daily cap: **500 calls / local-calendar-day**
- Monthly cap: **4,500 calls / local-calendar-month** (sits under Google's 5,000 free Text Search Pro events/month)
- Override env vars: `GOOGLE_PLACES_DAILY_CAP`, `GOOGLE_PLACES_MONTHLY_CAP`

**Usage file shape (`.cache/google-places-usage.json`):**

```json
{
  "month": "2026-05",
  "monthTotal": 123,
  "monthBySource": { "admin_cli": 123 },
  "days": { "2026-05-14": { "total": 12, "bySource": { "admin_cli": 12 } } }
}
```

**Contract pins (covered by tests):**

- Daily cap is checked first; daily error wins when both would trip (deterministic message).
- A blocked attempt does NOT increment any counter.
- A live `fetch` attempt counts ONCE (transport failures included — retry storms cannot escape the bound).
- API_KEY_MISSING short-circuits BEFORE the cap gate (no waste).
- Local-day rollover within the same month: new `days[YYYY-MM-DD]` entry added, `monthTotal` preserved + incremented.
- Local-month rollover: entire structure wiped + replaced (prevents unbounded `days` accumulation).
- Malformed JSON file → fresh start, no crash.
- `searchPlaces(query, { source: 'merchant_portal' })` lands in its own `bySource` bucket (forward-compat for Phase 2).

### - [ ] Step 1: Implement + commit

After tests pass green (15 new tests, 30 total in `googlePlaces.test.ts`) + full `tests/api/lib/` regression green + tsc clean:

```bash
git add .gitignore src/api/lib/googlePlaces.ts tests/api/lib/googlePlaces.test.ts prisma/suggest-branch-pin.ts
git commit -m "feat(merchant-pin): local daily + monthly cap hard-stop + source tracking"

git add docs/operations/google-places-setup.md docs/superpowers/specs/2026-05-14-merchant-exact-pin-confirmation-design.md docs/superpowers/plans/2026-05-14-merchant-exact-pin-confirmation.md
git commit -m "docs(merchant-pin): real pricing + local cap + Phase 1 call pattern"
```

### - [ ] Step 2: Stop before M2.4

Same pause-point contract as M2.4 — only proceed to live calls after the owner explicitly green-lights.

---

## Task M2.4: Smoke test against a real seeded branch (owner-action)

**⚠️ PAUSE POINTS — read before starting M2.4:**

1. **M2.1, M2.2, M2.3 are mocked-test development.** They produce no outbound Google calls. The implementer SHOULD complete M2.1 → M2.3 + commit + run the full mocked test suite green BEFORE attempting M2.4.

2. **M2.4 is the FIRST live Google call.** Before invoking the CLI against a real branch:
   - **Pause and ask the owner** to confirm: Google Cloud project setup is complete; Places API (New) is enabled; the API key is generated + restricted to Places API (New); billing alert (~£5/month) is in place per spec §4.6. NOTE: the Google-side daily-quota cap is NOT settable for Places API (New) — the local hard-stop (§4.8 / M2.3.5) replaces it.
   - **Pause and ask the owner** if `GOOGLE_MAPS_API_KEY` is missing from `.env`. NEVER hardcode a key. NEVER request the key value in chat or commit it.
   - **Pause and ask the owner** if Google's current per-call pricing has materially drifted from spec §4.7's verified-2026-05-14 figures (re-skim <https://developers.google.com/maps/billing-and-pricing/pricing> before live use).
   - Confirm the local caps are in force — `.cache/google-places-usage.json` will be created on the first call. The CLI prints a friendly error + override hint if either cap trips.
   - If any of these checks fails, do not proceed to live calls. Surface the gap to the owner; they'll either complete setup or defer M2.4.

3. **M2.4's --confirm-best step (Step 4) is the first DB-mutating live call.** Owner-discretion only — pick ONE branch deliberately.

**Files:** (none — manual verification)

### - [ ] Step 1: Verify the key is in place

```
node -e "console.log('KEY_PRESENT:', !!process.env.GOOGLE_MAPS_API_KEY)" --require=dotenv/config
```
Expected: `KEY_PRESENT: true`.

**If false: STOP. Pause and surface to the owner — do not proceed.**

### - [ ] Step 2: Suggest a pin for Karaara (read-only)

```
npx tsx prisma/suggest-branch-pin.ts tax-branch-karaara-001
```
Expected:
- Current pin printed as `53.6463, -1.7809 (MANUALLY_CONFIRMED)` — Karaara is already confirmed via M1.16.
- Google candidates printed.
- No DB writes; no `BRANCH_PIN_CONFIRMED` audit row appears.

### - [ ] Step 3: Suggest a pin for a `POSTCODE_CENTROID` legacy dev branch

```
# Pick any branch from `prisma/baseline-check.ts`'s 67 legacy unconfirmed set:
npx tsx prisma/suggest-branch-pin.ts <some-postcode-centroid-branch-id>
```
Expected:
- Current pin printed with `POSTCODE_CENTROID` confidence.
- Google candidates printed (or `NO_RESULTS` if it's a fixture postcode like `TE1 1ST`).
- No DB writes.

### - [ ] Step 4 (optional, owner-discretion): Confirm one trial branch end-to-end

Pick ONE real branch the owner wants confirmed first. Run:
```
npx tsx prisma/suggest-branch-pin.ts <branch-id> --confirm-best --note "owner smoke test 2026-05-14"
```
Expected:
- "Confirmation applied." printed with before/after summary.
- Branch row updated: `locationConfidence = MANUALLY_CONFIRMED`, new lat/lng, fresh `locationResolvedAt`.
- One `AuditLog` row with `event = BRANCH_PIN_CONFIRMED` + rich metadata.

Verify via:
```sql
SELECT id, latitude, longitude, "locationConfidence", "locationResolvedAt"
  FROM "Branch" WHERE id = '<branch-id>';

SELECT event, metadata FROM "AuditLog"
  WHERE "entityId" = '<branch-id>' AND event = 'BRANCH_PIN_CONFIRMED'
  ORDER BY "createdAt" DESC LIMIT 1;
```

### - [ ] Step 5: Verify customer discovery surfaces the confirmed branch with real lat/lng

```
# Quick verification: GET /api/v1/customer/merchants/<merchantId>
# In the response, the matching branch should now have:
#   - latitude / longitude: real numbers (not null)
#   - locationConfidence: 'MANUALLY_CONFIRMED'
#   - distance: a real number when ?lat=...&lng=... is provided
```

If smoke tests pass: track is shippable. Open PR.

---

## Task M2.5: Push + open PR

### - [ ] Step 1: Verify final state

- `npx tsc --noEmit` — 0 errors
- `npx vitest run tests/api/lib/` — passing (includes new googlePlaces tests + existing postcodeResolver + findOrCreateLocality)
- `npx vitest run` — full backend regression green

### - [ ] Step 2: Push + open PR

```bash
git push -u origin feature/merchant-pin-confirmation-phase-1
gh pr create --title "feat(merchant-pin): Phase 1 — admin-run pin confirmation via Google Places" \
  --body "$(cat <<'EOF'
## Summary

Ships the Phase 1 MVP of the merchant exact-pin confirmation track:
admin/owner-run CLI that suggests a Google Places candidate for a branch
and (on explicit confirmation) flips the branch's locationConfidence
from POSTCODE_CENTROID to MANUALLY_CONFIRMED.

## What changed

- New: `src/api/lib/googlePlaces.ts` — typed wrapper around Places API
  (New) Text Search with the small field-mask (id, displayName,
  formattedAddress, location, types — NO opening hours / photos / phone /
  website).
- New: `prisma/suggest-branch-pin.ts` — 4-mode CLI (suggest / confirm-best
  / confirm-place-id / manual). Reuses the existing AuditLog table.
- New: `docs/operations/google-places-setup.md` — owner setup checklist.
- Modify: `.env.example` — adds GOOGLE_MAPS_API_KEY placeholder.
- Tests: 12+ new test cases.

Zero schema changes. Zero customer-app changes. Zero customer-flow Google
calls. Spec at `docs/superpowers/specs/2026-05-14-merchant-exact-pin-confirmation-design.md`.

## Test plan

- [ ] tsc --noEmit clean
- [ ] tests/api/lib/googlePlaces.test.ts — 12/12
- [ ] Full backend regression — green
- [ ] Smoke test against Karaara (no-op confirm)
- [ ] Smoke test against a POSTCODE_CENTROID branch (suggest only)
- [ ] One real branch confirmed end-to-end + verified in customer discovery
EOF
)"
```

---

## Self-review

Before handing off:

1. **Spec coverage:** every section of the spec maps to a task above. §4.6 Google Cloud setup → M2.3 setup checklist. §4.7 cost expectations → covered in the setup checklist. ✓
2. **Placeholder scan:** no "TBD" / "TODO" / "fill in details" in the plan above. All code blocks are complete + executable. ✓
3. **Type consistency:** `GooglePlaceCandidate` shape used in `googlePlaces.ts`, `googlePlaces.test.ts`, and `suggest-branch-pin.ts` are identical. `searchPlaces` return type is the same across module + tests + CLI. ✓
4. **Phase 2 boundary:** plan covers Phase 1 only. Phase 2 architecture is in the spec; the plan does NOT prematurely scaffold merchant-portal UI, BranchPinSuggestion tables, or pending-edit kind discriminators. ✓
5. **API key safety:** plan explicitly tells the implementer to pause if the key is missing during smoke-testing. ✓

## Execution handoff

When owner approves the plan, choose one:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task with two-stage review (spec compliance + code quality) between tasks.

**2. Inline Execution** — execute tasks in the current session using `superpowers:executing-plans`.

Both are equally fine for a focused 5-task track. Subagent-driven gives the cleanest commit-per-task pattern matching M1's history.

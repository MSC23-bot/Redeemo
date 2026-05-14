// tests/api/lib/googlePlaces.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
import { searchPlaces, bestCandidateConfidence } from '../../../src/api/lib/googlePlaces'

// Per-test temp file for the daily-cap counter so tests never touch the
// real .cache/google-places-usage.json on the developer's machine.
function makeTempUsageFile(): string {
  return path.join(
    os.tmpdir(),
    `redeemo-gplaces-usage-${crypto.randomBytes(8).toString('hex')}.json`,
  )
}

describe('searchPlaces', () => {
  let tmpUsageFile: string

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.GOOGLE_MAPS_API_KEY = 'test-key'
    delete process.env.GOOGLE_PLACES_DAILY_CAP
    delete process.env.GOOGLE_PLACES_MONTHLY_CAP
    tmpUsageFile = makeTempUsageFile()
    process.env.GOOGLE_PLACES_USAGE_FILE = tmpUsageFile
  })

  afterEach(() => {
    if (fs.existsSync(tmpUsageFile)) fs.unlinkSync(tmpUsageFile)
    delete process.env.GOOGLE_PLACES_USAGE_FILE
    delete process.env.GOOGLE_PLACES_DAILY_CAP
    delete process.env.GOOGLE_PLACES_MONTHLY_CAP
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

  // ── Plan 4 M2.3.5 — Local daily + monthly cap hard-stop ────────────────
  //
  // Google does not let us lower the per-day quota for Places API (New)
  // through the Cloud Console (Adjustable: No). The billing alert at
  // £5/month is a notification, not a stop. To bound bug loops + surprise
  // invoices, the wrapper enforces TWO local caps before any fetch call:
  //   - daily   (default 500 calls/local-calendar-day)
  //   - monthly (default 4,500 calls/local-calendar-month — sits under
  //              Google's 5,000 Text Search Pro free monthly events)
  //
  // Usage state is shaped for future source tracking:
  //   {
  //     "month": "2026-05",
  //     "monthTotal": 123,
  //     "monthBySource": { "admin_cli": 123 },
  //     "days": {
  //       "2026-05-14": { "total": 12, "bySource": { "admin_cli": 12 } }
  //     }
  //   }
  // Phase 1 = `admin_cli` only. A future merchant portal would call
  // `searchPlaces(query, { source: 'merchant_portal' })` and land in its
  // own `bySource` bucket — caps are TOTAL across sources.

  function todayLocalISO(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  function thisMonthLocalISO(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  it('LOCAL_DAILY_CAP_REACHED: refuses before fetch when today usage hits the default cap (500)', async () => {
    fs.writeFileSync(tmpUsageFile, JSON.stringify({
      month: thisMonthLocalISO(),
      monthTotal: 600,
      monthBySource: { admin_cli: 600 },
      days: { [todayLocalISO()]: { total: 500, bySource: { admin_cli: 500 } } },
    }))

    const fetchSpy = vi.spyOn(global, 'fetch')
    const result = await searchPlaces('anything')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('LOCAL_DAILY_CAP_REACHED')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('LOCAL_DAILY_CAP_REACHED: counters are NOT bumped when refused (no double-counting)', async () => {
    fs.writeFileSync(tmpUsageFile, JSON.stringify({
      month: thisMonthLocalISO(),
      monthTotal: 600,
      monthBySource: { admin_cli: 600 },
      days: { [todayLocalISO()]: { total: 500, bySource: { admin_cli: 500 } } },
    }))

    await searchPlaces('anything')

    const stored = JSON.parse(fs.readFileSync(tmpUsageFile, 'utf-8'))
    expect(stored.days[todayLocalISO()].total).toBe(500) // still 500
    expect(stored.monthTotal).toBe(600)                  // still 600
  })

  it('LOCAL_MONTHLY_CAP_REACHED: refuses before fetch when month usage hits the default cap (4500)', async () => {
    fs.writeFileSync(tmpUsageFile, JSON.stringify({
      month: thisMonthLocalISO(),
      monthTotal: 4500,
      monthBySource: { admin_cli: 4500 },
      days: { [todayLocalISO()]: { total: 5, bySource: { admin_cli: 5 } } },
    }))

    const fetchSpy = vi.spyOn(global, 'fetch')
    const result = await searchPlaces('anything')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('LOCAL_MONTHLY_CAP_REACHED')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('LOCAL_MONTHLY_CAP_REACHED: counters are NOT bumped when refused', async () => {
    fs.writeFileSync(tmpUsageFile, JSON.stringify({
      month: thisMonthLocalISO(),
      monthTotal: 4500,
      monthBySource: { admin_cli: 4500 },
      days: { [todayLocalISO()]: { total: 5, bySource: { admin_cli: 5 } } },
    }))

    await searchPlaces('anything')

    const stored = JSON.parse(fs.readFileSync(tmpUsageFile, 'utf-8'))
    expect(stored.days[todayLocalISO()].total).toBe(5)
    expect(stored.monthTotal).toBe(4500)
  })

  it('daily cap takes precedence when BOTH caps would trip', async () => {
    // Both at their cap — daily is checked first → DAILY error wins.
    // Pinning the order makes the user-facing message deterministic.
    fs.writeFileSync(tmpUsageFile, JSON.stringify({
      month: thisMonthLocalISO(),
      monthTotal: 4500,
      monthBySource: { admin_cli: 4500 },
      days: { [todayLocalISO()]: { total: 500, bySource: { admin_cli: 500 } } },
    }))

    const result = await searchPlaces('anything')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('LOCAL_DAILY_CAP_REACHED')
  })

  it('GOOGLE_PLACES_DAILY_CAP env var overrides the default daily cap (raise)', async () => {
    process.env.GOOGLE_PLACES_DAILY_CAP = '1000'
    fs.writeFileSync(tmpUsageFile, JSON.stringify({
      month: thisMonthLocalISO(),
      monthTotal: 700,
      monthBySource: { admin_cli: 700 },
      days: { [todayLocalISO()]: { total: 700, bySource: { admin_cli: 700 } } },
    }))

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ places: [] }),
    } as Response)

    const result = await searchPlaces('anything')
    // 700 < 1000 (env override), so the call goes through. NO_RESULTS because places=[].
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('NO_RESULTS')
  })

  it('GOOGLE_PLACES_MONTHLY_CAP env var overrides the default monthly cap (raise)', async () => {
    process.env.GOOGLE_PLACES_MONTHLY_CAP = '6000'
    fs.writeFileSync(tmpUsageFile, JSON.stringify({
      month: thisMonthLocalISO(),
      monthTotal: 4800,
      monthBySource: { admin_cli: 4800 },
      days: { [todayLocalISO()]: { total: 50, bySource: { admin_cli: 50 } } },
    }))

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ places: [] }),
    } as Response)

    const result = await searchPlaces('anything')
    // 4800 < 6000 (env override), so the call goes through.
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('NO_RESULTS')
  })

  it('GOOGLE_PLACES_DAILY_CAP env var can also LOWER the cap (must be respected)', async () => {
    process.env.GOOGLE_PLACES_DAILY_CAP = '3'
    fs.writeFileSync(tmpUsageFile, JSON.stringify({
      month: thisMonthLocalISO(),
      monthTotal: 3,
      monthBySource: { admin_cli: 3 },
      days: { [todayLocalISO()]: { total: 3, bySource: { admin_cli: 3 } } },
    }))

    const fetchSpy = vi.spyOn(global, 'fetch')
    const result = await searchPlaces('anything')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('LOCAL_DAILY_CAP_REACHED')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fresh (no usage file) successful call writes the full nested structure + admin_cli source bucket', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        places: [{ id: 'a', displayName: { text: 'A' }, formattedAddress: 'x', location: { latitude: 53.6, longitude: -1.8 }, types: [] }],
      }),
    } as Response)

    expect(fs.existsSync(tmpUsageFile)).toBe(false)
    await searchPlaces('Karaara')

    const stored = JSON.parse(fs.readFileSync(tmpUsageFile, 'utf-8'))
    expect(stored.month).toBe(thisMonthLocalISO())
    expect(stored.monthTotal).toBe(1)
    expect(stored.monthBySource).toEqual({ admin_cli: 1 })
    expect(stored.days[todayLocalISO()]).toEqual({ total: 1, bySource: { admin_cli: 1 } })
    // No leftover keys from prior days/months.
    expect(Object.keys(stored.days)).toEqual([todayLocalISO()])
  })

  it('date rollover within the same month: PRESERVES prior days entries, adds today, keeps monthTotal running', async () => {
    const yesterday = '2000-01-15'
    fs.writeFileSync(tmpUsageFile, JSON.stringify({
      month: thisMonthLocalISO(),  // same month
      monthTotal: 50,
      monthBySource: { admin_cli: 50 },
      days: { [yesterday]: { total: 50, bySource: { admin_cli: 50 } } },
    }))

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ places: [] }),
    } as Response)

    await searchPlaces('anything')

    const stored = JSON.parse(fs.readFileSync(tmpUsageFile, 'utf-8'))
    expect(stored.month).toBe(thisMonthLocalISO())
    expect(stored.monthTotal).toBe(51)                  // running total preserved + incremented
    expect(stored.monthBySource).toEqual({ admin_cli: 51 })
    expect(stored.days[yesterday]).toEqual({ total: 50, bySource: { admin_cli: 50 } }) // old day preserved
    expect(stored.days[todayLocalISO()]).toEqual({ total: 1, bySource: { admin_cli: 1 } })
  })

  it('month rollover: ENTIRELY replaces the structure (old days wiped)', async () => {
    fs.writeFileSync(tmpUsageFile, JSON.stringify({
      month: '2000-01',  // distant past month
      monthTotal: 999,
      monthBySource: { admin_cli: 999 },
      days: { '2000-01-15': { total: 999, bySource: { admin_cli: 999 } } },
    }))

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ places: [] }),
    } as Response)

    await searchPlaces('anything')

    const stored = JSON.parse(fs.readFileSync(tmpUsageFile, 'utf-8'))
    expect(stored.month).toBe(thisMonthLocalISO())
    expect(stored.monthTotal).toBe(1)
    expect(stored.monthBySource).toEqual({ admin_cli: 1 })
    expect(stored.days).toEqual({ [todayLocalISO()]: { total: 1, bySource: { admin_cli: 1 } } })
    // Critical: the 2000-01-15 entry MUST be gone — never accumulate across months.
    expect(stored.days['2000-01-15']).toBeUndefined()
  })

  it('treats malformed JSON in the usage file as a fresh start (no crash)', async () => {
    fs.writeFileSync(tmpUsageFile, 'this is not valid JSON {{{')

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ places: [] }),
    } as Response)

    const result = await searchPlaces('anything')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('NO_RESULTS')  // not a crash
    const stored = JSON.parse(fs.readFileSync(tmpUsageFile, 'utf-8'))
    expect(stored.monthTotal).toBe(1)
    expect(stored.days[todayLocalISO()].total).toBe(1)
  })

  it('API_KEY_MISSING short-circuits BEFORE bumping any counter (no waste)', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY

    const result = await searchPlaces('anything')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('API_KEY_MISSING')
    // No counter file should have been created — gate failed before bump.
    expect(fs.existsSync(tmpUsageFile)).toBe(false)
  })

  it('counters are bumped even when fetch rejects (a fetch attempt was made + may have been billed)', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network'))

    const result = await searchPlaces('Karaara')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('GOOGLE_UNAVAILABLE')
    // The increment fires BEFORE fetch — once we attempt a live call we
    // count it, even on transport failure. Belt-and-braces against
    // retry-storm bug loops.
    const stored = JSON.parse(fs.readFileSync(tmpUsageFile, 'utf-8'))
    expect(stored.monthTotal).toBe(1)
    expect(stored.days[todayLocalISO()].total).toBe(1)
    expect(stored.monthBySource).toEqual({ admin_cli: 1 })
  })

  it('source tracking: explicit source ("merchant_portal") lands in its own bySource bucket', async () => {
    // Phase 1 = admin_cli only. This test pins the contract so future
    // merchant-portal usage will accumulate in its own bucket without
    // needing to change the wrapper signature.
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ places: [] }),
    } as Response)

    // First call: admin_cli (default)
    await searchPlaces('q1')
    // Second call: explicit merchant_portal source — forward-compat hook
    await searchPlaces('q2', { source: 'merchant_portal' })

    const stored = JSON.parse(fs.readFileSync(tmpUsageFile, 'utf-8'))
    expect(stored.monthTotal).toBe(2)
    expect(stored.monthBySource).toEqual({ admin_cli: 1, merchant_portal: 1 })
    expect(stored.days[todayLocalISO()].total).toBe(2)
    expect(stored.days[todayLocalISO()].bySource).toEqual({ admin_cli: 1, merchant_portal: 1 })
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

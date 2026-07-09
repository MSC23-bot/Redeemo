// tests/api/lib/googleStaticMap.test.ts
//
// Branch Location Trust Slice 3 (spec 2026-07-09 pin-drop addendum §7 option (d)):
// the backend-proxied static-map fetch. Pins the two security-critical properties:
//   1. DARK BY DEFAULT: with no GOOGLE_MAPS_API_KEY, it returns API_KEY_MISSING and
//      NEVER constructs a provider request (no fetch).
//   2. KEY NEVER IN THE CLIENT-FACING RESPONSE: the key rides ONLY in the
//      server-side request URL to Google; the returned bytes are the image only.
// Plus the usage-cap circuit-breaker (cost bound) and the in-process cache.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as os from 'node:os'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fetchStaticMap, _clearStaticMapCache } from '../../../src/api/lib/googleStaticMap'

const CENTER = { centerLat: 53.6463, centerLng: -1.7809 }
const TEST_KEY = 'AIza-TEST-SECRET-KEY-should-never-leak'
// A tiny fake "PNG" body — 1x1 transparent-ish bytes; must NOT contain the key.
const FAKE_IMAGE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

let usageFile: string
let savedKey: string | undefined
let savedDaily: string | undefined
let savedUsage: string | undefined

beforeEach(() => {
  _clearStaticMapCache()
  savedKey = process.env.GOOGLE_MAPS_API_KEY
  savedDaily = process.env.GOOGLE_STATIC_MAP_DAILY_CAP
  savedUsage = process.env.GOOGLE_STATIC_MAP_USAGE_FILE
  // Isolate usage state to a temp file so tests never touch the repo .cache.
  usageFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'staticmap-')), 'usage.json')
  process.env.GOOGLE_STATIC_MAP_USAGE_FILE = usageFile
  delete process.env.GOOGLE_STATIC_MAP_DAILY_CAP
})

afterEach(() => {
  vi.restoreAllMocks()
  if (savedKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY; else process.env.GOOGLE_MAPS_API_KEY = savedKey
  if (savedDaily === undefined) delete process.env.GOOGLE_STATIC_MAP_DAILY_CAP; else process.env.GOOGLE_STATIC_MAP_DAILY_CAP = savedDaily
  if (savedUsage === undefined) delete process.env.GOOGLE_STATIC_MAP_USAGE_FILE; else process.env.GOOGLE_STATIC_MAP_USAGE_FILE = savedUsage
})

describe('fetchStaticMap — dark by default (no key)', () => {
  it('returns API_KEY_MISSING and NEVER constructs a provider request', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY
    const fetchSpy = vi.spyOn(global, 'fetch')

    const res = await fetchStaticMap(CENTER)

    expect(res).toEqual({ ok: false, error: 'API_KEY_MISSING' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('fetchStaticMap — key server-side only', () => {
  it('sends the key in the SERVER-SIDE request URL but never in the returned bytes', async () => {
    process.env.GOOGLE_MAPS_API_KEY = TEST_KEY
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'image/png' : null) },
      arrayBuffer: async () => FAKE_IMAGE,
    } as unknown as Response)

    const res = await fetchStaticMap(CENTER)

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('expected ok')
    expect(res.contentType).toBe('image/png')
    // The key WAS sent to Google (server-side).
    const calledUrl = String(fetchSpy.mock.calls[0][0])
    expect(calledUrl).toContain('maps.googleapis.com/maps/api/staticmap')
    expect(calledUrl).toContain(encodeURIComponent(TEST_KEY))
    // The client-facing body is the image bytes ONLY — the key is nowhere in it.
    expect(res.body.toString('binary')).not.toContain(TEST_KEY)
    expect(res.body.equals(FAKE_IMAGE)).toBe(true)
  })

  it('caches within TTL so a repeated centroid does not re-bill (second call: no fetch)', async () => {
    process.env.GOOGLE_MAPS_API_KEY = TEST_KEY
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => FAKE_IMAGE,
    } as unknown as Response)

    await fetchStaticMap(CENTER)
    await fetchStaticMap(CENTER)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('fetchStaticMap — usage cap circuit-breaker', () => {
  it('refuses BEFORE fetch when the daily cap is 0 (cost bound)', async () => {
    process.env.GOOGLE_MAPS_API_KEY = TEST_KEY
    process.env.GOOGLE_STATIC_MAP_DAILY_CAP = '0'
    const fetchSpy = vi.spyOn(global, 'fetch')

    const res = await fetchStaticMap(CENTER)

    expect(res).toEqual({ ok: false, error: 'LOCAL_DAILY_CAP_REACHED' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('fetchStaticMap — provider failures collapse to typed errors', () => {
  it('maps a 429 to QUOTA_EXCEEDED', async () => {
    process.env.GOOGLE_MAPS_API_KEY = TEST_KEY
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 429, headers: { get: () => null } } as unknown as Response)
    expect(await fetchStaticMap(CENTER)).toEqual({ ok: false, error: 'QUOTA_EXCEEDED' })
  })

  it('maps a transport error to GOOGLE_UNAVAILABLE', async () => {
    process.env.GOOGLE_MAPS_API_KEY = TEST_KEY
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network'))
    expect(await fetchStaticMap(CENTER)).toEqual({ ok: false, error: 'GOOGLE_UNAVAILABLE' })
  })
})

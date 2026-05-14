// tests/api/customer/discovery/uk-wide-coverage.test.ts
//
// Plan 4 M1.25 — UK-wide postcode-resolution coverage smoke test.
//
// Six test postcodes, one per UK nation / admin shape:
//   - England (West Yorkshire LAD)        — HD1 2PY (Huddersfield)
//   - England (Essex, East of England)    — CO7 0UB (Brightlingsea)
//   - England (London region)             — NW2 7UD (Brent)
//   - Scotland (no admin county / region) — G1 1AA  (Glasgow)
//   - Wales (no admin county / region)    — CF10 1EP (Cardiff)
//   - Northern Ireland                    — BT1 5GS (Belfast)
//
// postcodes.io is mocked by default. Set RUN_LIVE=1 to hit the real API
// (manual verification only — slow + rate-limited).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolvePostcode } from '../../../../src/api/lib/postcodeResolver'

describe('UK-wide postcode resolution coverage', () => {
  const cases: Array<{
    postcode: string
    expectCountry: 'England' | 'Scotland' | 'Wales' | 'Northern Ireland'
    expectAdminCounty: string | null
    expectRegion: string | null
  }> = [
    { postcode: 'HD1 2PY',  expectCountry: 'England',          expectAdminCounty: 'West Yorkshire', expectRegion: 'Yorkshire and the Humber' },
    { postcode: 'CO7 0UB',  expectCountry: 'England',          expectAdminCounty: 'Essex',          expectRegion: 'East of England' },
    { postcode: 'NW2 7UD',  expectCountry: 'England',          expectAdminCounty: null,             expectRegion: 'London' },
    { postcode: 'G1 1AA',   expectCountry: 'Scotland',         expectAdminCounty: null,             expectRegion: null },
    { postcode: 'CF10 1EP', expectCountry: 'Wales',            expectAdminCounty: null,             expectRegion: null },
    { postcode: 'BT1 5GS',  expectCountry: 'Northern Ireland', expectAdminCounty: null,             expectRegion: null },
  ]

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  for (const c of cases) {
    it(`resolves ${c.postcode} → country=${c.expectCountry}, county=${c.expectAdminCounty ?? 'null'}, region=${c.expectRegion ?? 'null'}`, async () => {
      // Use real postcodes.io if RUN_LIVE=1, else mock.
      if (!process.env.RUN_LIVE) {
        vi.spyOn(global, 'fetch').mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => ({
            status: 200,
            result: {
              postcode: c.postcode,
              country: c.expectCountry,
              region: c.expectRegion,
              admin_district: 'TestLAD',
              admin_county: c.expectAdminCounty,
              parish: null,
              admin_ward: null,
              parliamentary_constituency: 'TestConstituency',
              latitude: 51, longitude: -1,
            },
          }),
        } as Response)
      }

      const r = await resolvePostcode(c.postcode)
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.snapshot.country).toBe(c.expectCountry)
        expect(r.snapshot.adminCounty).toBe(c.expectAdminCounty)
        expect(r.snapshot.region).toBe(c.expectRegion)
      }
    })
  }
})

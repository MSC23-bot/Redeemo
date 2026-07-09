import { describe, it, expect } from 'vitest'
import { CONFIRMED_LOCATION_SET, isBranchLocationConfirmed } from '../../../src/api/shared/location'

// Phase 2 Slice 1 M4 — shared confirmed-location helper.
//
// Pins the constant + the membership predicate that discovery ranking
// (`classifyRung`) and the home/search rail partitions now consume. The
// partition pin is the load-bearing one: it locks CONFIRMED_LOCATION_SET across
// the whole LocationConfidence enum, so the constant can't silently widen/narrow
// and change every discovery/ranking consumer at once.
//
// Branch Location Trust Slice 3 (spec 2026-07-09 pin-drop addendum §2): the set
// widens by exactly ONE tier, MERCHANT_CONFIRMED (the weakest confirmed member;
// a merchant self-set pin). POSTCODE_CENTROID + NEEDS_REVIEW stay unconfirmed
// (L3: never expose lat/lng to customers).

describe('M4/Slice3 — CONFIRMED_LOCATION_SET / isBranchLocationConfirmed', () => {
  it('CONFIRMED_LOCATION_SET is exactly { MANUALLY_CONFIRMED, ADDRESS_GEOCODED, MERCHANT_CONFIRMED }', () => {
    expect([...CONFIRMED_LOCATION_SET].sort()).toEqual([
      'ADDRESS_GEOCODED', 'MANUALLY_CONFIRMED', 'MERCHANT_CONFIRMED',
    ])
  })

  it('true for the three confirmed confidences', () => {
    expect(isBranchLocationConfirmed({ locationConfidence: 'MANUALLY_CONFIRMED' })).toBe(true)
    expect(isBranchLocationConfirmed({ locationConfidence: 'ADDRESS_GEOCODED' })).toBe(true)
    expect(isBranchLocationConfirmed({ locationConfidence: 'MERCHANT_CONFIRMED' })).toBe(true)
  })

  it('false for the two unconfirmed confidences (L3: coordinates stay redacted from customers)', () => {
    expect(isBranchLocationConfirmed({ locationConfidence: 'POSTCODE_CENTROID' })).toBe(false)
    expect(isBranchLocationConfirmed({ locationConfidence: 'NEEDS_REVIEW' })).toBe(false)
  })

  it('false for null / undefined / unknown values', () => {
    expect(isBranchLocationConfirmed({ locationConfidence: null })).toBe(false)
    expect(isBranchLocationConfirmed({ locationConfidence: undefined })).toBe(false)
    expect(isBranchLocationConfirmed({})).toBe(false)
    expect(isBranchLocationConfirmed({ locationConfidence: 'SOMETHING_ELSE' })).toBe(false)
  })

  it('partitions the full 5-value LocationConfidence enum into exactly the confirmed trio', () => {
    const ALL = ['MANUALLY_CONFIRMED', 'ADDRESS_GEOCODED', 'MERCHANT_CONFIRMED', 'POSTCODE_CENTROID', 'NEEDS_REVIEW']
    const confirmed = ALL.filter((c) => isBranchLocationConfirmed({ locationConfidence: c }))
    expect(confirmed).toEqual(['MANUALLY_CONFIRMED', 'ADDRESS_GEOCODED', 'MERCHANT_CONFIRMED'])
  })
})

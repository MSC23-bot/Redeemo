import { describe, it, expect } from 'vitest'
import { CONFIRMED_LOCATION_SET, isBranchLocationConfirmed } from '../../../src/api/shared/location'

// Phase 2 Slice 1 M4 — shared confirmed-location helper.
//
// Pins the constant + the membership predicate that discovery ranking
// (`classifyRung`) and the home/search rail partitions now consume. The
// 4-value partition pin is the load-bearing one: it locks
// CONFIRMED_LOCATION_SET to exactly { MANUALLY_CONFIRMED, ADDRESS_GEOCODED }
// across the whole LocationConfidence enum, so the constant can't silently
// widen/narrow and change every discovery/ranking consumer at once.

describe('M4 — CONFIRMED_LOCATION_SET / isBranchLocationConfirmed', () => {
  it('CONFIRMED_LOCATION_SET is exactly { MANUALLY_CONFIRMED, ADDRESS_GEOCODED }', () => {
    expect([...CONFIRMED_LOCATION_SET].sort()).toEqual(['ADDRESS_GEOCODED', 'MANUALLY_CONFIRMED'])
  })

  it('true for the two confirmed confidences', () => {
    expect(isBranchLocationConfirmed({ locationConfidence: 'MANUALLY_CONFIRMED' })).toBe(true)
    expect(isBranchLocationConfirmed({ locationConfidence: 'ADDRESS_GEOCODED' })).toBe(true)
  })

  it('false for the two unconfirmed confidences (preserves PR #81 list admission downstream)', () => {
    expect(isBranchLocationConfirmed({ locationConfidence: 'POSTCODE_CENTROID' })).toBe(false)
    expect(isBranchLocationConfirmed({ locationConfidence: 'NEEDS_REVIEW' })).toBe(false)
  })

  it('false for null / undefined / unknown values', () => {
    expect(isBranchLocationConfirmed({ locationConfidence: null })).toBe(false)
    expect(isBranchLocationConfirmed({ locationConfidence: undefined })).toBe(false)
    expect(isBranchLocationConfirmed({})).toBe(false)
    expect(isBranchLocationConfirmed({ locationConfidence: 'SOMETHING_ELSE' })).toBe(false)
  })

  it('partitions the full 4-value LocationConfidence enum into exactly the confirmed pair', () => {
    const ALL = ['MANUALLY_CONFIRMED', 'ADDRESS_GEOCODED', 'POSTCODE_CENTROID', 'NEEDS_REVIEW']
    const confirmed = ALL.filter((c) => isBranchLocationConfirmed({ locationConfidence: c }))
    expect(confirmed).toEqual(['MANUALLY_CONFIRMED', 'ADDRESS_GEOCODED'])
  })
})

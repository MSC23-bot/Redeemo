/**
 * PR-1 F1 tests for lib/branches/withRedeemo.ts.
 *
 * isWithRedeemo is the PER-BRANCH predicate: a branch is "with Redeemo" iff it is
 * active AND its location is manually confirmed. The merchant-lifecycle gate (the
 * merchant must be Live) is applied separately at F2 via lib/auth/lifecycle.ts;
 * F1 only exports this per-branch predicate.
 */
import { isWithRedeemo } from '../withRedeemo'
import type { Branch } from '@/lib/api/branch'

function branch(over: Partial<Branch>): Branch {
  return { id: 'b1', name: 'Main', ...over } as Branch
}

describe('isWithRedeemo', () => {
  it('is true when isActive === true AND locationConfidence === MANUALLY_CONFIRMED', () => {
    expect(isWithRedeemo(branch({ isActive: true, locationConfidence: 'MANUALLY_CONFIRMED' }))).toBe(true)
  })

  it('is false when isActive is false', () => {
    expect(isWithRedeemo(branch({ isActive: false, locationConfidence: 'MANUALLY_CONFIRMED' }))).toBe(false)
  })

  it('is false when locationConfidence is not MANUALLY_CONFIRMED', () => {
    expect(isWithRedeemo(branch({ isActive: true, locationConfidence: 'POSTCODE_CENTROID' }))).toBe(false)
    expect(isWithRedeemo(branch({ isActive: true, locationConfidence: 'ADDRESS_GEOCODED' }))).toBe(false)
    expect(isWithRedeemo(branch({ isActive: true, locationConfidence: 'NEEDS_REVIEW' }))).toBe(false)
  })

  it('is false when isActive is absent (undefined !== true)', () => {
    expect(isWithRedeemo(branch({ locationConfidence: 'MANUALLY_CONFIRMED' }))).toBe(false)
  })

  it('is false when locationConfidence is absent/null', () => {
    expect(isWithRedeemo(branch({ isActive: true, locationConfidence: null }))).toBe(false)
    expect(isWithRedeemo(branch({ isActive: true }))).toBe(false)
  })
})

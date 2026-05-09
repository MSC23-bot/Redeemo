import { deriveInitialOpenWriteFor } from '@/features/merchant/utils/initialOpenWriteFor'

// PR-C T11 (LOCKED 2026-05-09 §0.3): URL → InitialOpenWriteFor
// mapping.  The helper drives ReviewsTab's auto-open + verified-
// banner from URL params written by SuccessPopup's Rate & Review
// CTA (T13).

describe('deriveInitialOpenWriteFor', () => {
  it('returns the open target when openWriteReview="1" + branch + fromRedemption are all set', () => {
    expect(deriveInitialOpenWriteFor({
      branch: 'b-1',
      openWriteReview: '1',
      fromRedemption: 'red-1',
    })).toEqual({ branchId: 'b-1', redemptionId: 'red-1' })
  })

  it('returns the open target WITHOUT redemptionId when fromRedemption is absent', () => {
    expect(deriveInitialOpenWriteFor({
      branch: 'b-1',
      openWriteReview: '1',
    })).toEqual({ branchId: 'b-1' })
  })

  it('returns null when openWriteReview is not "1"', () => {
    expect(deriveInitialOpenWriteFor({
      branch: 'b-1',
      openWriteReview: 'true',  // anything other than literal "1" → no auto-open
      fromRedemption: 'red-1',
    })).toBeNull()
  })

  it('returns null when openWriteReview is absent', () => {
    expect(deriveInitialOpenWriteFor({
      branch: 'b-1',
      fromRedemption: 'red-1',
    })).toBeNull()
  })

  it('returns null when branch is absent (cannot target a specific branch)', () => {
    expect(deriveInitialOpenWriteFor({
      openWriteReview: '1',
      fromRedemption: 'red-1',
    })).toBeNull()
  })

  it('returns null on entirely empty params (defensive)', () => {
    expect(deriveInitialOpenWriteFor({})).toBeNull()
  })

  it('handles array-shaped params (Expo Router can deliver string | string[])', () => {
    expect(deriveInitialOpenWriteFor({
      branch: ['b-1', 'b-2'],
      openWriteReview: ['1'],
      fromRedemption: ['red-1'],
    })).toEqual({ branchId: 'b-1', redemptionId: 'red-1' })
  })

  it('does NOT accept "0" as openWriteReview (pin against stale flag)', () => {
    expect(deriveInitialOpenWriteFor({
      branch: 'b-1',
      openWriteReview: '0',
      fromRedemption: 'red-1',
    })).toBeNull()
  })

  it('does NOT accept empty-string openWriteReview', () => {
    expect(deriveInitialOpenWriteFor({
      branch: 'b-1',
      openWriteReview: '',
    })).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import {
  serializeReviewBranch,
  parseStagedSuggestion,
  type ReviewBranchRow,
} from '../../../../src/api/admin/approvals/reviewBranchSerializer'

const baseRow: ReviewBranchRow = {
  id: 'branch-1',
  name: 'Iron Forge Gym',
  isMainBranch: true,
  isActive: true,
  addressLine1: '1 Forge Lane',
  addressLine2: null,
  city: 'Huddersfield',
  postcode: 'HD1 1AA',
  localityName: 'Huddersfield',
  locationConfidence: 'ADDRESS_GEOCODED',
  latitude: 53.6458,
  longitude: -1.785,
  googlePlaceId: 'place-123',
}

describe('serializeReviewBranch', () => {
  it('passes existing fields through and coerces Decimal-like coords to number', () => {
    // Prisma Decimal stringifies; simulate that here.
    const out = serializeReviewBranch(
      { ...baseRow, latitude: '53.6458' as unknown, longitude: '-1.7850' as unknown },
      null,
    )
    expect(out.id).toBe('branch-1')
    expect(out.locationConfidence).toBe('ADDRESS_GEOCODED')
    expect(out.latitude).toBeCloseTo(53.6458, 4)
    expect(out.longitude).toBeCloseTo(-1.785, 4)
    expect(out.googlePlaceId).toBe('place-123')
    expect(out.locationSuggestion).toBeNull()
  })

  it('nulls out missing coordinates', () => {
    const out = serializeReviewBranch(
      { ...baseRow, latitude: null, longitude: null, googlePlaceId: null },
      null,
    )
    expect(out.latitude).toBeNull()
    expect(out.longitude).toBeNull()
    expect(out.googlePlaceId).toBeNull()
  })

  it('attaches a staged suggestion when supplied', () => {
    const out = serializeReviewBranch(baseRow, {
      placeId: 'place-999',
      latitude: 53.7,
      longitude: -1.8,
      postcode: 'HD2 2BB',
    })
    expect(out.locationSuggestion).toEqual({
      placeId: 'place-999',
      latitude: 53.7,
      longitude: -1.8,
      postcode: 'HD2 2BB',
    })
  })

  it('never emits a redemptionPin field', () => {
    const out = serializeReviewBranch(baseRow, null) as unknown as Record<string, unknown>
    expect('redemptionPin' in out).toBe(false)
  })
})

describe('parseStagedSuggestion', () => {
  it('extracts the flat suggestion from BRANCH_CREATED audit metadata', () => {
    const metadata = {
      merchantId: 'm-1',
      staged: true,
      locationSuggestion: {
        placeId: 'place-999',
        latitude: 53.7,
        longitude: -1.8,
        postcode: 'HD2 2BB',
        source: 'merchant_portal_google',
      },
    }
    expect(parseStagedSuggestion(metadata)).toEqual({
      placeId: 'place-999',
      latitude: 53.7,
      longitude: -1.8,
      postcode: 'HD2 2BB',
    })
  })

  it('coerces string coords and tolerates a null postcode', () => {
    const metadata = {
      locationSuggestion: {
        placeId: 'place-999',
        latitude: '53.7',
        longitude: '-1.8',
        postcode: null,
      },
    }
    expect(parseStagedSuggestion(metadata)).toEqual({
      placeId: 'place-999',
      latitude: 53.7,
      longitude: -1.8,
      postcode: null,
    })
  })

  it('returns null for missing / malformed metadata', () => {
    expect(parseStagedSuggestion(null)).toBeNull()
    expect(parseStagedSuggestion(undefined)).toBeNull()
    expect(parseStagedSuggestion({})).toBeNull()
    expect(parseStagedSuggestion({ locationSuggestion: null })).toBeNull()
    expect(parseStagedSuggestion({ locationSuggestion: { latitude: 1, longitude: 2 } })).toBeNull()
    expect(
      parseStagedSuggestion({ locationSuggestion: { placeId: 'p', latitude: 'x', longitude: 2 } }),
    ).toBeNull()
  })
})

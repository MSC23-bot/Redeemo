import { describe, it, expect } from 'vitest'
import {
  serializeReviewBranch,
  parseStagedSuggestion,
  STAGED_SUGGESTION_AUDIT_EVENTS,
  parsePendingEditSuggestion,
  reviewBranchSelect,
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

  it('attaches a staged suggestion (with its source) when supplied', () => {
    const out = serializeReviewBranch(baseRow, {
      placeId: 'place-999',
      latitude: 53.7,
      longitude: -1.8,
      postcode: 'HD2 2BB',
      source: 'pending_edit',
    })
    expect(out.locationSuggestion).toEqual({
      placeId: 'place-999',
      latitude: 53.7,
      longitude: -1.8,
      postcode: 'HD2 2BB',
      source: 'pending_edit',
    })
  })

  it('never emits a redemptionPin field', () => {
    const out = serializeReviewBranch(baseRow, null) as unknown as Record<string, unknown>
    expect('redemptionPin' in out).toBe(false)
  })
})

describe('reviewBranchSelect (Prisma projection)', () => {
  it('NEVER selects redemptionPin (the encrypted PIN stays out of admin reads)', () => {
    // Security seam: the encrypted Branch.redemptionPin is revealed only via the
    // guarded PIN routes, never in a list/read payload. This pins the projection.
    expect('redemptionPin' in reviewBranchSelect).toBe(false)
  })

  it('selects exactly the DTO fields (no accidental sensitive-column drift)', () => {
    // The select must be the DTO field-set minus locationSuggestion (which is not a
    // Branch column but assembled from the staged-suggestion lanes). Any NEW key
    // here is a deliberate choice a reviewer must see — especially a sensitive one.
    expect(Object.keys(reviewBranchSelect).sort()).toEqual(
      [
        'id', 'name', 'isMainBranch', 'isActive', 'addressLine1', 'addressLine2',
        'city', 'postcode', 'localityName', 'locationConfidence',
        'latitude', 'longitude', 'googlePlaceId',
      ].sort(),
    )
    // Positive: the admin-scope provenance fields ARE selected.
    expect(reviewBranchSelect.latitude).toBe(true)
    expect(reviewBranchSelect.longitude).toBe(true)
    expect(reviewBranchSelect.googlePlaceId).toBe(true)
  })
})

describe('parseStagedSuggestion', () => {
  it('extracts the flat suggestion from BRANCH_CREATED audit metadata (tagged branch_created_audit)', () => {
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
      source: 'branch_created_audit',
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
      source: 'branch_created_audit',
    })
  })

  it('returns null for missing / malformed metadata', () => {
    expect(parseStagedSuggestion(null)).toBeNull()
    expect(parseStagedSuggestion(undefined)).toBeNull()
    expect(parseStagedSuggestion({})).toBeNull()
    expect(parseStagedSuggestion({ locationSuggestion: null })).toBeNull()
    expect(parseStagedSuggestion({ locationSuggestion: { latitude: 1, longitude: 2 } })).toBeNull()
    expect(parseStagedSuggestion({ locationSuggestion: { placeId: '', latitude: 1, longitude: 2 } })).toBeNull()
    expect(
      parseStagedSuggestion({ locationSuggestion: { placeId: 'p', latitude: 'x', longitude: 2 } }),
    ).toBeNull()
  })
})

describe('parsePendingEditSuggestion', () => {
  it('extracts the suggestion from proposedChanges.__locationSuggestion (tagged pending_edit)', () => {
    // Mirrors the Slice 1b writer shape (branch/service.ts locationSuggestionMetadata).
    const proposedChanges = {
      addressLine1: 'New address',
      postcode: 'HD1 2PY',
      locationConfidence: 'POSTCODE_CENTROID',
      __locationSuggestion: {
        placeId: 'place-google-1',
        latitude: 53.6463,
        longitude: -1.7809,
        postcode: 'HD1 2PY',
        source: 'merchant_portal_google',
      },
    }
    expect(parsePendingEditSuggestion(proposedChanges)).toEqual({
      placeId: 'place-google-1',
      latitude: 53.6463,
      longitude: -1.7809,
      postcode: 'HD1 2PY',
      source: 'pending_edit',
    })
  })

  it('returns null when no suggestion sub-key is staged (identity-only / photo edit)', () => {
    expect(parsePendingEditSuggestion(null)).toBeNull()
    expect(parsePendingEditSuggestion(undefined)).toBeNull()
    expect(parsePendingEditSuggestion({})).toBeNull()
    expect(parsePendingEditSuggestion({ addressLine1: 'x' })).toBeNull()
    expect(parsePendingEditSuggestion({ __locationSuggestion: null })).toBeNull()
  })

  it('degrades gracefully on a malformed blob (never a partial suggestion, never a throw)', () => {
    // Same defensive posture as editApplier.applyLocationTrust: missing placeId,
    // empty placeId, or non-finite coords all mean "no suggestion".
    expect(parsePendingEditSuggestion({ __locationSuggestion: { latitude: 1, longitude: 2 } })).toBeNull()
    expect(
      parsePendingEditSuggestion({ __locationSuggestion: { placeId: '', latitude: 1, longitude: 2 } }),
    ).toBeNull()
    expect(
      parsePendingEditSuggestion({ __locationSuggestion: { placeId: 'p', latitude: 'nope', longitude: 2 } }),
    ).toBeNull()
  })
})

describe('STAGED_SUGGESTION_AUDIT_EVENTS', () => {
  it('pins the two audit suggestion lanes and their source tags', () => {
    // BRANCH_CREATED = create lane (Slice 1); BRANCH_UPDATED = draft-window direct
    // edit lane (Slice 1b, stamps NEEDS_REVIEW immediately on a failed cross-check).
    // The reviewed-edit lane is NOT an audit read: it surfaces via the OPEN
    // BranchPendingEdit (parsePendingEditSuggestion) and wins precedence.
    expect(STAGED_SUGGESTION_AUDIT_EVENTS).toEqual({
      BRANCH_CREATED: 'branch_created_audit',
      BRANCH_UPDATED: 'branch_updated_audit',
    })
  })

  it('parseStagedSuggestion tags the caller-supplied audit source', () => {
    const metadata = {
      locationSuggestion: { placeId: 'place-77', latitude: 53.7, longitude: -1.8, postcode: 'HD2 2BB' },
    }
    expect(parseStagedSuggestion(metadata, 'branch_updated_audit')).toEqual({
      placeId: 'place-77',
      latitude: 53.7,
      longitude: -1.8,
      postcode: 'HD2 2BB',
      source: 'branch_updated_audit',
    })
    // Default stays the create-lane tag (back-compat with existing call sites).
    expect(parseStagedSuggestion(metadata)?.source).toBe('branch_created_audit')
  })
})

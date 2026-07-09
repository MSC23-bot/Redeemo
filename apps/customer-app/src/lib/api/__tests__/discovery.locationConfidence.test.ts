import { branchTileSchema } from '../discovery'

// Branch Location Trust Slice 3 forward-compat guard.
//
// discovery.ts previously parsed `branchLocationConfidence` with a CLOSED
// `z.enum` of four values. Any future backend confidence value (the planned
// MERCHANT_CONFIRMED, or anything after it) would then make an already-installed
// app build reject the WHOLE discovery payload, degrading the feed until the app
// updates through the store. The field is now an OPEN `z.string()` so unknown
// future values pass through untouched.
//
// See docs/superpowers/specs/2026-07-09-loc-slice-3-pin-drop-addendum.md §3.3 (option A).

// Minimal valid branch tile; only `branchLocationConfidence` varies per case.
function makeBranchTile(locationConfidence: string) {
  return {
    id:                       'branch-1',
    branchName:               'Test Branch',
    branchLocalityId:         null,
    branchLocalityName:       null,
    branchPostTown:           null,
    branchCity:               null,
    branchLatitude:           null,
    branchLongitude:          null,
    branchLocationConfidence: locationConfidence,
    isOpenNow:                true,
    closesAtLocal:            null,
    distance:                 null,
    isFavourited:             false,
    avgRating:                null,
    reviewCount:              0,
    supplyRung:               null,
    proximityBand:            null,
    distanceMetres:           null,
    merchant: {
      id:                   'merchant-1',
      businessName:         'Test Merchant',
      tradingName:          null,
      logoUrl:              null,
      bannerUrl:            null,
      primaryCategory:      null,
      primaryDescriptorTag: null,
      subcategory:          null,
      descriptor:           'Cafe',
      highlights:           [],
      voucherCount:         1,
      maxEstimatedSaving:   null,
      totalEstimatedSaving: null,
    },
  }
}

describe('discovery branchTileSchema — locationConfidence forward-compat tolerance', () => {
  it('parses the known confidence values', () => {
    for (const value of [
      'MANUALLY_CONFIRMED',
      'POSTCODE_CENTROID',
      'NEEDS_REVIEW',
      'ADDRESS_GEOCODED',
    ]) {
      const result = branchTileSchema.safeParse(makeBranchTile(value))
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.branchLocationConfidence).toBe(value)
      }
    }
  })

  it('parses the planned MERCHANT_CONFIRMED value (must ship AHEAD of the backend enum add)', () => {
    const result = branchTileSchema.safeParse(makeBranchTile('MERCHANT_CONFIRMED'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.branchLocationConfidence).toBe('MERCHANT_CONFIRMED')
    }
  })

  it('parses an arbitrary future confidence string without rejecting the payload', () => {
    const result = branchTileSchema.safeParse(makeBranchTile('SOME_FUTURE_VALUE_XYZ'))
    expect(result.success).toBe(true)
    if (result.success) {
      // Value passes through untouched; no UI consumer branches on it (redaction
      // of branch position happens upstream on the backend), so the safe default
      // path is simply that discovery keeps rendering the tile.
      expect(result.data.branchLocationConfidence).toBe('SOME_FUTURE_VALUE_XYZ')
    }
  })
})

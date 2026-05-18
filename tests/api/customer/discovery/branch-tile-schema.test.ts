import { describe, it, expect } from 'vitest'
import { branchTileSchema } from '../../../../src/api/customer/discovery/branchTileSchema'

describe('branchTileSchema', () => {
  const validTile = {
    id: 'brn_covelum_brightlingsea',
    branchName: 'Brightlingsea',
    branchLocalityId: 'loc_brightlingsea',
    branchLocalityName: 'Brightlingsea',
    branchPostTown: 'Brightlingsea',
    branchCity: 'Essex',
    branchLatitude: 51.811,
    branchLongitude: 1.027,
    branchLocationConfidence: 'MANUALLY_CONFIRMED',
    isOpenNow: true,
    closesAtLocal: '22:30',
    distance: 1240,
    isFavourited: false,
    avgRating: 4.6,
    reviewCount: 17,
    supplyRung: 'NEARBY',
    proximityBand: 'NEARBY',
    distanceMetres: 1240,
    merchant: {
      id: 'mer_covelum',
      businessName: 'Covelum',
      tradingName: null,
      logoUrl: 'https://cdn.example/logo.png',
      bannerUrl: 'https://cdn.example/banner.png',
      primaryCategory: null,
      primaryDescriptorTag: null,
      subcategory: null,
      descriptor: 'Indian restaurant',
      highlights: [],
      voucherCount: 2,
      maxEstimatedSaving: 15,
    },
  }

  it('accepts a fully-populated valid tile', () => {
    expect(() => branchTileSchema.parse(validTile)).not.toThrow()
  })

  it('accepts a POSTCODE_CENTROID tile with null coords + null distance', () => {
    const redacted = {
      ...validTile,
      branchLatitude: null,
      branchLongitude: null,
      branchLocationConfidence: 'POSTCODE_CENTROID' as const,
      distance: null,
      distanceMetres: null,
      supplyRung: null,
      proximityBand: null,
    }
    expect(() => branchTileSchema.parse(redacted)).not.toThrow()
  })

  it('rejects a tile that omits id', () => {
    const { id: _id, ...withoutId } = validTile
    expect(() => branchTileSchema.parse(withoutId)).toThrow(/id/)
  })

  it('rejects a tile that includes branchAddressLine1 (locality-only contract)', () => {
    const withAddress = { ...validTile, branchAddressLine1: '23 High St' }
    expect(() => branchTileSchema.parse(withAddress)).toThrow(/branchAddressLine1/)
  })

  // Drift-catching parametric tests.  If a SupplyRung / LocationConfidence
  // value is added or removed at the source-of-truth, these surface the
  // drift immediately rather than waiting for a downstream consumer to fail.

  it.each([
    'NEARBY', 'CATCHMENT', 'POST_TOWN', 'LAD',
    'COUNTY', 'REGION', 'COUNTRY', 'NATIONAL',
  ] as const)('accepts supplyRung=%s', (rung) => {
    expect(() => branchTileSchema.parse({ ...validTile, supplyRung: rung })).not.toThrow()
  })

  it.each([
    'MANUALLY_CONFIRMED', 'POSTCODE_CENTROID', 'NEEDS_REVIEW', 'ADDRESS_GEOCODED',
  ] as const)('accepts branchLocationConfidence=%s', (lc) => {
    expect(() => branchTileSchema.parse({ ...validTile, branchLocationConfidence: lc })).not.toThrow()
  })

  it('rejects branchLocationConfidence with an unknown value', () => {
    expect(() => branchTileSchema.parse({ ...validTile, branchLocationConfidence: 'WHATEVER' })).toThrow()
  })

  it('rejects a tile with merchant: null (grouping is required)', () => {
    expect(() => branchTileSchema.parse({ ...validTile, merchant: null })).toThrow()
  })

  it('rejects merchant.highlights: null (must be array)', () => {
    expect(() =>
      branchTileSchema.parse({
        ...validTile,
        merchant: { ...validTile.merchant, highlights: null },
      }),
    ).toThrow()
  })
})

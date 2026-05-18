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
})

import { branchToMerchantTileProps } from '../../../../src/features/search/utils/branchToMerchantTile'
import type { BranchTile } from '../../../../src/lib/api/discovery'

// ---------------------------------------------------------------------------
// Fixture — Karaara Indian Kitchen, Huddersfield branch
// ---------------------------------------------------------------------------
const BASE_BRANCH: BranchTile = {
  id:                       'branch-karaara-huddersfield',
  branchName:               'Karaara Huddersfield',
  branchLocalityId:         'loc-huddersfield',
  branchLocalityName:       'Huddersfield',
  branchPostTown:           'Huddersfield',
  branchCity:               'Huddersfield',
  branchLatitude:           53.6458,
  branchLongitude:          -1.7850,
  branchLocationConfidence: 'MANUALLY_CONFIRMED',
  isOpenNow:                true,
  closesAtLocal:            '22:00',
  distance:                 320,
  isFavourited:             false,
  avgRating:                4.5,
  reviewCount:              12,
  supplyRung:               'NEARBY',
  proximityBand:            'NEARBY',
  distanceMetres:           320,
  merchant: {
    id:                   'merchant-karaara',
    businessName:         'Karaara Indian Kitchen Ltd',
    tradingName:          'Karaara',
    logoUrl:              'https://cdn.redeemo.com/merchants/karaara/logo.png',
    bannerUrl:            'https://cdn.redeemo.com/merchants/karaara/banner.jpg',
    primaryCategory: {
      id:               'cat-food-drink',
      name:             'Food & Drink',
      pinColour:        '#E8472A',
      pinIcon:          'utensils',
      descriptorSuffix: null,
      parentId:         null,
      intentType:       'LOCAL',
    },
    primaryDescriptorTag: {
      id:    'tag-indian',
      label: 'Indian',
    },
    subcategory: {
      id:       'cat-restaurant',
      name:     'Restaurant',
      parentId: 'cat-food-drink',
    },
    descriptor:           'Indian',
    highlights:           [
      { highlightTagId: 'htag-vegan', label: 'Vegan options' },
    ],
    voucherCount:         3,
    maxEstimatedSaving:   15.00,
    totalEstimatedSaving: 35.00,
  },
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('branchToMerchantTileProps (Category surface-local adapter)', () => {
  describe('D1 — identity swap pin', () => {
    it('sets id to branch.id, NOT branch.merchant.id', () => {
      const result = branchToMerchantTileProps(BASE_BRANCH)
      expect(result.id).toBe('branch-karaara-huddersfield')
      expect(result.id).not.toBe('merchant-karaara')
    })
  })

  describe('D2 — branch-level fields sourced from branch', () => {
    it('maps distance from branch', () => {
      const result = branchToMerchantTileProps(BASE_BRANCH)
      expect(result.distance).toBe(320)
    })

    it('maps isFavourited from branch', () => {
      const result = branchToMerchantTileProps(BASE_BRANCH)
      expect(result.isFavourited).toBe(false)
    })

    it('maps avgRating from branch (branch-level, not merchant-level)', () => {
      const result = branchToMerchantTileProps(BASE_BRANCH)
      expect(result.avgRating).toBe(4.5)
    })

    it('maps reviewCount from branch', () => {
      const result = branchToMerchantTileProps(BASE_BRANCH)
      expect(result.reviewCount).toBe(12)
    })

    it('maps proximityBand from branch', () => {
      const result = branchToMerchantTileProps(BASE_BRANCH)
      expect(result.proximityBand).toBe('NEARBY')
    })

    it('maps supplyRung from branch', () => {
      const result = branchToMerchantTileProps(BASE_BRANCH)
      expect(result.supplyRung).toBe('NEARBY')
    })

    it('maps distanceMetres from branch', () => {
      const result = branchToMerchantTileProps(BASE_BRANCH)
      expect(result.distanceMetres).toBe(320)
    })

    it('maps branchLatitude → latitude from branch', () => {
      const result = branchToMerchantTileProps(BASE_BRANCH)
      expect(result.latitude).toBe(53.6458)
    })

    it('maps branchLongitude → longitude from branch', () => {
      const result = branchToMerchantTileProps(BASE_BRANCH)
      expect(result.longitude).toBe(-1.7850)
    })
  })

  describe('D3 — merchant-grouping fields sourced from branch.merchant', () => {
    it('maps businessName from branch.merchant', () => {
      const result = branchToMerchantTileProps(BASE_BRANCH)
      expect(result.businessName).toBe('Karaara Indian Kitchen Ltd')
    })

    it('maps tradingName from branch.merchant', () => {
      const result = branchToMerchantTileProps(BASE_BRANCH)
      expect(result.tradingName).toBe('Karaara')
    })

    it('maps logoUrl from branch.merchant', () => {
      const result = branchToMerchantTileProps(BASE_BRANCH)
      expect(result.logoUrl).toBe('https://cdn.redeemo.com/merchants/karaara/logo.png')
    })

    it('maps bannerUrl from branch.merchant', () => {
      const result = branchToMerchantTileProps(BASE_BRANCH)
      expect(result.bannerUrl).toBe('https://cdn.redeemo.com/merchants/karaara/banner.jpg')
    })

    it('maps voucherCount from branch.merchant', () => {
      const result = branchToMerchantTileProps(BASE_BRANCH)
      expect(result.voucherCount).toBe(3)
    })

    it('maps maxEstimatedSaving from branch.merchant', () => {
      const result = branchToMerchantTileProps(BASE_BRANCH)
      expect(result.maxEstimatedSaving).toBe(15.00)
    })

    it('maps descriptor from branch.merchant', () => {
      const result = branchToMerchantTileProps(BASE_BRANCH)
      expect(result.descriptor).toBe('Indian')
    })
  })

  describe('D4 — POSTCODE_CENTROID redaction passthrough', () => {
    it('passes null lat/lng through when branch has no exact position', () => {
      const redacted: BranchTile = {
        ...BASE_BRANCH,
        branchLatitude:           null,
        branchLongitude:          null,
        branchLocationConfidence: 'POSTCODE_CENTROID',
      }
      const result = branchToMerchantTileProps(redacted)
      expect(result.latitude).toBeNull()
      expect(result.longitude).toBeNull()
    })
  })

  describe('D5 — supplyTier default', () => {
    it("defaults supplyTier to 'NEARBY' (BranchTile does not carry supplyTier natively)", () => {
      const result = branchToMerchantTileProps(BASE_BRANCH)
      expect(result.supplyTier).toBe('NEARBY')
    })
  })

  describe('D6 — highlights omitted', () => {
    it('does not include highlights in output (shape-incompatible, omitted for Phase 2.5)', () => {
      const result = branchToMerchantTileProps(BASE_BRANCH)
      expect(result.highlights).toBeUndefined()
    })
  })

  describe('D7 — primaryCategory mapping', () => {
    it('preserves id, name, pinColour, pinIcon from branch.merchant.primaryCategory', () => {
      const result = branchToMerchantTileProps(BASE_BRANCH)
      expect(result.primaryCategory).toEqual({
        id:        'cat-food-drink',
        name:      'Food & Drink',
        pinColour: '#E8472A',
        pinIcon:   'utensils',
      })
    })

    it('coerces optional pinColour undefined → null', () => {
      const branch: BranchTile = {
        ...BASE_BRANCH,
        merchant: {
          ...BASE_BRANCH.merchant,
          primaryCategory: {
            id:               'cat-no-colour',
            name:             'Services',
            pinColour:        undefined,
            pinIcon:          undefined,
            descriptorSuffix: null,
            parentId:         null,
            intentType:       null,
          },
        },
      }
      const result = branchToMerchantTileProps(branch)
      expect(result.primaryCategory?.pinColour).toBeNull()
      expect(result.primaryCategory?.pinIcon).toBeNull()
    })

    it('outputs null primaryCategory when branch.merchant.primaryCategory is null', () => {
      const branch: BranchTile = {
        ...BASE_BRANCH,
        merchant: {
          ...BASE_BRANCH.merchant,
          primaryCategory: null,
        },
      }
      const result = branchToMerchantTileProps(branch)
      expect(result.primaryCategory).toBeNull()
    })
  })

  describe('D8 — nearestBranchId set to branch.id', () => {
    it('sets nearestBranchId to branch.id (the adapter pattern mirrors Home + Map)', () => {
      const result = branchToMerchantTileProps(BASE_BRANCH)
      expect(result.nearestBranchId).toBe('branch-karaara-huddersfield')
    })
  })
})

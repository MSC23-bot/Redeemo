import type { MerchantTile } from '@/lib/api/discovery'

/**
 * Builder for MerchantTile test fixtures. Provides Plan-1.5-conformant
 * defaults so individual tests only need to override the fields they
 * actually exercise. Keeps the strict-nullable schema honest in tests
 * without forcing every test site to reshape inline.
 */
export function makeMerchantTile(overrides: Partial<MerchantTile> = {}): MerchantTile {
  return {
    id:                 'm1',
    businessName:       'Test Merchant',
    tradingName:        null,
    logoUrl:            null,
    bannerUrl:          null,
    primaryCategory:    null,
    subcategory:        null,
    voucherCount:       0,
    maxEstimatedSaving: null,
    distance:           null,
    nearestBranchId:    null,
    avgRating:          null,
    reviewCount:        0,
    isFavourited:       false,
    supplyTier:         'NEARBY',
    ...overrides,
  }
}

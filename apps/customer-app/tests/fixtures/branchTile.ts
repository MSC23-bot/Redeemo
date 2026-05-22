import type { BranchTile } from '@/lib/api/discovery'

/**
 * Builder for `BranchTile` test fixtures (Discovery Rebaseline PR-2 /
 * Phase 2.1).  Mirrors the strict wire shape exported by the backend at
 * `src/api/customer/discovery/branchTileSchema.ts`.
 *
 * Override pattern matches `makeMerchantTile`: tests pass only the fields
 * they actually exercise; the rest fall back to spec-conformant defaults.
 * `merchant` is shallow-merged so callers can override one or two fields
 * (e.g. just `merchant: { id, businessName }`) without rebuilding the
 * whole sub-object.
 */
export function makeBranchTile(
  overrides: Partial<Omit<BranchTile, 'merchant'>> & {
    merchant?: Partial<BranchTile['merchant']>
  } = {},
): BranchTile {
  const { merchant: merchantOverrides, ...rest } = overrides
  return {
    id:                       'brn1',
    branchName:               'Test Branch',
    branchLocalityId:         null,
    branchLocalityName:       null,
    branchPostTown:           null,
    branchCity:               null,
    branchLatitude:           null,
    branchLongitude:          null,
    branchLocationConfidence: 'MANUALLY_CONFIRMED',
    isOpenNow:                false,
    closesAtLocal:            null,
    distance:                 null,
    isFavourited:             false,
    avgRating:                null,
    reviewCount:              0,
    supplyRung:               null,
    proximityBand:            null,
    distanceMetres:           null,
    matchContext:             null,
    ...rest,
    merchant: {
      id:                   'm1',
      businessName:         'Test Merchant',
      tradingName:          null,
      logoUrl:              null,
      bannerUrl:            null,
      primaryCategory:      null,
      primaryDescriptorTag: null,
      subcategory:          null,
      descriptor:           '',
      highlights:           [],
      voucherCount:         0,
      maxEstimatedSaving:   null,
      totalEstimatedSaving: null,
      ...merchantOverrides,
    },
  }
}

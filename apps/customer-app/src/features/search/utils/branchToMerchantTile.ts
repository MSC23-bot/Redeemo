// Phase 2.4 scoped adapter — bridges the new `BranchTile` shape from the
// category-results branch arm (`branches`) to the `MerchantTile` shape the
// shared `<MerchantTile>` component still accepts.  Phase 2.5 tile-rename
// sweep will refactor `<MerchantTile>` to consume `BranchTile` natively and
// this adapter is deleted.
//
// Sibling of:
//   - Phase 2.3 Home adapter at
//     `apps/customer-app/src/features/home/utils/branchToMerchantTile.ts`
//   - Phase 2.2 Map adapter at
//     `apps/customer-app/src/features/map/components/MapBranchTile.tsx`
//     (`branchToMerchantTile` local function, lines 58-103)
//
// Same bridging intent, same `id: branch.id` swap so the grid tile-key and
// the `onPress(id)` callback carry the BRANCH identity (load-bearing for the
// `?branch=<branchId>&from=category&categoryId=<id>` URL contract).  Two
// branches of the same merchant render as two distinct tiles in the Category
// results grid per the locked §M one-tile-per-branch product principle.
//
// Surface-local on purpose — DO NOT export to shared/.  See Phase 2.4 plan
// §3.2 for the locked deletion point.

import type { BranchTile, MerchantTile } from '../../../lib/api/discovery'

/**
 * Maps a `BranchTile` to the shape the shared `<MerchantTile>` component
 * accepts.  The crucial swap is `id: branch.id` (not `branch.merchant.id`)
 * — this is what makes the Category results grid branch-identity-aware so
 * two branches of the same merchant render as two distinct tiles per the
 * locked §M one-tile-per-branch product principle.
 *
 * The caller (`CategoryResultsScreen`) keeps `branch.merchant.id` separately
 * for routing — see the `onMerchantPress` handler.
 *
 * Branch-level fields (`distance`, `isFavourited`, `avgRating`,
 * `reviewCount`, `proximityBand`, `supplyRung`, `distanceMetres`,
 * `branchLatitude`, `branchLongitude`) are sourced from the `BranchTile`;
 * merchant-grouping fields (`businessName`, `logoUrl`, `bannerUrl`,
 * `primaryCategory`, `descriptor`, `voucherCount`, `maxEstimatedSaving`,
 * etc.) come from `branch.merchant`.
 *
 * `supplyTier` is not on `BranchTile` (the BranchTile contract uses the
 * finer-grained `supplyRung` instead).  Defaults to `'NEARBY'` — the
 * shared `<MerchantTile>` doesn't visibly render `supplyTier` (it's used
 * only by upstream ranking).
 */
export function branchToMerchantTileProps(branch: BranchTile): MerchantTile {
  // The shared `<MerchantTile>` reads only `primaryCategory?.name` for
  // its visible UI — the other category fields are along for the type
  // contract.  Coerce the optional `pinColour` / `pinIcon` to nullable
  // to satisfy `MerchantTile`'s stricter typing without conditional
  // spread noise.
  const primaryCategory = branch.merchant.primaryCategory
    ? {
        id:        branch.merchant.primaryCategory.id,
        name:      branch.merchant.primaryCategory.name,
        pinColour: branch.merchant.primaryCategory.pinColour ?? null,
        pinIcon:   branch.merchant.primaryCategory.pinIcon ?? null,
      }
    : null

  return {
    id:                  branch.id,                        // BRANCH identity drives navigation
    businessName:        branch.merchant.businessName,
    tradingName:         branch.merchant.tradingName,
    logoUrl:             branch.merchant.logoUrl,
    bannerUrl:           branch.merchant.bannerUrl,
    primaryCategory,
    primaryDescriptorTag: branch.merchant.primaryDescriptorTag,
    subcategory:         branch.merchant.subcategory,
    voucherCount:        branch.merchant.voucherCount,
    maxEstimatedSaving:  branch.merchant.maxEstimatedSaving,
    distance:            branch.distance,
    nearestBranchId:     branch.id,
    // BranchTile carries branch-level lat/lng (POSTCODE_CENTROID
    // redaction passes null through unchanged).
    latitude:            branch.branchLatitude,
    longitude:           branch.branchLongitude,
    avgRating:           branch.avgRating,
    reviewCount:         branch.reviewCount,
    isFavourited:        branch.isFavourited,
    supplyTier:          'NEARBY',
    descriptor:          branch.merchant.descriptor,
    // `highlights` is shape-incompatible between `BranchTile` (lean
    // `{ highlightTagId, label }[]`) and `MerchantTile` (rich
    // `{ id, highlightTagId, sortOrder, tag: { id, label } }[]`).  The
    // shared `<MerchantTile>` doesn't render `highlights`, so we simply
    // omit (it's optional on `MerchantTile`).  Phase 2.5 sweep
    // reconciles.
    supplyRung:          branch.supplyRung,
    proximityBand:       branch.proximityBand,
    distanceMetres:      branch.distanceMetres,
  }
}

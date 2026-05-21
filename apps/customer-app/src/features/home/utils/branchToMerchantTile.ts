// Phase 2.3 scoped adapter — bridges the new `BranchTile` shape from the
// home-feed branch arms (`featuredBranches` / `trendingBranches` /
// `nearbyByCategoryBranches`) to the `MerchantTile` shape the shared
// `<MerchantTile>` component still accepts.  Phase 2.5 tile-rename sweep
// will refactor `<MerchantTile>` to consume `BranchTile` natively and this
// adapter is deleted.
//
// Mirrors the Phase 2.2 Map adapter at
// `apps/customer-app/src/features/map/components/MapBranchTile.tsx`
// (`branchToMerchantTile` local function, lines 58-103) — same bridging
// intent, same `id: branch.id` swap so the carousel tile-key + the
// `onPress(id)` callback carry the BRANCH identity (load-bearing for
// the `?branch=<branchId>&from=home` URL contract).  Each Home carousel
// passes a custom `onMerchantPress` that receives this branch id and
// pushes the URL with both the merchant id (for the route path) and the
// branch id (for the merchant-profile `?branch=` URL param).
//
// Surface-local on purpose — do NOT export to shared/.  See Phase 2.3
// plan §3.2 for the locked deletion point.

import type { BranchTile, MerchantTile } from '../../../lib/api/discovery'

/**
 * Maps a `BranchTile` to the shape the shared `<MerchantTile>` component
 * accepts.  The crucial swap is `id: branch.id` (not `branch.merchant.id`)
 * — this is what makes the carousel branch-identity-aware so two
 * branches of the same merchant render as two distinct tiles per the
 * locked §M one-pin-per-branch product principle.
 *
 * The caller (each Home carousel) keeps `branch.merchant.id` separately
 * for routing — see the per-component `onMerchantPress` handlers.
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

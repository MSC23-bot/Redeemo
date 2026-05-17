import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { merchantApi } from '@/lib/api/merchant'

// §N11 prefetch — warm sibling-branch merchant-profile queries when
// the user opens the Branches tab.
//
// Background: §BD-3 closed the visible-stale-identity half of §N11 by
// rendering <MerchantProfileSkeleton> during the within-merchant
// branch switch. That removed the confusing wrong-branch render but
// left the underlying ~1-2s network round-trip as a visible wait.
// This hook closes the wait for the common case: when the user opens
// the Branches tab, we prefetch up to 5 of the nearest active non-
// current branches so a Switch tap hits a warm cache (~0ms perceived
// wait) instead of triggering a fresh fetch.
//
// Trigger model:
//   - Fires ONLY when `enabled === true` (typically `activeTab ===
//     'branches' && isMultiBranch`).
//   - Skips the currently-selected branch (already in cache).
//   - Skips suspended branches (consistent with BranchesTab's display
//     filter, and we wouldn't navigate to them anyway).
//   - Caps at PREFETCH_CAP = 5 to bound peak network load. Large
//     chains (10+ branches) still hit the §BD-3 skeleton fallback if
//     the user taps a branch beyond the top 5 nearest.
//   - Distance-sorts so the closest active branches are warmed first
//     (matches BranchesTab's visible nearest-first sort, so prefetch
//     order matches the user's likely tap order).
//
// Safety:
//   - `prefetchQuery` is a no-op when the cache is already fresh
//     (within `staleTime`). The 60_000ms staleTime matches
//     `useMerchantProfile`'s existing window, so the prefetched data
//     fills the same cache slot a real fetch would.
//   - The effect depends on `branches`, which changes identity on
//     every merchant-profile refetch. That's intentional — a fresh
//     branch list (e.g. a branch's `isActive` flipped) should re-key
//     the prefetch decisions. The wasted-work overhead is
//     negligible (5 array iterations + 5 prefetchQuery no-op calls).
//   - Race-safe: if the user taps Switch DURING an in-flight
//     prefetch, React Query de-dupes — the active query reuses the
//     in-flight prefetch result.
//
// Out of scope for this hook:
//   - The §BD-3 skeleton fallback remains the correctness backstop
//     for cache misses (prefetch cap exceeded, prefetch failed
//     silently, etc.).
//   - Does not address cross-merchant navigation (§BD-1's domain).
//   - Does not address cold-mount waits (the first fetch always
//     pays the full cost).

export const PREFETCH_CAP = 5

export type BranchPrefetchTile = {
  id:       string
  isActive: boolean
  distance: number | null
}

type Opts = {
  merchantId: string
  branchId:   string | null
  branches:   BranchPrefetchTile[] | undefined
  location:   { lat: number; lng: number } | null
  enabled:    boolean
}

export function useBranchPrefetch({
  merchantId, branchId, branches, location, enabled,
}: Opts): void {
  const qc = useQueryClient()

  // Primitive-keyed deps so a location object identity change without
  // coordinate movement (e.g. permission flip) doesn't re-fire.
  const lat = location?.lat ?? null
  const lng = location?.lng ?? null

  useEffect(() => {
    if (!enabled)             return
    if (!merchantId)          return
    if (!branches?.length)    return

    // Same filter BranchesTab applies for the visible "Other
    // Locations" list — exclude current + suspended.
    const others = branches.filter(b => b.id !== branchId && b.isActive)
    if (others.length === 0) return

    // Nearest-first when ALL have GPS distance; alphabetical fallback
    // would not match the tap-likelihood signal, so for the no-GPS
    // case we just leave the natural order.  In practice the
    // backend already sorts BranchTile by distance when GPS is
    // available.
    const allHaveGps = others.every(b => b.distance !== null)
    const sorted = allHaveGps
      ? [...others].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
      : others

    const toWarm = sorted.slice(0, PREFETCH_CAP)

    const locationOpts = lat !== null && lng !== null ? { lat, lng } : null

    toWarm.forEach(b => {
      qc.prefetchQuery({
        queryKey: ['merchantProfile', merchantId, b.id, lat, lng],
        queryFn:  () => merchantApi.getProfile(merchantId, {
          branchId: b.id,
          ...(locationOpts ?? {}),
        }),
        staleTime: 60_000,
      })
    })
  }, [enabled, merchantId, branchId, branches, lat, lng, qc])
}

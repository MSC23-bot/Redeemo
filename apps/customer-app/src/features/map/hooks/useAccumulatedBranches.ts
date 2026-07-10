// Map Phase 2 S2 — region-accumulation cache, hook side.
//
// Pairs `useInAreaBranches`'s live viewport query with the module-level
// `regionAccumulationStore`: records every successful unfiltered fetch
// into the store, and renders the union of stored tiles intersecting the
// CURRENT raw viewport merged with whatever the live query has right now
// (live data always wins per branch id — it's guaranteed freshest for
// its own viewport).
//
// See `regionAccumulationStore.ts` for the store's design notes (cap,
// TTL, honesty-rule scoping, sign-out lifecycle).
import { useEffect, useMemo } from 'react'
import type { BranchTile } from '@/lib/api/discovery'
import type { BoundingBox } from '../utils/bboxQuantize'
import { recordAccumulatedTile, getAccumulatedBranches, bboxesIntersect } from './regionAccumulationStore'

/**
 * @param fetchBbox     The DEBOUNCED bbox `useInAreaBranches` is CURRENTLY
 *                       querying (`MapScreen`'s `queryBbox`). NOTE this is
 *                       NOT necessarily the bbox that produced the
 *                       CURRENT `liveBranches` — `useInAreaBranches` runs
 *                       with `keepPreviousData`, so `fetchBbox` can race
 *                       ahead of `liveBranches` during a pan's in-flight
 *                       window (see `liveResultBbox` below, which is
 *                       what's actually used to decide whether the live
 *                       data belongs on screen).
 * @param viewportBbox   The RAW, un-debounced camera bbox (`MapScreen`'s
 *                       live `region`, converted). Used only for
 *                       RENDERING — this is what makes pan-back instant:
 *                       the union is computed against the camera's
 *                       current position, not the (still-debouncing)
 *                       fetch target.
 * @param liveBranches   The unfiltered in-area query's current branches
 *                       (`mapDataView(inAreaQuery.data).branches`).
 * @param enabled        Honesty-rule gate — MUST be `false` whenever the
 *                       hybrid hook has switched to the filtered
 *                       `/search` path (`hasNonScopeFilters === true`).
 *                       When disabled, this hook is a pass-through: no
 *                       recording, and rendering returns `liveBranches`
 *                       verbatim (no accumulation mixed in).
 */
export function useAccumulatedBranches(
  fetchBbox:     BoundingBox | null,
  viewportBbox:  BoundingBox | null,
  liveBranches:  BranchTile[] | undefined,
  enabled:       boolean,
): BranchTile[] {
  // `liveResultBbox` — the bbox ACTUALLY paired with the current
  // `liveBranches`, frozen until `liveBranches` itself changes again.
  //
  // Deliberately keyed on `[liveBranches]` alone (not `fetchBbox`): this
  // `useMemo` recomputes exactly when a genuinely NEW result lands, at
  // which render `fetchBbox` (read via closure) is guaranteed correct
  // for THIS `liveBranches` (both come from the same render pass — the
  // query only ever produces new `data` for the `bbox` param it was
  // called with in that render). Once captured, the pairing stays frozen
  // even if `fetchBbox` (queryBbox) races ahead on a subsequent pan
  // while `keepPreviousData` keeps `liveBranches` pinned to the older
  // result — exactly the "what bbox does this stale-but-still-shown data
  // actually belong to" question both the recording effect and the
  // render union below need answered correctly.
  const liveResultBbox = useMemo(() => fetchBbox, [liveBranches]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) return
    if (liveResultBbox === null) return
    if (!liveBranches || liveBranches.length === 0) return
    recordAccumulatedTile(liveResultBbox, liveBranches)
  }, [enabled, liveResultBbox, liveBranches])

  return useMemo(() => {
    if (!enabled) return liveBranches ?? []
    if (viewportBbox === null) return liveBranches ?? []
    const accumulated = getAccumulatedBranches(viewportBbox)
    // `keepPreviousData` means `liveBranches` can still be holding the
    // PREVIOUS fetch's result while a long-distance pan has already
    // moved `viewportBbox` somewhere that fetch knows nothing about
    // (e.g. Huddersfield → London: the live query is still mid-flight
    // for London, so `liveBranches` is still Huddersfield's pins). Only
    // merge `liveBranches` in when `liveResultBbox` (the bbox that
    // ACTUALLY produced it) still intersects the CURRENT viewport —
    // otherwise it's stale data for a different area and must not be
    // conflated with what's shown here; the accumulated union (which IS
    // keyed by the areas it actually covers) is the correct fallback for
    // that gap.
    const liveBelongsToViewport =
      liveResultBbox !== null && !!liveBranches && liveBranches.length > 0 && bboxesIntersect(liveResultBbox, viewportBbox)
    if (!liveBelongsToViewport) return accumulated
    const merged = new Map<string, BranchTile>()
    for (const b of accumulated) merged.set(b.id, b)
    for (const b of liveBranches!) merged.set(b.id, b) // live always wins — freshest for this viewport
    return Array.from(merged.values())
  }, [
    enabled,
    liveResultBbox,
    viewportBbox?.minLat, viewportBbox?.maxLat, viewportBbox?.minLng, viewportBbox?.maxLng,
    liveBranches,
  ])
}

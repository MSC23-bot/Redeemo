import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { discoveryApi } from '@/lib/api/discovery'
import { quantizeBbox, type BoundingBox } from '../utils/bboxQuantize'

export type { BoundingBox }

type InAreaParams = {
  bbox:        BoundingBox
  categoryId?: string
  lat?:        number
  lng?:        number
  limit?:      number
}

export const inAreaBranchesQueryKey = (params: InAreaParams) =>
  ['discovery', 'in-area-branches', params] as const

/**
 * React Query wrapper around `discoveryApi.getInAreaBranches`
 * (`/api/v1/customer/discovery/in-area`). Used by Map for the default
 * unfiltered viewport view (no sortBy / voucherTypes / amenityIds /
 * openNow). For filtered viewport queries, MapScreen switches to
 * `useSearch` with a bbox — the in-area route does not accept those
 * params (mirrors the CategoryResults hybrid hook pattern).
 *
 * Returns the full response (`select: r => r`) so MapScreen can read
 * `branches`, `totalBranches`, and `branchMeta.effectiveLocality` /
 * `branchMeta.rungCounts` from a single hook call. Owner-locked
 * 2026-05-20 during the PR-3 contract-mismatch review.
 *
 * `enabled` is forced false until `bbox` is non-null so the screen can
 * mount without a viewport (initial location-permission state) and
 * fetch only once the camera reports its first region.
 */
export function useInAreaBranches(
  bbox:    BoundingBox | null,
  params:  Omit<InAreaParams, 'bbox'> = {},
  enabled: boolean = true,
) {
  // Map in-area reliability slice — quantize BEFORE both the query key
  // and the request so panning back to a previously-seen area hits the
  // cache instead of minting a new key (see bboxQuantize.ts).
  const quantizedBbox = bbox !== null ? quantizeBbox(bbox) : null
  return useQuery({
    queryKey:  inAreaBranchesQueryKey({ bbox: quantizedBbox ?? { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 }, ...params }),
    // `branchesOnly: 1` — this hook only ever reads `branches` + `meta`
    // (never the legacy `merchants` field, see mapDataView.ts), so it
    // opts into the branch-arm-only response and skips the backend's
    // UK-wide merchant findMany + rank + enrich.
    //
    // Map Phase 2 S2 — `{ signal }` is React Query's per-query
    // AbortSignal (aborted automatically when this query is superseded,
    // e.g. a pan lands a new quantized bbox before the previous fetch
    // resolves, or the query is disabled/unmounted). Threading it lets
    // the in-flight request for a stale viewport actually cancel at the
    // network layer instead of racing the new one to resolve.
    queryFn:   ({ signal }) => discoveryApi.getInAreaBranches({ ...quantizedBbox!, ...params, branchesOnly: 1 }, { signal }),
    select:    r => r,
    enabled:   enabled && quantizedBbox !== null,
    // Map in-area reliability slice — raised from 30s to 120s. Viewport
    // pin supply does not change minute-to-minute; combined with bbox
    // quantization above, a pan-away-and-back within the window is now a
    // cache hit instead of a refetch. Pull-to-refresh and a pan-away
    // followed by a pan-back after 2 minutes still refetch as before.
    staleTime: 120 * 1000,
    // §AY — keep previous viewport merchants visible while the next
    // bbox request is in-flight. Without this, every pan/zoom clears
    // `data` to undefined for the refetch duration → MapPins renders
    // zero pins → user sees a blank map even though the previous
    // result is still semantically meaningful. Once the new fetch
    // resolves, swap to the new merchants.
    //
    // keepPreviousData does NOT survive `enabled=false` transitions
    // (offshore / permission-revoked / bbox-null) — those still
    // clear `data` cleanly so stale pins don't bleed into states
    // where MapEmptyArea / offshore takeover need to show.
    placeholderData: keepPreviousData,
  })
}

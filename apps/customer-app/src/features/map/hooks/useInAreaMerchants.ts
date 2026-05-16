import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { discoveryApi } from '@/lib/api/discovery'

export type BoundingBox = {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

type InAreaParams = {
  bbox:        BoundingBox
  categoryId?: string
  lat?:        number
  lng?:        number
  limit?:      number
}

export const inAreaMerchantsQueryKey = (params: InAreaParams) =>
  ['discovery', 'in-area', params] as const

/**
 * React Query wrapper around `discoveryApi.getInAreaMerchants` (PR A's
 * `/api/v1/customer/discovery/in-area`). Used by Map for the default
 * unfiltered viewport view (no sortBy / voucherTypes / amenityIds /
 * openNow). For filtered viewport queries, MapScreen switches to
 * `useSearch` with a bbox — the in-area route does not accept those
 * params (mirrors the CategoryResults hybrid hook pattern).
 *
 * `enabled` is forced false until `bbox` is non-null so the screen can
 * mount without a viewport (initial location-permission state) and
 * fetch only once the camera reports its first region.
 */
export function useInAreaMerchants(
  bbox:    BoundingBox | null,
  params:  Omit<InAreaParams, 'bbox'> = {},
  enabled: boolean = true,
) {
  return useQuery({
    queryKey:  inAreaMerchantsQueryKey({ bbox: bbox ?? { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 }, ...params }),
    queryFn:   () => discoveryApi.getInAreaMerchants({ ...bbox!, ...params }),
    enabled:   enabled && bbox !== null,
    staleTime: 30 * 1000,        // 30s — viewport content updates on pan
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

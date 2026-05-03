import { useQuery } from '@tanstack/react-query'
import { reviewsApi } from '@/lib/api/reviews'

// Two read-only review hooks — list + summary. Write paths are not exposed
// here (out of M1 scope). Mirrors the cefaf45 hook shape so M2 / future
// writes can extend without breaking callers.

export function useReviewSummary(
  merchantId: string | undefined,
  opts: { branchId?: string } = {},
) {
  return useQuery({
    // null sentinel keeps the cache key stable when branchId is omitted.
    queryKey:  ['reviewSummary', merchantId, opts.branchId ?? null],
    queryFn:   () => reviewsApi.getReviewSummary(merchantId!, opts),
    enabled:   !!merchantId,
    staleTime: 120_000,
  })
}

export function useMerchantReviews(
  merchantId: string | undefined,
  params: { limit?: number; offset?: number; branchId?: string } = {},
) {
  return useQuery({
    queryKey:  ['merchantReviews', merchantId, params.limit, params.offset, params.branchId],
    queryFn:   () => reviewsApi.getMerchantReviews(merchantId!, params),
    enabled:   !!merchantId,
    staleTime: 60_000,
  })
}

import { useQuery } from '@tanstack/react-query'
import { reviewsApi } from '@/lib/api/reviews'

export function useReviewSummary(merchantId: string | undefined) {
  return useQuery({
    queryKey: ['reviewSummary', merchantId],
    queryFn: () => reviewsApi.getReviewSummary(merchantId!),
    enabled: !!merchantId,
    staleTime: 120_000,
  })
}

export function useMerchantReviews(
  merchantId: string | undefined,
  params: { limit?: number; offset?: number } = {},
) {
  return useQuery({
    queryKey: ['merchantReviews', merchantId, params.limit, params.offset],
    queryFn: () => reviewsApi.getMerchantReviews(merchantId!, params),
    enabled: !!merchantId,
    staleTime: 60_000,
  })
}

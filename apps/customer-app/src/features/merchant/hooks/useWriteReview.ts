import { useMutation, useQueryClient } from '@tanstack/react-query'
import { reviewsApi } from '@/lib/api/reviews'

export function useCreateReview(merchantId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ branchId, rating, comment }: { branchId: string; rating: number; comment?: string }) =>
      // exactOptionalPropertyTypes: omit `comment` rather than passing undefined.
      reviewsApi.createReview(branchId, comment !== undefined ? { rating, comment } : { rating }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchantReviews', merchantId] })
      queryClient.invalidateQueries({ queryKey: ['reviewSummary', merchantId] })
      queryClient.invalidateQueries({ queryKey: ['merchantProfile', merchantId] })
    },
  })
}

export function useDeleteReview(merchantId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ branchId, reviewId }: { branchId: string; reviewId: string }) =>
      reviewsApi.deleteReview(branchId, reviewId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchantReviews', merchantId] })
      queryClient.invalidateQueries({ queryKey: ['reviewSummary', merchantId] })
      queryClient.invalidateQueries({ queryKey: ['merchantProfile', merchantId] })
    },
  })
}

export function useToggleHelpful() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reviewId: string) => reviewsApi.toggleHelpful(reviewId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchantReviews'] })
    },
  })
}

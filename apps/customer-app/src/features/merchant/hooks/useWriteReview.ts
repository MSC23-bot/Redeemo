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

// Helpful toggle is the most-tapped review interaction; without optimistic
// updates the user taps and sees nothing happen until the network round-trip
// completes (or — pre-fix — sees nothing happen at all because the list
// payload didn't surface helpful state). React Query's onMutate writes the
// new state into the cache before the request fires; onError rolls back if
// the request fails; onSettled then refetches to reconcile with server truth.
type ReviewListPayload = { reviews: Array<{
  id: string
  userMarkedHelpful: boolean
  helpfulCount: number
  // …other review fields, but only these two matter for the optimistic patch
}>; total: number }

export function useToggleHelpful(merchantId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reviewId: string) => reviewsApi.toggleHelpful(reviewId),
    onMutate: async (reviewId) => {
      const queryKey = ['merchantReviews', merchantId]
      await queryClient.cancelQueries({ queryKey })
      const snapshots = queryClient.getQueriesData<ReviewListPayload>({ queryKey })
      // Patch every cached page that contains this review. Toggle the flag
      // and adjust count by ±1 — bounded at 0 to avoid negative counts in
      // edge cases.
      queryClient.setQueriesData<ReviewListPayload>({ queryKey }, (data) => {
        if (!data) return data
        return {
          ...data,
          reviews: data.reviews.map(r => {
            if (r.id !== reviewId) return r
            const nextMarked = !r.userMarkedHelpful
            const nextCount  = Math.max(0, r.helpfulCount + (nextMarked ? 1 : -1))
            return { ...r, userMarkedHelpful: nextMarked, helpfulCount: nextCount }
          }),
        }
      })
      return { snapshots }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['merchantReviews', merchantId] })
    },
  })
}

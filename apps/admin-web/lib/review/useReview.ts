'use client'

/**
 * useReview — React Query hook for a single approval review context.
 *
 * Fetches GET /api/v1/admin/approvals/:id/review and returns the full
 * ReviewContext. Pass `enabled: false` to suppress the network request
 * (e.g. while the session is not yet ready or the caller lacks approval:read).
 */
import { useQuery } from '@tanstack/react-query'
import { reviewApi } from '@/lib/api/review'
import type { ReviewContext } from '@/lib/api/review'

export function reviewQueryKey(approvalId: string) {
  return ['admin-review', approvalId] as const
}

export type UseReviewResult = {
  data: ReviewContext | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

export function useReview(approvalId: string, enabled: boolean): UseReviewResult {
  const query = useQuery({
    queryKey: reviewQueryKey(approvalId),
    queryFn: () => reviewApi.get(approvalId),
    enabled,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}

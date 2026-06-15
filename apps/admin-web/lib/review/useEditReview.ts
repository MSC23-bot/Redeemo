'use client'

/**
 * useEditReview — React Query hook for a single edit approval's field diff
 * (Option B B1). Fetches GET /api/v1/admin/approvals/:id/edit-review. Pass
 * `enabled: false` to suppress the request (session not ready / no approval:read).
 *
 * useApproveEdit / useRejectEdit — mutations that invalidate both the queue list
 * and this review on success AND on stale-state errors, so the UI reflects the
 * latest server state automatically.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { editReviewApi } from '@/lib/api/editReview'
import type { EditReviewContext, ApproveEditResponse, RejectEditResponse } from '@/lib/api/editReview'
import { QUEUE_KEY } from '@/lib/queue/useQueue'

export function editReviewQueryKey(approvalId: string) {
  return ['admin-edit-review', approvalId] as const
}

export type UseEditReviewResult = {
  data: EditReviewContext | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

export function useEditReview(approvalId: string, enabled: boolean): UseEditReviewResult {
  const query = useQuery({
    queryKey: editReviewQueryKey(approvalId),
    queryFn: () => editReviewApi.get(approvalId),
    enabled,
  })
  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}

/** Invalidate both the queue list and this edit review. */
function useInvalidateBoth(approvalId: string) {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: QUEUE_KEY })
    void qc.invalidateQueries({ queryKey: editReviewQueryKey(approvalId) })
  }
}

export function useApproveEdit(approvalId: string) {
  const invalidate = useInvalidateBoth(approvalId)
  return useMutation<ApproveEditResponse, Error>({
    mutationFn: () => editReviewApi.approve(approvalId),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export function useRejectEdit(approvalId: string) {
  const invalidate = useInvalidateBoth(approvalId)
  return useMutation<RejectEditResponse, Error, string>({
    mutationFn: (reason: string) => editReviewApi.reject(approvalId, reason),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

'use client'

/**
 * useReviewActions — React Query mutations for approval actions.
 *
 * Each mutation invalidates both the queue list AND the specific review on
 * success AND on stale-state errors (e.g. APPROVAL_NOT_ACTIONABLE), so the
 * UI automatically reflects the latest server state.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { approvalsApi } from '@/lib/api/approvals'
import { QUEUE_KEY } from '@/lib/queue/useQueue'
import { reviewQueryKey } from '@/lib/review/useReview'
import type { ClaimResponse, ReleaseResponse, RequestChangesResponse, RejectResponse, ApproveResponse } from '@/lib/api/approvals'

/** Invalidate both the queue list and the specific review. */
function useInvalidateBoth(approvalId: string) {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: QUEUE_KEY })
    void qc.invalidateQueries({ queryKey: reviewQueryKey(approvalId) })
  }
}

export function useClaim(approvalId: string) {
  const invalidate = useInvalidateBoth(approvalId)
  return useMutation<ClaimResponse, Error>({
    mutationFn: () => approvalsApi.claim(approvalId),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export function useRelease(approvalId: string) {
  const invalidate = useInvalidateBoth(approvalId)
  return useMutation<ReleaseResponse, Error>({
    mutationFn: () => approvalsApi.release(approvalId),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export function useRequestChanges(approvalId: string) {
  const invalidate = useInvalidateBoth(approvalId)
  return useMutation<RequestChangesResponse, Error, string>({
    mutationFn: (reason: string) => approvalsApi.requestChanges(approvalId, reason),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export function useReject(approvalId: string) {
  const invalidate = useInvalidateBoth(approvalId)
  return useMutation<RejectResponse, Error, string>({
    mutationFn: (reason: string) => approvalsApi.reject(approvalId, reason),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export function useApprove(approvalId: string) {
  const invalidate = useInvalidateBoth(approvalId)
  return useMutation<ApproveResponse, Error>({
    mutationFn: () => approvalsApi.approve(approvalId),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

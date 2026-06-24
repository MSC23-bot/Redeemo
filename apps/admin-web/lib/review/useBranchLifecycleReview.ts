'use client'

/**
 * useBranchLifecycleReview: React Query hook for a single BRANCH_CREATE /
 * BRANCH_CLOSE approval's review context (Branches PR-5, D5). Fetches
 * GET /api/v1/admin/approvals/:id/branch-lifecycle-review. Pass `enabled: false`
 * to suppress the request (session not ready / no approval:read).
 *
 * useApproveBranchLifecycle / useRejectBranchLifecycle: mutations that invalidate
 * BOTH the queue list and this review on success AND on stale-state errors, so
 * the UI reflects the latest server state automatically. The CREATE-approve also
 * depends on the branch location being confirmed first; the confirm-location
 * mutation lives in useMerchantActions and invalidates this review via its own
 * key (see branchLifecycleReviewQueryKey), so a confirm flips the panel's
 * locationConfidence and unlocks Approve.
 *
 * Mirrors lib/review/useEditReview.ts + lib/review/useVoucherReview.ts.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { branchLifecycleReviewApi } from '@/lib/api/branchLifecycleReview'
import type {
  BranchLifecycleReviewContext,
  ApproveBranchLifecycleResponse,
  RejectBranchLifecycleResponse,
} from '@/lib/api/branchLifecycleReview'
import { branchesApi } from '@/lib/api/branches'
import type { ConfirmLocationInput, ConfirmLocationResponse } from '@/lib/api/branches'
import { QUEUE_KEY } from '@/lib/queue/useQueue'

export function branchLifecycleReviewQueryKey(approvalId: string) {
  return ['admin-branch-lifecycle-review', approvalId] as const
}

export type UseBranchLifecycleReviewResult = {
  data: BranchLifecycleReviewContext | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

export function useBranchLifecycleReview(
  approvalId: string,
  enabled: boolean,
): UseBranchLifecycleReviewResult {
  const query = useQuery({
    queryKey: branchLifecycleReviewQueryKey(approvalId),
    queryFn: () => branchLifecycleReviewApi.get(approvalId),
    enabled,
  })
  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}

/** Invalidate both the queue list and this branch-lifecycle review. */
function useInvalidateBoth(approvalId: string) {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: QUEUE_KEY })
    void qc.invalidateQueries({ queryKey: branchLifecycleReviewQueryKey(approvalId) })
  }
}

export function useApproveBranchLifecycle(approvalId: string) {
  const invalidate = useInvalidateBoth(approvalId)
  return useMutation<ApproveBranchLifecycleResponse, Error>({
    mutationFn: () => branchLifecycleReviewApi.approve(approvalId),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export function useRejectBranchLifecycle(approvalId: string) {
  const invalidate = useInvalidateBoth(approvalId)
  return useMutation<RejectBranchLifecycleResponse, Error, string>({
    mutationFn: (reason: string) => branchLifecycleReviewApi.reject(approvalId, reason),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

/**
 * useConfirmBranchLifecycleLocation: reuse the M6 confirm-location action for a
 * CREATE review. Unlike the onboarding useConfirmLocation (which invalidates the
 * onboarding reviewQueryKey), this invalidates THIS branch-lifecycle review so
 * the panel's locationConfidence flips to MANUALLY_CONFIRMED and Approve unlocks.
 * Same underlying endpoint (POST /admin/branches/:id/confirm-location,
 * branch:confirm-location-gated). Invalidates on success AND error (a stale-state
 * error means the server moved on, so a resync is still useful).
 */
export function useConfirmBranchLifecycleLocation(approvalId: string) {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: branchLifecycleReviewQueryKey(approvalId) })
  }
  return useMutation<
    ConfirmLocationResponse,
    Error,
    { branchId: string; input: ConfirmLocationInput }
  >({
    mutationFn: ({ branchId, input }) => branchesApi.confirmLocation(branchId, input),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

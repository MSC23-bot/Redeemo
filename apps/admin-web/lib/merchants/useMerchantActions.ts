'use client'

/**
 * useMerchantActions: React Query mutations for the M6 merchant lifecycle +
 * branch confirm-location actions.
 *
 *   useCreateDraft      : create an admin-owned draft merchant. No review/queue
 *                         cache to invalidate (the merchant has no approval yet).
 *   useSuspend          : suspend a merchant; invalidates the merchants directory
 *                         ALWAYS, plus the review + queue when launched from the
 *                         review screen (an `approvalId` is supplied). On the
 *                         `/merchants` list there is no approval, so `approvalId`
 *                         is omitted and only the directory is invalidated.
 *   useReactivate       : reactivate a merchant; same invalidations as suspend.
 *   useConfirmLocation  : manually confirm a branch location; invalidates the
 *                         review so the branch row flips to MANUALLY_CONFIRMED.
 *
 * Mirrors useReviewActions: each mutation invalidates on success AND on error
 * (a stale-state error means the server state moved on, so the UI should refetch).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { merchantsApi } from '@/lib/api/merchants'
import { branchesApi } from '@/lib/api/branches'
import { QUEUE_KEY } from '@/lib/queue/useQueue'
import { MERCHANTS_LIST_KEY } from '@/lib/merchants/useMerchantsList'
import { reviewQueryKey } from '@/lib/review/useReview'
import type { CreateDraftFields, CreateDraftResponse, SuspendResponse, ReactivateResponse } from '@/lib/api/merchants'
import type { ConfirmLocationInput, ConfirmLocationResponse } from '@/lib/api/branches'

/**
 * Invalidate the surfaces a lifecycle action (suspend/reactivate) can shift.
 * The merchants directory (WP2) is ALWAYS invalidated so a status change shows
 * wherever the list is open. When the action was launched from the review
 * screen (`approvalId` present) the queue + that specific review are
 * invalidated too; from the `/merchants` list there is no approval context, so
 * those keys are skipped.
 */
function useInvalidateAfterLifecycle(approvalId?: string) {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: MERCHANTS_LIST_KEY })
    if (approvalId) {
      void qc.invalidateQueries({ queryKey: QUEUE_KEY })
      void qc.invalidateQueries({ queryKey: reviewQueryKey(approvalId) })
    }
  }
}

/** Invalidate just the specific review (confirm-location does not affect the queue). */
function useInvalidateReview(approvalId: string) {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: reviewQueryKey(approvalId) })
  }
}

/**
 * Create an admin-owned draft merchant. No review/queue invalidation: a draft
 * has no approval row in the queue yet.
 */
export function useCreateDraft() {
  return useMutation<CreateDraftResponse, Error, CreateDraftFields>({
    mutationFn: (fields: CreateDraftFields) => merchantsApi.createDraft(fields),
  })
}

export function useSuspend(merchantId: string, approvalId?: string) {
  const invalidate = useInvalidateAfterLifecycle(approvalId)
  return useMutation<SuspendResponse, Error, string>({
    mutationFn: (reason: string) => merchantsApi.suspend(merchantId, reason),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export function useReactivate(merchantId: string, approvalId?: string) {
  const invalidate = useInvalidateAfterLifecycle(approvalId)
  return useMutation<ReactivateResponse, Error>({
    mutationFn: () => merchantsApi.reactivate(merchantId),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export function useConfirmLocation(approvalId: string) {
  const invalidate = useInvalidateReview(approvalId)
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

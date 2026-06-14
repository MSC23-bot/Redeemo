'use client'

/**
 * useMerchantActions: React Query mutations for the M6 merchant lifecycle +
 * branch confirm-location actions.
 *
 *   useCreateDraft      : create an admin-owned draft merchant. No review/queue
 *                         cache to invalidate (the merchant has no approval yet).
 *   useSuspend          : suspend a merchant; invalidates the review AND the queue
 *                         (merchant status drives review render; queue may shift).
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
import { reviewQueryKey } from '@/lib/review/useReview'
import type { CreateDraftFields, CreateDraftResponse, SuspendResponse, ReactivateResponse } from '@/lib/api/merchants'
import type { ConfirmLocationInput, ConfirmLocationResponse } from '@/lib/api/branches'

/** Invalidate both the queue list and the specific review (lifecycle actions). */
function useInvalidateReviewAndQueue(approvalId: string) {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: QUEUE_KEY })
    void qc.invalidateQueries({ queryKey: reviewQueryKey(approvalId) })
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

export function useSuspend(merchantId: string, approvalId: string) {
  const invalidate = useInvalidateReviewAndQueue(approvalId)
  return useMutation<SuspendResponse, Error, string>({
    mutationFn: (reason: string) => merchantsApi.suspend(merchantId, reason),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export function useReactivate(merchantId: string, approvalId: string) {
  const invalidate = useInvalidateReviewAndQueue(approvalId)
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

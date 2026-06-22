'use client'

/**
 * useVoucherReview: React Query hook for a single VOUCHER approval's review
 * context (Day-2 Vouchers PR-C). Fetches GET /api/v1/admin/approvals/:id/voucher-review.
 * Pass `enabled: false` to suppress the request (session not ready / no approval:read).
 *
 * useApproveVoucher / useRejectVoucher / useRequestVoucherChanges: mutations that
 * invalidate BOTH the queue list and this voucher review on success AND on
 * stale-state errors, so the UI reflects the latest server state automatically.
 * Mirrors lib/review/useEditReview.ts.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { voucherReviewApi } from '@/lib/api/voucherReview'
import type {
  VoucherReviewContext,
  ApproveVoucherResponse,
  RejectVoucherResponse,
  RequestVoucherChangesResponse,
  VoucherProposal,
} from '@/lib/api/voucherReview'
import { QUEUE_KEY } from '@/lib/queue/useQueue'

export function voucherReviewQueryKey(approvalId: string) {
  return ['admin-voucher-review', approvalId] as const
}

export type UseVoucherReviewResult = {
  data: VoucherReviewContext | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

export function useVoucherReview(approvalId: string, enabled: boolean): UseVoucherReviewResult {
  const query = useQuery({
    queryKey: voucherReviewQueryKey(approvalId),
    queryFn: () => voucherReviewApi.get(approvalId),
    enabled,
  })
  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}

/** Invalidate both the queue list and this voucher review. */
function useInvalidateBoth(approvalId: string) {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: QUEUE_KEY })
    void qc.invalidateQueries({ queryKey: voucherReviewQueryKey(approvalId) })
  }
}

export function useApproveVoucher(approvalId: string) {
  const invalidate = useInvalidateBoth(approvalId)
  return useMutation<ApproveVoucherResponse, Error>({
    mutationFn: () => voucherReviewApi.approve(approvalId),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export function useRejectVoucher(approvalId: string) {
  const invalidate = useInvalidateBoth(approvalId)
  return useMutation<RejectVoucherResponse, Error, string>({
    mutationFn: (reason: string) => voucherReviewApi.reject(approvalId, reason),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export function useRequestVoucherChanges(approvalId: string) {
  const invalidate = useInvalidateBoth(approvalId)
  return useMutation<
    RequestVoucherChangesResponse,
    Error,
    { proposed?: VoucherProposal; note: string }
  >({
    mutationFn: (input) => voucherReviewApi.requestChanges(approvalId, input),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

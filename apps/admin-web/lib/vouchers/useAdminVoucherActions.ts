'use client'

/**
 * Admin RMV co-build mutations (Merchant 360 A3): edit a DRAFT flagship's
 * template-allowed fields, and submit a DRAFT flagship for go-live review, both
 * on the merchant's behalf. Each invalidates that merchant's RMV read on success
 * AND on error (a stale-state error, e.g. VOUCHER_NOT_EDITABLE, means the server
 * state moved on, so the UI should refetch). The routes gate
 * merchant:manage-vouchers server-side; the UI gate is defence-in-depth UX.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminVouchersApi } from '@/lib/api/vouchers'
import { adminRmvQueryKey } from '@/lib/vouchers/useAdminRmvVouchers'

function useInvalidateRmv(merchantId: string) {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: adminRmvQueryKey(merchantId) })
  }
}

export function useEditRmv(merchantId: string) {
  const invalidate = useInvalidateRmv(merchantId)
  return useMutation<
    { id: string },
    Error,
    { voucherId: string; fields: Record<string, unknown>; reason: string }
  >({
    mutationFn: ({ voucherId, fields, reason }) =>
      adminVouchersApi.editRmv(merchantId, voucherId, { fields, reason }),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export function useSubmitRmv(merchantId: string) {
  const invalidate = useInvalidateRmv(merchantId)
  return useMutation<{ id: string }, Error, { voucherId: string; reason: string }>({
    mutationFn: ({ voucherId, reason }) =>
      adminVouchersApi.submitRmv(merchantId, voucherId, { reason }),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

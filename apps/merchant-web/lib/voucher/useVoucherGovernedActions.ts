'use client'

// Voucher governed flows (2026-07-07): the merchant-facing mutation hooks for the
// three governed lanes (D1-D4 plan packet, PR #411 backend contracts). Every hook
// invalidates the SAME query keys the rest of the module already reads
// (['vouchers'], ['flagshipVouchers'], ['voucher', id]) so the list AND the
// detail page both pick up the fresh pendingEdit/status without a manual
// refetch, mirroring lib/business-profile/useMerchantEditRequest.ts.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  requestFlagshipVoucherChange,
  requestVoucherEnd,
  withdrawVoucherSubmission,
  withdrawVoucherPendingEdit,
  type RequestFlagshipChangePayload,
} from '@/lib/api/voucher'

function useInvalidateVouchers() {
  const qc = useQueryClient()
  return (voucherId?: string) => {
    void qc.invalidateQueries({ queryKey: ['vouchers'] })
    void qc.invalidateQueries({ queryKey: ['flagshipVouchers'] })
    if (voucherId) void qc.invalidateQueries({ queryKey: ['voucher', voucherId] })
  }
}

// Flagship (ACTIVE only): request a governed change to its fields. The voucher
// stays live/unchanged until Redeemo approves; PENDING_EDIT_EXISTS surfaces to
// the caller when one is already in review.
export function useRequestFlagshipChange() {
  const invalidate = useInvalidateVouchers()
  return useMutation({
    mutationFn: (vars: { id: string } & RequestFlagshipChangePayload) => {
      const { id, ...payload } = vars
      return requestFlagshipVoucherChange(id, payload)
    },
    onSuccess: (_data, vars) => invalidate(vars.id),
  })
}

// Custom (ACTIVE only, D4: never flagship): request to end (deactivate). The
// voucher stays live until Redeemo approves.
export function useRequestVoucherEnd() {
  const invalidate = useInvalidateVouchers()
  return useMutation({
    mutationFn: (vars: { id: string; reason: string }) => requestVoucherEnd(vars.id, vars.reason),
    onSuccess: (_data, vars) => invalidate(vars.id),
  })
}

// D2: instant self-service withdraw of a PENDING_APPROVAL custom submission
// (voucher -> DRAFT). Never offered on a flagship or an approved-waiting
// voucher (the caller gates that; a race surfaces VOUCHER_WITHDRAW_NOT_PENDING).
export function useWithdrawVoucherSubmission() {
  const invalidate = useInvalidateVouchers()
  return useMutation({
    mutationFn: (id: string) => withdrawVoucherSubmission(id),
    onSuccess: (_data, id) => invalidate(id),
  })
}

// Withdraw an own not-yet-reviewed VoucherPendingEdit (either kind). The
// response carries no voucherId (curated shape), so the caller passes it
// through so the specific ['voucher', id] cache entry is invalidated too.
export function useWithdrawVoucherPendingEdit() {
  const invalidate = useInvalidateVouchers()
  return useMutation({
    mutationFn: (vars: { editId: string; voucherId?: string }) => withdrawVoucherPendingEdit(vars.editId),
    onSuccess: (_data, vars) => invalidate(vars.voucherId),
  })
}

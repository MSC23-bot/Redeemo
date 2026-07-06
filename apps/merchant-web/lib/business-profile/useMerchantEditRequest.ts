'use client'

// Business Profile M4: the reviewed-lane mutation hooks for the "Public identity"
// card (businessName, tradingName, description, logoUrl, bannerUrl). Mirrors
// lib/branches/useBranches.ts's useCreateBranchEditRequest / useWithdrawBranchEditRequest
// exactly in shape - both invalidate the SAME ['merchantProfile'] key
// useUpdateMerchantProfile.ts writes to, so a create/withdraw here re-reads
// getMerchantProfile (whose `pendingEdits` block flips immediately) without a
// second query key to keep in sync.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createMerchantEditRequest,
  withdrawMerchantEditRequest,
  type MerchantEditRequestBody,
} from '@/lib/api/profile'
import { MERCHANT_PROFILE_KEY } from '@/lib/business-profile/useUpdateMerchantProfile'

// Submit a reviewed identity edit-request (LIVE merchant path for the SENSITIVE
// fields). 409 PENDING_EDIT_EXISTS surfaces to the caller when one is already in
// review; the card's Edit affordance is disabled while pending so this should only
// reach the backend defensively (e.g. a second tab).
export function useCreateMerchantEditRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (changes: MerchantEditRequestBody) => createMerchantEditRequest(changes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MERCHANT_PROFILE_KEY })
    },
  })
}

// Withdraw a pending identity edit-request. Invalidating re-reads getMerchantProfile
// (now with no PENDING row) so the card returns to its editable state.
export function useWithdrawMerchantEditRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (editId: string) => withdrawMerchantEditRequest(editId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MERCHANT_PROFILE_KEY })
    },
  })
}

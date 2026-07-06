'use client'

// Business Profile M3: the shared PATCH mutation for the two editable day-2 cards -
// Registered details (direct-edit) and Business category (category change). Both
// call sites share ONE hook so cache write-back is identical.
//
// The backend `updateMerchantProfile` wrapper (src/api/merchant/profile/service.ts)
// returns the FULL refreshed merchant profile for every apply path (simple-direct
// save, first-time category set, unchanged, or a confirmed change) - the ONE
// exception is an unconfirmed category CHANGE, which returns a
// `{ requiresConfirmation, message }` preview instead. That preview carries no
// profile data, so `onSuccess` deliberately leaves the `['merchantProfile']` cache
// untouched in that case; the caller (CategoryChangeModal) re-issues the same
// mutation with `confirm: true` to actually apply it.
//
// On a real profile result: `setQueryData` writes the fresh profile in immediately
// (no flash back to stale data while a refetch is in flight), and `invalidateQueries`
// still fires so any other observer of the same key (e.g. a background refetch
// picking up server-side side effects such as RMV re-provisioning after a category
// change) stays consistent.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  updateMerchantProfile,
  isCategoryChangeConfirmation,
  type MerchantProfileUpdateBody,
  type MerchantProfileUpdateResult,
} from '@/lib/api/profile'

export const MERCHANT_PROFILE_KEY = ['merchantProfile'] as const

export function useUpdateMerchantProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: MerchantProfileUpdateBody) => updateMerchantProfile(body),
    onSuccess: (data: MerchantProfileUpdateResult) => {
      if (isCategoryChangeConfirmation(data)) return
      qc.setQueryData(MERCHANT_PROFILE_KEY, data)
      qc.invalidateQueries({ queryKey: MERCHANT_PROFILE_KEY })
    },
  })
}

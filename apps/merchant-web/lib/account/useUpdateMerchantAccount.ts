import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateMerchantAccount, type MerchantAccountUpdateBody } from '@/lib/api/account'
import { MERCHANT_ACCOUNT_KEY } from './useMerchantAccount'

// My Account (§BP-ACC) "Your details -> Edit -> Save changes". Writes the fresh
// account straight into the cache (no stale flash) and invalidates so any other
// observer stays consistent, mirroring useUpdateMerchantProfile.
export function useUpdateMerchantAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: MerchantAccountUpdateBody) => updateMerchantAccount(body),
    onSuccess: (data) => {
      qc.setQueryData(MERCHANT_ACCOUNT_KEY, data)
      qc.invalidateQueries({ queryKey: MERCHANT_ACCOUNT_KEY })
    },
  })
}

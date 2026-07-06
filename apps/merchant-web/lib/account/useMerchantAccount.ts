import { useQuery } from '@tanstack/react-query'
import { getMerchantAccount } from '@/lib/api/account'

export const MERCHANT_ACCOUNT_KEY = ['merchantAccount'] as const

// My Account (§BP-ACC): the logged-in admin's OWN person record. Only fetched
// once authenticated, mirroring useMerchantProfile.
export function useMerchantAccount(enabled: boolean) {
  return useQuery({
    queryKey: MERCHANT_ACCOUNT_KEY,
    queryFn: getMerchantAccount,
    enabled,
    staleTime: 60_000,
  })
}

import { useQuery } from '@tanstack/react-query'
import { getMerchantSessions } from '@/lib/api/account'

export const MERCHANT_SESSIONS_KEY = ['merchantSessions'] as const

// My Account (§BP-ACC) "Where you are signed in". A short staleTime keeps the list
// reasonably fresh without polling; a successful password change or
// sign-out-everywhere both invalidate this key so the list reflects the new state
// immediately (see useChangePassword / useLogoutAllOtherSessions).
export function useMerchantSessions(enabled: boolean) {
  return useQuery({
    queryKey: MERCHANT_SESSIONS_KEY,
    queryFn: getMerchantSessions,
    enabled,
    staleTime: 30_000,
  })
}

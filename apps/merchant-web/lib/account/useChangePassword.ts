import { useMutation, useQueryClient } from '@tanstack/react-query'
import { changeMerchantPassword } from '@/lib/api/account'
import { MERCHANT_ACCOUNT_KEY } from './useMerchantAccount'
import { MERCHANT_SESSIONS_KEY } from './useMerchantSessions'

// My Account (§BP-ACC) "Change password". On success: the backend revokes every
// OTHER live session (keeps the caller's own), so both the account (fresh
// passwordChangedAt) and the sessions list (other rows disappear) are invalidated.
export function useChangePassword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) => changeMerchantPassword(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MERCHANT_ACCOUNT_KEY })
      qc.invalidateQueries({ queryKey: MERCHANT_SESSIONS_KEY })
    },
  })
}

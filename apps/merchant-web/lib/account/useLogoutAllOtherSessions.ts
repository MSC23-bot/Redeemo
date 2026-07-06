import { useMutation, useQueryClient } from '@tanstack/react-query'
import { logoutAllOtherSessions } from '@/lib/api/account'
import { MERCHANT_SESSIONS_KEY } from './useMerchantSessions'

// My Account (§BP-ACC) "Sign out everywhere" (keeps the caller's OWN current
// session alive - see the backend service doc comment). Invalidates the sessions
// list so the revoked rows drop out on the next render.
export function useLogoutAllOtherSessions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => logoutAllOtherSessions(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MERCHANT_SESSIONS_KEY })
    },
  })
}

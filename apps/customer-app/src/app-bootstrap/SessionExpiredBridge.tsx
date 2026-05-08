import { useEffect } from 'react'
import { api, type SignOutReason } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/design-system/motion/Toast'

/**
 * Distinct copy locked at deferred-followups §AC7 / §AD6.
 *
 * `SESSION_REPLACED` is the one-mobile-device-per-account rule: when
 * the user signs in on another device, this device is forced out. The
 * copy must be specific so the user understands their account is fine
 * and they didn't lose their session to a bug.
 *
 * `SESSION_EXPIRED` covers everything else (refresh token revoked,
 * expired, network failure during refresh) — it's the generic "please
 * sign in again" path.
 */
const COPY: Record<SignOutReason, string> = {
  SESSION_REPLACED: 'Your account was signed in on another device, so this session has ended.',
  SESSION_EXPIRED:  'Your session has expired. Please sign in again.',
}

export function SessionExpiredBridge() {
  const signOut = useAuthStore((s) => s.signOut)
  const toast = useToast()

  useEffect(() => {
    api.onSessionExpired((reason) => {
      const message = COPY[reason] ?? COPY.SESSION_EXPIRED
      toast.show(message, 'danger')
      signOut()
    })
  }, [signOut, toast])

  return null
}

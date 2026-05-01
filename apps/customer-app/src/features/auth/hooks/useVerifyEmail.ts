import { useEffect } from 'react'
import { useIsFocused } from '@react-navigation/native'
import { profileApi } from '@/lib/api/profile'
import { useAuthStore } from '@/stores/auth'

export function useVerifyEmail() {
  const user = useAuthStore((s) => s.user)
  const syncVerificationState = useAuthStore((s) => s.syncVerificationState)
  const isFocused = useIsFocused()

  useEffect(() => {
    if (!isFocused || user?.emailVerified) return
    const id = setInterval(async () => {
      try {
        const me = await profileApi.getMe()
        if (me.emailVerified) {
          // Sync both flags from the same response — if phoneVerified is already
          // true (e.g. from a previous session), resolveRedirect will skip
          // verify-phone and route the user directly to profile completion.
          await syncVerificationState({ emailVerified: true, phoneVerified: me.phoneVerified })
          clearInterval(id)
          // Navigation is driven by resolveRedirect in (auth)/_layout.tsx —
          // no explicit router.replace needed.
        }
      } catch { /* ignore */ }
    }, 4000)
    return () => clearInterval(id)
  }, [isFocused, user?.emailVerified, syncVerificationState])
}

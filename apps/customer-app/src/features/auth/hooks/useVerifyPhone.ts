import { useEffect } from 'react'
import { useIsFocused } from '@react-navigation/native'
import { profileApi } from '@/lib/api/profile'
import { useAuthStore } from '@/stores/auth'

export function useVerifyPhone() {
  const user = useAuthStore((s) => s.user)
  const syncVerificationState = useAuthStore((s) => s.syncVerificationState)
  const isFocused = useIsFocused()

  useEffect(() => {
    if (!isFocused || user?.phoneVerified) return
    const id = setInterval(async () => {
      try {
        const me = await profileApi.getMe()
        if (me.phoneVerified) {
          // Phone was verified externally (admin script, future web flow, etc.).
          // Sync from server so resolveRedirect in (auth)/_layout.tsx advances the
          // user to the next onboarding step without requiring an OTP entry.
          await syncVerificationState({ phoneVerified: true })
          clearInterval(id)
        }
      } catch { /* ignore */ }
    }, 4000)
    return () => clearInterval(id)
  }, [isFocused, user?.phoneVerified, syncVerificationState])
}

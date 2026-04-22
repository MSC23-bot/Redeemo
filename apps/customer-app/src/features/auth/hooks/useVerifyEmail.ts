import { useEffect } from 'react'
import { useIsFocused } from '@react-navigation/native'
import { router } from 'expo-router'
import { profileApi } from '@/lib/api/profile'
import { useAuthStore } from '@/stores/auth'

export function useVerifyEmail() {
  const user = useAuthStore((s) => s.user)
  const syncVerificationState = useAuthStore((s) => s.syncVerificationState)
  let isFocused = true
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    isFocused = useIsFocused()
  } catch {
    // not inside a react navigation context — assume focused
  }

  useEffect(() => {
    if (!isFocused || user?.emailVerified) return
    const id = setInterval(async () => {
      try {
        const me = await profileApi.getMe()
        if (me.emailVerified) {
          await syncVerificationState({ emailVerified: true })
          clearInterval(id)
          router.replace('/(auth)/verify-phone')
        }
      } catch { /* ignore */ }
    }, 4000)
    return () => clearInterval(id)
  }, [isFocused, user?.emailVerified, syncVerificationState])
}

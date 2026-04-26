import { useState } from 'react'
import { router } from 'expo-router'
import { authApi } from '@/lib/api/auth'
import { profileApi } from '@/lib/api/profile'
import { mapError } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/design-system/motion/Toast'
import { setTokens as apiSetTokens } from '@/lib/api'

export function useLoginFlow() {
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const setTokens = useAuthStore((s) => s.setTokens)
  const markProfileCompletion = useAuthStore((s) => s.markProfileCompletion)
  const updateOnboarding = useAuthStore((s) => s.updateOnboarding)
  const toast = useToast()

  async function submit(input: { email: string; password: string }) {
    setSubmitting(true); setFieldErrors({})
    try {
      const res = await authApi.login(input)
      apiSetTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken })
      const me = await profileApi.getMe()
      await setTokens({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        user: {
          id: me.id,
          email: me.email,
          firstName: me.firstName ?? '',
          phone: me.phone ?? '',
          emailVerified: me.emailVerified,
          phoneVerified: me.phoneVerified,
          onboardingCompletedAt: me.onboardingCompletedAt,
          subscriptionPromptSeenAt: me.subscriptionPromptSeenAt,
        },
      })
      if (me.profileCompleteness >= 100) {
        await markProfileCompletion('completed')
      } else if (me.profileCompleteness > 0) {
        await updateOnboarding({ profileCompletion: 'in_progress' })
      }
    } catch (e) {
      const mapped = mapError(e)
      if (mapped.code === 'ACCOUNT_NOT_VERIFIED') {
        toast.show("Verify your email first. We've sent you a link.", 'neutral')
        router.replace('/(auth)/verify-email')
        return
      }
      if (mapped.surface === 'field' && mapped.field) {
        setFieldErrors({ [mapped.field]: mapped.message })
      } else {
        toast.show(mapped.message, 'danger')
      }
    } finally { setSubmitting(false) }
  }

  return { submit, submitting, fieldErrors }
}

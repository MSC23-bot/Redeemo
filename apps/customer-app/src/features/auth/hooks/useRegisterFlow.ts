import { useState } from 'react'
import { router } from 'expo-router'
import { authApi } from '@/lib/api/auth'
import { mapError } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/design-system/motion/Toast'
import type { RegisterInput } from '@/features/auth/schemas'

export function useRegisterFlow() {
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const setTokens = useAuthStore((s) => s.setTokens)
  const toast = useToast()

  async function submit(input: RegisterInput) {
    setSubmitting(true)
    setFieldErrors({})
    try {
      const res = await authApi.register(input)
      await setTokens({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        user: {
          id: res.user.id,
          email: res.user.email,
          firstName: res.user.firstName ?? '',
          phone: res.user.phone ?? '',
          emailVerified: !!res.user.emailVerifiedAt,
          phoneVerified: !!res.user.phoneVerifiedAt,
          onboardingCompletedAt: null,
          subscriptionPromptSeenAt: null,
        },
      })
      router.replace('/(auth)/verify-email')
    } catch (e) {
      const mapped = mapError(e)
      if (mapped.surface === 'field' && mapped.field) {
        setFieldErrors({ [mapped.field]: mapped.message })
      } else {
        toast.show(mapped.message, 'danger')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return { submit, submitting, fieldErrors }
}

import { useState } from 'react'
import { router } from 'expo-router'
import { authApi } from '@/lib/api/auth'
import { mapError } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/design-system/motion/Toast'

export function useLoginFlow() {
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const setTokens = useAuthStore((s) => s.setTokens)
  const toast = useToast()

  async function submit(input: { email: string; password: string }) {
    setSubmitting(true); setFieldErrors({})
    try {
      const res = await authApi.login(input)
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
        },
      })
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

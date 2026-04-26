import { useState } from 'react'
import { authApi } from '@/lib/api/auth'
import { profileApi } from '@/lib/api/profile'
import { mapError } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'

function mapLoginFormError(code: string, fallback: string): string {
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return "Email or password is incorrect. Please try again."
    case 'ACCOUNT_INACTIVE':
      return "This account isn't active. Please contact support."
    case 'ACCOUNT_SUSPENDED':
      return 'Your account has been suspended. Please contact support.'
    case 'RATE_LIMITED':
      return 'Too many attempts. Please wait a moment and try again.'
    case 'NETWORK_ERROR':
      return 'Connection lost. Check your network and try again.'
    default:
      return fallback || "Something went wrong. Please try again."
  }
}

export function useLoginFlow() {
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const setTokens = useAuthStore((s) => s.setTokens)
  const markProfileCompletion = useAuthStore((s) => s.markProfileCompletion)
  const updateOnboarding = useAuthStore((s) => s.updateOnboarding)

  async function submit(input: { email: string; password: string }) {
    setSubmitting(true); setFieldErrors({}); setFormError(null)
    try {
      const res = await authApi.login(input)
      // setTokens fetches /profile and sets status:'authed' atomically.
      // resolveRedirect in AuthLayout then owns all routing — no explicit router.replace needed.
      await setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken })
      // Update local profile-completion state for UI (non-critical, best-effort).
      try {
        const me = await profileApi.getMe()
        if (me.profileCompleteness >= 100) {
          await markProfileCompletion('completed')
        } else if (me.profileCompleteness > 0) {
          await updateOnboarding({ profileCompletion: 'in_progress' })
        }
      } catch { /* non-critical */ }
    } catch (e) {
      const mapped = mapError(e)
      if (mapped.surface === 'field' && mapped.field) {
        setFieldErrors({ [mapped.field]: mapped.message })
      } else {
        setFormError(mapLoginFormError(mapped.code, mapped.message))
      }
    } finally { setSubmitting(false) }
  }

  function clearFormError() { setFormError(null) }

  return { submit, submitting, fieldErrors, formError, clearFormError }
}

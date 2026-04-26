import { useState } from 'react'
import { router } from 'expo-router'
import { authApi } from '@/lib/api/auth'
import { mapError } from '@/lib/errors'
import { useToast } from '@/design-system/motion/Toast'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function mapForgotPasswordError(e: unknown): string {
  const mapped = mapError(e)
  switch (mapped.code) {
    case 'EMAIL_NOT_FOUND':
    case 'USER_NOT_FOUND':
    case 'ACCOUNT_NOT_FOUND':
      return "We couldn't find an account with that email."
    case 'RATE_LIMITED':
      return "Too many attempts. Please wait a moment and try again."
    case 'NETWORK_ERROR':
      return 'Connection lost. Check your network and try again.'
    default:
      return "We couldn't send the reset link. Please try again."
  }
}

export function useForgotPassword() {
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(email: string) {
    const trimmed = email.trim()
    if (!EMAIL_REGEX.test(trimmed)) {
      setError('Enter a valid email address.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await authApi.forgotPassword(trimmed)
      setSent(true)
    } catch (e) {
      setError(mapForgotPasswordError(e))
    } finally {
      setSubmitting(false)
    }
  }

  function clearError() {
    setError(null)
  }

  return { submit, submitting, sent, error, clearError }
}

export function useResetPassword(token: string) {
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  async function submit(password: string) {
    setSubmitting(true)
    try {
      await authApi.resetPassword(token, password)
      toast.show('Password reset! Please sign in.', 'success')
      router.replace('/(auth)/login')
    } catch (e) {
      toast.show(mapError(e).message, 'danger')
    } finally {
      setSubmitting(false)
    }
  }

  return { submit, submitting }
}

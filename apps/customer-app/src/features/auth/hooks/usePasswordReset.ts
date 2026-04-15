import { useState } from 'react'
import { router } from 'expo-router'
import { authApi } from '@/lib/api/auth'
import { mapError } from '@/lib/errors'
import { useToast } from '@/design-system/motion/Toast'

export function useForgotPassword() {
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const toast = useToast()

  async function submit(email: string) {
    setSubmitting(true)
    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } catch (e) {
      toast.show(mapError(e).message, 'danger')
    } finally {
      setSubmitting(false)
    }
  }

  return { submit, submitting, sent }
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

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { authApi } from '@/lib/api/auth'
import { useAuthStore } from '@/stores/auth'

export type DeleteStage = 'warning' | 'otp' | 'done'

export function useDeleteAccount() {
  const [stage, setStage] = useState<DeleteStage>('warning')
  const [actionToken, setActionToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()
  const clearLocalAuth = useAuthStore((s) => s.clearLocalAuth)

  const sendOtp = async () => {
    setLoading(true)
    setError(null)
    try {
      await authApi.sendDeleteAccountOtp()
      setStage('otp')
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code
      setError(
        code === 'PHONE_NOT_VERIFIED'
          ? 'You need a verified phone number to delete your account. Please add one via Get Help.'
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  const verifyOtp = async (code: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await authApi.verifyDeleteAccountOtp(code)
      setActionToken(res.actionToken)
    } catch (e: unknown) {
      const errCode = (e as { code?: string })?.code
      setError(
        errCode === 'OTP_INVALID'
          ? 'That code is incorrect. Please try again.'
          : errCode === 'OTP_MAX_ATTEMPTS'
            ? 'Too many attempts. Please start over.'
            : 'Something went wrong. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  const confirmDelete = async () => {
    if (!actionToken) return
    setLoading(true)
    setError(null)
    try {
      await authApi.deleteAccount(actionToken)
      await clearLocalAuth()
      queryClient.clear()
      setStage('done')
      setTimeout(() => router.replace('/(auth)/login'), 2500)
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code
      setError(
        code === 'ACTION_TOKEN_INVALID'
          ? 'Your session expired. Please start over.'
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  return { stage, setStage, actionToken, error, loading, sendOtp, verifyOtp, confirmDelete }
}

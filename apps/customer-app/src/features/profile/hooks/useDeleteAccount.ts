import { useEffect, useRef, useState } from 'react'
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
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear any pending post-deletion redirect timer if the host unmounts
  // before it fires (e.g. user dismisses the sheet during the 2.5s window).
  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current !== null) {
        clearTimeout(redirectTimeoutRef.current)
        redirectTimeoutRef.current = null
      }
    }
  }, [])

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

  // Returns the resolved actionToken on success (so callers can thread it
  // synchronously into confirmDelete without waiting for the React state
  // update to flush), or null on any error.
  const verifyOtp = async (code: string): Promise<string | null> => {
    setLoading(true)
    setError(null)
    try {
      const res = await authApi.verifyDeleteAccountOtp(code)
      setActionToken(res.actionToken)
      return res.actionToken
    } catch (e: unknown) {
      const errCode = (e as { code?: string })?.code
      setError(
        errCode === 'OTP_INVALID'
          ? 'That code is incorrect. Please try again.'
          : errCode === 'OTP_MAX_ATTEMPTS'
            ? 'Too many attempts. Please start over.'
            : 'Something went wrong. Please try again.',
      )
      return null
    } finally {
      setLoading(false)
    }
  }

  // Accepts an explicit token override so a caller that just received a
  // token from verifyOtp can pass it through directly, avoiding the
  // stale-closure trap on the React state value.
  const confirmDelete = async (overrideToken?: string) => {
    const tok = overrideToken ?? actionToken
    if (!tok) return
    setLoading(true)
    setError(null)
    try {
      await authApi.deleteAccount(tok)
      await clearLocalAuth()
      queryClient.clear()
      setStage('done')
      redirectTimeoutRef.current = setTimeout(() => {
        redirectTimeoutRef.current = null
        router.replace('/(auth)/login')
      }, 2500)
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

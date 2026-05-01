import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/api/auth'
import { mapError } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'
import { haptics } from '@/design-system/haptics'

export function usePhoneVerify() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shakeKey, setShakeKey] = useState(0)
  const qc = useQueryClient()
  const syncVerificationState = useAuthStore((s) => s.syncVerificationState)
  const markPhoneVerifiedOnce = useAuthStore((s) => s.markPhoneVerifiedOnce)
  const refreshUser = useAuthStore((s) => s.refreshUser)

  // Shared success path used when the phone is confirmed (or was already
  // confirmed, e.g. via a dev script that flipped phoneVerified directly).
  const onPhoneVerified = useCallback(async () => {
    await syncVerificationState({ phoneVerified: true })
    await markPhoneVerifiedOnce()
    await refreshUser()
    qc.invalidateQueries({ queryKey: ['me'] })
    haptics.success()
  }, [qc, syncVerificationState, markPhoneVerifiedOnce, refreshUser])

  const verify = useCallback(async (code: string) => {
    setBusy(true); setError(null)
    try {
      await authApi.confirmPhoneOtp(code)
      await onPhoneVerified()
    } catch (e) {
      const mapped = mapError(e)
      // Backend returns ALREADY_VERIFIED when phoneVerified is already true —
      // treat it as success so the flow advances rather than stranding the user.
      if (mapped.code === 'ALREADY_VERIFIED') { await onPhoneVerified(); return }
      setError(mapped.message)
      setShakeKey((k) => k + 1)
      haptics.warning()
    } finally { setBusy(false) }
  }, [onPhoneVerified])

  async function resend() {
    try {
      await authApi.sendPhoneOtp()
    } catch (e) {
      const mapped = mapError(e)
      if (mapped.code === 'ALREADY_VERIFIED') { await onPhoneVerified(); return }
      setError(mapped.message)
    }
  }

  // For null-phone users entering a number for the first time, or for the
  // change-number flow before a phone is verified. Returns true on success so
  // the screen can transition into OTP-entry mode.
  async function sendForNumber(phoneNumber: string): Promise<boolean> {
    setBusy(true); setError(null)
    try {
      await authApi.sendPhoneOtp({ phoneNumber })
      return true
    } catch (e) {
      const mapped = mapError(e)
      if (mapped.code === 'ALREADY_VERIFIED') { await onPhoneVerified(); return true }
      setError(mapped.message)
      haptics.warning()
      return false
    } finally { setBusy(false) }
  }

  function clearError() { setError(null) }

  return { verify, resend, sendForNumber, clearError, busy, error, shakeKey }
}

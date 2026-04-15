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

  const verify = useCallback(async (code: string) => {
    setBusy(true); setError(null)
    try {
      await authApi.confirmPhoneOtp(code)
      await syncVerificationState({ phoneVerified: true })
      await markPhoneVerifiedOnce()
      qc.invalidateQueries({ queryKey: ['me'] })
      haptics.success()
    } catch (e) {
      const mapped = mapError(e)
      setError(mapped.message)
      setShakeKey((k) => k + 1)
      haptics.warning()
    } finally { setBusy(false) }
  }, [qc, syncVerificationState, markPhoneVerifiedOnce])

  async function resend() {
    try { await authApi.sendPhoneOtp() } catch (e) { setError(mapError(e).message) }
  }

  return { verify, resend, busy, error, shakeKey }
}

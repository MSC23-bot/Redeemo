'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { AuthShell } from '@/components/auth/AuthShell'
import { FormBanner } from '@/components/auth/FormBanner'
import { OtpInput } from '@/components/auth/OtpInput'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { authApi } from '@/lib/api/auth'
import { useSession } from '@/lib/auth/session'
import { authErrorMessage, isExpiredChallenge } from '@/lib/auth/errorMessages'
import { VERIFY_CHALLENGE_KEY } from '@/lib/auth/constants'

const RESEND_COOLDOWN_SECONDS = 30

export default function RegisterVerifyPage() {
  const router = useRouter()
  const { setSession } = useSession()
  const [challenge, setChallenge] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [resendMsg, setResendMsg] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [resending, setResending] = useState(false)
  // Ref guard: catches a synchronous double-click BEFORE the resending state re-render
  // disables the button, so the tight backend resend bucket is never double-spent.
  const resendInFlight = useRef(false)

  useEffect(() => {
    const stored = window.sessionStorage.getItem(VERIFY_CHALLENGE_KEY)
    if (!stored) {
      router.replace('/register')
      return
    }
    setChallenge(stored)
  }, [router])

  // Resend cooldown countdown (the backend resend uses a tight 3/hour bucket).
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!challenge || code.length !== 6) return
    setError(null)
    setLoading(true)
    try {
      const result = await authApi.verifyEmail({ sessionChallenge: challenge, code })
      window.sessionStorage.removeItem(VERIFY_CHALLENGE_KEY)
      // Verifying auto-logs the new owner in: land in the portal.
      setSession(result.accessToken, result.merchant)
      router.replace('/')
    } catch (err) {
      const er = authErrorMessage(err)
      if (isExpiredChallenge(er.code)) {
        window.sessionStorage.removeItem(VERIFY_CHALLENGE_KEY)
        setExpired(true)
        setError('That code has expired. Please register again to get a new one.')
      } else {
        setError(er.message)
      }
      setLoading(false)
    }
  }

  async function onResend() {
    if (!challenge || cooldown > 0 || resendInFlight.current) return
    resendInFlight.current = true
    setResending(true)
    setResendMsg(null)
    try {
      await authApi.resendVerification({ sessionChallenge: challenge })
      setResendMsg('A new code has been sent if your account still needs verifying.')
    } catch (err) {
      setResendMsg(authErrorMessage(err).message)
    } finally {
      setCooldown(RESEND_COOLDOWN_SECONDS)
      setResending(false)
      resendInFlight.current = false
    }
  }

  return (
    <AuthShell title="Verify your email" subtitle="We sent a 6-digit code to your email. Enter it to finish setting up.">
      {expired ? (
        <div className="mt-6 space-y-4">
          <FormBanner tone="error">{error}</FormBanner>
          <Button className="w-full" onClick={() => router.replace('/register')}>
            Back to sign up
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          {error ? <FormBanner tone="error">{error}</FormBanner> : null}
          {resendMsg ? <FormBanner tone="info">{resendMsg}</FormBanner> : null}
          <div className="space-y-1.5">
            <Label htmlFor="verify-code">6-digit code</Label>
            <OtpInput id="verify-code" value={code} onChange={setCode} disabled={loading} />
          </div>
          <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
            {loading ? 'Verifying...' : 'Verify and continue'}
          </Button>
          <button
            type="button"
            onClick={onResend}
            disabled={cooldown > 0 || resending}
            className="w-full text-center text-sm font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
          >
            {resending ? 'Sending...' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </button>
        </form>
      )}
    </AuthShell>
  )
}

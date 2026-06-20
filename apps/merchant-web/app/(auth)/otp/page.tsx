'use client'

import { Suspense, useEffect, useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthShell } from '@/components/auth/AuthShell'
import { FormBanner } from '@/components/auth/FormBanner'
import { OtpInput } from '@/components/auth/OtpInput'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { authApi } from '@/lib/api/auth'
import { useSession } from '@/lib/auth/session'
import { safeNext } from '@/lib/auth/redirect'
import { authErrorMessage, isExpiredChallenge } from '@/lib/auth/errorMessages'
import { OTP_CHALLENGE_KEY } from '@/lib/auth/constants'

function OtpForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setSession } = useSession()
  const next = safeNext(searchParams.get('next'))

  const [challenge, setChallenge] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // When the challenge is gone (5 wrong attempts / expired), the only way forward is
  // to restart sign-in: we surface a dedicated "back to sign in" state.
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    const stored = window.sessionStorage.getItem(OTP_CHALLENGE_KEY)
    if (!stored) {
      router.replace('/sign-in')
      return
    }
    setChallenge(stored)
  }, [router])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!challenge || code.length !== 6) return
    setError(null)
    setLoading(true)
    try {
      const result = await authApi.verifyOtp({ sessionChallenge: challenge, code })
      window.sessionStorage.removeItem(OTP_CHALLENGE_KEY)
      setSession(result.accessToken, result.merchant)
      router.replace(next)
    } catch (err) {
      const e = authErrorMessage(err)
      if (isExpiredChallenge(e.code)) {
        window.sessionStorage.removeItem(OTP_CHALLENGE_KEY)
        setExpired(true)
        setError('That code has expired. Please sign in again to get a new one.')
      } else {
        setError(e.message)
      }
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Enter your code" subtitle="We sent a 6-digit sign-in code to your email.">
      {expired ? (
        <div className="mt-6 space-y-4">
          <FormBanner tone="error">{error}</FormBanner>
          <Button className="w-full" onClick={() => router.replace('/sign-in')}>
            Back to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          {error ? <FormBanner tone="error">{error}</FormBanner> : null}
          <div className="space-y-1.5">
            <Label htmlFor="otp">6-digit code</Label>
            <OtpInput id="otp" value={code} onChange={setCode} disabled={loading} />
          </div>
          <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
            {loading ? 'Verifying...' : 'Verify and continue'}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}

// useSearchParams requires a Suspense boundary for the static prerender CSR bailout.
export default function OtpPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Enter your code" subtitle="We sent a 6-digit sign-in code to your email.">
          <div className="mt-6 h-44" />
        </AuthShell>
      }
    >
      <OtpForm />
    </Suspense>
  )
}

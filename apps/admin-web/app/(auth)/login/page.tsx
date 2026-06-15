'use client'

/**
 * Admin login — two-step email-OTP flow over the M0 backend.
 *
 *   Step 1 (credentials): email + password -> POST /admin/auth/login.
 *     A successful call returns { status: 'OTP_REQUIRED', sessionChallenge }
 *     and the backend emails a 6-digit code to the admin address.
 *   Step 2 (code): the 6-digit code -> POST /admin/auth/otp/verify.
 *     On success we persist the session (tokens + decoded entityId/sessionId/
 *     role) and route to the protected area.
 *
 * Errors are surfaced in plain language (bad credentials, suspended, invalid /
 * expired code, rate-limited). The code is single-use and the challenge expires;
 * if it is rejected the admin restarts from step 1 (that re-sends a fresh code),
 * which is the resend path.
 */
import { useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShieldCheck, Loader2, ArrowLeft } from 'lucide-react'
import { authApi } from '@/lib/api/auth'
import { ApiError } from '@/lib/api/client'
import { setSession, decodeAdminJwt } from '@/lib/auth/session'
import { useSession } from '@/lib/auth/useSession'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Step = 'credentials' | 'otp'

/**
 * Validate a `?next=` value as a SAME-ORIGIN in-app path before navigating to it
 * after sign-in. Open-redirect defence: it must be a path on this origin, not a
 * protocol-relative URL (`//evil.com`), a backslash-tricked one (`/\evil.com`),
 * or the login page itself (would loop). Anything else falls back to `/`, which
 * then redirects to the queue.
 */
function safeNextPath(raw: string | null): string {
  if (
    raw &&
    raw.startsWith('/') &&
    !raw.startsWith('//') &&
    !raw.startsWith('/\\') &&
    !raw.startsWith('/login')
  ) {
    return raw
  }
  return '/'
}

/** Map a thrown error to a clear, non-leaky message for the operator. */
function messageFor(err: unknown, step: Step): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'INVALID_CREDENTIALS':
        return 'The email or password is incorrect.'
      case 'ACCOUNT_SUSPENDED':
        return 'This admin account is suspended. Contact a super admin.'
      case 'OTP_INVALID':
        return 'That code is incorrect. Check the latest email and try again.'
      case 'ACTION_TOKEN_INVALID':
        return 'This code has expired. Go back and sign in again to get a new one.'
      case 'RATE_LIMITED':
        return 'Too many attempts. Please wait a minute and try again.'
      default:
        return err.message || 'Something went wrong. Please try again.'
    }
  }
  if (step === 'otp') {
    return 'We could not verify that code. Please try again.'
  }
  return 'We could not sign you in. Please check your details and try again.'
}

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const session = useSession()

  // Where to land after a successful sign-in. Validated as a same-origin path.
  const next = safeNextPath(searchParams.get('next'))

  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [challenge, setChallenge] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmitCredentials(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await authApi.login(email.trim(), password)
      if (res.status === 'OTP_REQUIRED') {
        setChallenge(res.sessionChallenge)
        setCode('')
        setStep('otp')
      }
    } catch (err) {
      setError(messageFor(err, 'credentials'))
    } finally {
      setSubmitting(false)
    }
  }

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await authApi.verifyOtp(challenge, code.trim())
      // Decode the access token to capture the entityId + sessionId the refresh
      // endpoint needs; fall back to the admin record for role/email.
      const decoded = decodeAdminJwt(res.accessToken)
      if (!decoded) {
        setError('Sign-in succeeded but the session was malformed. Please try again.')
        return
      }
      setSession({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        meta: {
          entityId: decoded.sub,
          sessionId: decoded.sessionId,
          adminRole: res.admin.adminRole,
          email: res.admin.email,
        },
      })
      session.refresh()
      router.replace(next)
    } catch (err) {
      setError(messageFor(err, 'otp'))
    } finally {
      setSubmitting(false)
    }
  }

  function backToCredentials() {
    setError(null)
    setCode('')
    setChallenge('')
    setStep('credentials')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="size-6" aria-hidden="true" />
          </span>
          <CardTitle className="text-2xl">Redeemo Admin</CardTitle>
          <CardDescription>
            {step === 'credentials'
              ? 'Sign in to the operations console.'
              : 'Two-step verification'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error ? (
            <div
              role="alert"
              className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}

          {step === 'credentials' ? (
            <form onSubmit={onSubmitCredentials} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@redeemo.co.uk"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={submitting || !email || !password}
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Signing in
                  </>
                ) : (
                  'Continue'
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={onSubmitCode} className="space-y-4" noValidate>
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code we emailed to your admin address.
              </p>

              <div className="space-y-2">
                <Label htmlFor="code">Verification code</Label>
                <Input
                  id="code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  autoFocus
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  placeholder="123456"
                  className="text-center text-lg tracking-[0.4em]"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={submitting || code.length !== 6}
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Verifying
                  </>
                ) : (
                  'Verify and sign in'
                )}
              </Button>

              <button
                type="button"
                onClick={backToCredentials}
                disabled={submitting}
                className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                Use a different account or resend a code
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AuthShell } from '@/components/auth/AuthShell'
import { FormBanner } from '@/components/auth/FormBanner'
import { PasswordField } from '@/components/auth/PasswordField'
import { TurnstileWidget } from '@/components/auth/TurnstileWidget'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authApi } from '@/lib/api/auth'
import { getOrCreateDeviceId } from '@/lib/auth/deviceId'
import { passwordPolicyOk } from '@/lib/auth/password'
import { authErrorMessage } from '@/lib/auth/errorMessages'
import { VERIFY_CHALLENGE_KEY } from '@/lib/auth/constants'

// Owner decision (2026-07-11): registration shows a single inline validation
// message instead of the 5-rule live checklist. Text mirrors the actual policy
// in lib/auth/password.ts (passwordChecks/passwordPolicyOk); update both together.
const PASSWORD_HINT = 'Use at least 8 characters, including an uppercase letter, a lowercase letter, a number, and a special character.'

export default function RegisterPage() {
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [mobileCode, setMobileCode] = useState('')
  const [mobile, setMobile] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [password, setPassword] = useState('')
  const [terms, setTerms] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!terms) {
      setError('Please accept the platform terms to continue.')
      return
    }
    if (!passwordPolicyOk(password)) {
      setError('Please meet all the password requirements below.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      // Normalize before submit: email is trimmed + lowercased (case/whitespace
      // variants of one address must not become distinct accounts); names and the
      // business name are trimmed only (case is meaningful there).
      const result = await authApi.register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        mobile: mobile || undefined,
        mobileCountryCode: mobileCode || undefined,
        password,
        businessName: businessName.trim(),
        termsAccepted: true,
        turnstileToken: captchaToken,
        deviceId: getOrCreateDeviceId(),
        deviceType: 'web',
      })
      // VERIFY_EMAIL_SENT is returned for new AND duplicate emails (non-enumerating);
      // we ALWAYS proceed to the verify step with the challenge.
      window.sessionStorage.setItem(VERIFY_CHALLENGE_KEY, result.sessionChallenge)
      router.push('/register/verify')
    } catch (err) {
      setError(authErrorMessage(err).message)
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Set up your Redeemo for Business account."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/sign-in" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        {error ? <FormBanner tone="error">{error}</FormBanner> : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">First name</Label>
            <Input id="firstName" autoComplete="given-name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={loading} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Last name</Label>
            <Input id="lastName" autoComplete="family-name" required value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={loading} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="businessName">Business name</Label>
          <Input id="businessName" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} disabled={loading} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mobile">Mobile (optional)</Label>
          <div className="flex gap-2">
            <Input
              id="mobileCode"
              aria-label="Country code"
              placeholder="+44"
              className="w-20"
              value={mobileCode}
              onChange={(e) => setMobileCode(e.target.value)}
              disabled={loading}
            />
            <Input id="mobile" type="tel" autoComplete="tel-national" className="flex-1" value={mobile} onChange={(e) => setMobile(e.target.value)} disabled={loading} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <PasswordField id="password" value={password} onChange={setPassword} disabled={loading} />
          {password.length > 0 && !passwordPolicyOk(password) ? (
            <p className="text-xs text-[var(--danger)]">{PASSWORD_HINT}</p>
          ) : null}
        </div>

        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            disabled={loading}
            className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
          />
          <span>
            I agree to the Redeemo{' '}
            <a href="https://redeemo.co.uk/terms" target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
              platform terms
            </a>
            {' '}and{' '}
            <a href="https://redeemo.co.uk/privacy" target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
              privacy policy
            </a>
            .
          </span>
        </label>

        <TurnstileWidget onToken={setCaptchaToken} />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating account...' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  )
}

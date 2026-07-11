'use client'

import { Suspense, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthShell } from '@/components/auth/AuthShell'
import { FormBanner } from '@/components/auth/FormBanner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authApi } from '@/lib/api/auth'
import { useSession } from '@/lib/auth/session'
import { getOrCreateDeviceId } from '@/lib/auth/deviceId'
import { safeNext } from '@/lib/auth/redirect'
import { authErrorMessage } from '@/lib/auth/errorMessages'
import { OTP_CHALLENGE_KEY } from '@/lib/auth/constants'

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setSession } = useSession()
  const next = safeNext(searchParams.get('next'))

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await authApi.login({
        // Trimmed + lowercased to match the normalized store for new accounts
        // (backend login lookup stays exact-match during the transition).
        email: email.trim().toLowerCase(),
        password,
        deviceId: getOrCreateDeviceId(),
        deviceType: 'web',
      })
      if ('status' in result) {
        // OTP required. Stash the challenge in sessionStorage (not the URL/history)
        // and hand off to the OTP step, preserving where the user was headed.
        window.sessionStorage.setItem(OTP_CHALLENGE_KEY, result.sessionChallenge)
        router.push(`/otp?next=${encodeURIComponent(next)}`)
        return
      }
      // Recognised device: tokens issued. Land in the portal. setSession awaits the
      // full session-reset pipeline (epoch bump + cache clear) before the new token
      // is installed, so a same-tab login as a different merchant never briefly
      // serves the previous account's cached data.
      await setSession(result.accessToken, result.merchant)
      router.replace(next)
    } catch (err) {
      setError(authErrorMessage(err).message)
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Manage your Redeemo for Business account."
      footer={
        <>
          New to Redeemo?{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create a merchant account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        {error ? <FormBanner tone="error">{error}</FormBanner> : null}

        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  )
}

// useSearchParams requires a Suspense boundary for the static prerender CSR bailout.
export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Sign in" subtitle="Manage your Redeemo for Business account.">
          <div className="mt-6 h-44" />
        </AuthShell>
      }
    >
      <SignInForm />
    </Suspense>
  )
}

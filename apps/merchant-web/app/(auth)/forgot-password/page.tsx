'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/AuthShell'
import { FormBanner } from '@/components/auth/FormBanner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authApi } from '@/lib/api/auth'
import { authErrorMessage } from '@/lib/auth/errorMessages'

// /forgot-password: anti-enumeration. Every outcome (registered, unregistered, send
// failure) shows the SAME generic confirmation; only a rate-limit (429) surfaces an
// error so the user knows to wait.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await authApi.forgotPassword({ email })
      setSent(true)
    } catch (err) {
      const er = authErrorMessage(err)
      if (er.status === 429) {
        setError(er.message)
        setLoading(false)
      } else {
        // never reveal whether the email exists
        setSent(true)
      }
    }
  }

  const backLink = (
    <Link href="/sign-in" className="font-medium text-primary hover:underline">
      Back to sign in
    </Link>
  )

  if (sent) {
    return (
      <AuthShell title="Check your email" footer={backLink}>
        <div className="mt-6">
          <FormBanner tone="success">
            If that email is registered, we have sent a password reset link. It expires in 1 hour.
          </FormBanner>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your work email and we will send you a reset link."
      footer={backLink}
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
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Sending...' : 'Send reset link'}
        </Button>
      </form>
    </AuthShell>
  )
}

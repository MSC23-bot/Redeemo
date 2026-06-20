'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { AuthShell } from './AuthShell'
import { FormBanner } from './FormBanner'
import { PasswordField } from './PasswordField'
import { PasswordRequirements } from './PasswordRequirements'
import { Button, buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { passwordPolicyOk } from '@/lib/auth/password'
import { authErrorMessage } from '@/lib/auth/errorMessages'

// M1 Slice 3: shared token-based set-password form for /claim and /reset-password.
// Neither auto-logs-in (the backend returns only a message), so both route to /sign-in
// on success. The token comes from the page (which reads ?token).
export function SetPasswordForm({
  token,
  title,
  subtitle,
  submitLabel,
  onSubmit,
  successTitle,
  successMessage,
}: {
  token: string | null
  title: string
  subtitle?: string
  submitLabel: string
  onSubmit: (token: string, newPassword: string) => Promise<void>
  successTitle: string
  successMessage: string
}) {
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (!token) {
    return (
      <AuthShell title="Link not valid" subtitle="This link is invalid or has expired.">
        <div className="mt-6">
          <Link href="/sign-in" className={cn(buttonVariants(), 'w-full')}>
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    )
  }

  if (done) {
    return (
      <AuthShell title={successTitle}>
        <div className="mt-6 space-y-4">
          <FormBanner tone="success">{successMessage}</FormBanner>
          <Link href="/sign-in" className={cn(buttonVariants(), 'w-full')}>
            Go to sign in
          </Link>
        </div>
      </AuthShell>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!token) return // narrows the captured prop for onSubmit below
    if (!passwordPolicyOk(pw)) {
      setError('Please meet all the password requirements below.')
      return
    }
    if (pw !== confirm) {
      setError('The passwords do not match.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await onSubmit(token, pw)
      setDone(true)
    } catch (err) {
      setError(authErrorMessage(err).message)
      setLoading(false)
    }
  }

  return (
    <AuthShell title={title} subtitle={subtitle}>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {error ? <FormBanner tone="error">{error}</FormBanner> : null}
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <PasswordField id="password" value={pw} onChange={setPw} disabled={loading} />
        </div>
        <PasswordRequirements password={pw} />
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <PasswordField id="confirm" value={confirm} onChange={setConfirm} disabled={loading} />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Saving...' : submitLabel}
        </Button>
      </form>
    </AuthShell>
  )
}

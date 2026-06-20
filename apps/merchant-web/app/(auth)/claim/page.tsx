'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AuthShell } from '@/components/auth/AuthShell'
import { SetPasswordForm } from '@/components/auth/SetPasswordForm'
import { authApi } from '@/lib/api/auth'

// /claim: a draft-owner (admin-created account) sets their first password via the
// emailed single-use token. Claim proves email control (the link reached the owner)
// but does NOT auto-login, so success routes to /sign-in.
function ClaimInner() {
  const token = useSearchParams().get('token')
  return (
    <SetPasswordForm
      token={token}
      title="Set up your account"
      subtitle="Create a password to finish setting up your Redeemo for Business account."
      submitLabel="Set password"
      onSubmit={async (t, newPassword) => {
        await authApi.claim({ token: t, newPassword })
      }}
      successTitle="Account ready"
      successMessage="Your password is set. Please sign in to continue."
    />
  )
}

export default function ClaimPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Set up your account">
          <div className="mt-6 h-60" />
        </AuthShell>
      }
    >
      <ClaimInner />
    </Suspense>
  )
}

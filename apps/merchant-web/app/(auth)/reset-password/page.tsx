'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AuthShell } from '@/components/auth/AuthShell'
import { SetPasswordForm } from '@/components/auth/SetPasswordForm'
import { authApi } from '@/lib/api/auth'

function ResetInner() {
  const token = useSearchParams().get('token')
  return (
    <SetPasswordForm
      token={token}
      title="Set a new password"
      subtitle="Choose a new password for your Redeemo for Business account."
      submitLabel="Update password"
      onSubmit={async (t, newPassword) => {
        await authApi.resetPassword({ token: t, newPassword })
      }}
      successTitle="Password updated"
      successMessage="Your password has been updated. Please sign in with your new password."
    />
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Set a new password">
          <div className="mt-6 h-60" />
        </AuthShell>
      }
    >
      <ResetInner />
    </Suspense>
  )
}

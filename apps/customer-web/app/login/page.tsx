import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AuthShell } from '@/components/auth/AuthShell'
import { LoginForm } from '@/components/auth/LoginForm'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your Redeemo account.',
}

export default function LoginPage() {
  return (
    <AuthShell
      heading="Welcome back."
      subheading="Sign in to access your vouchers and savings."
    >
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-navy/5" />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  )
}

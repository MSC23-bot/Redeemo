import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/AuthShell'
import { RegisterForm } from '@/components/auth/RegisterForm'

export const metadata: Metadata = {
  title: 'Create account',
  description: 'Join Redeemo free and discover exclusive vouchers from local businesses near you.',
}

export default function RegisterPage() {
  return (
    <AuthShell
      heading="Join Redeemo free."
      subheading="Discover exclusive vouchers from local businesses near you."
    >
      <RegisterForm />
    </AuthShell>
  )
}

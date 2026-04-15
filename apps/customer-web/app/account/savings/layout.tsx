import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'My Savings' }

export default function SavingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

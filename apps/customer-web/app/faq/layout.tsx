import type { Metadata } from 'next'

// faq/page.tsx is a client component, so its metadata lives here in a server
// layout. Membership-framed copy (Maya voice); no em dash, no "deal" language.
export const metadata: Metadata = {
  title: 'Membership questions',
  description:
    "How membership works, what's included, and how you use a member voucher in venue. Browse free, no card needed.",
}

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

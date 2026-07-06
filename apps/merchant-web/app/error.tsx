'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'

// Root-level error boundary. Next.js App Router rule: an error.tsx wraps its own
// route segment's `children`, NOT that same segment's layout.tsx (see the comment
// on app/(app)/error.tsx for the full explanation). Concretely, MerchantPortalShell
// (rendered by app/(app)/layout.tsx) sits ABOVE app/(app)/error.tsx in the tree, so
// a render failure inside the shell itself - a bad session/profile hook, a sidebar
// nav crash, anything thrown before {children} is reached - is invisible to that
// file and used to fall through to Next's unbranded default error screen.
//
// This file is the fix: it lives next to the ROOT app/layout.tsx, so it is nested
// INSIDE the root layout and wraps root's `children` - which is exactly where
// app/(app)/layout.tsx (and app/(auth)/layout.tsx) render. A throw anywhere in the
// (app) shell's own render is therefore caught here, one level up, while the more
// specific app/(app)/error.tsx continues to handle page-level throws inside the
// shell as before (React error boundaries nest; the innermost one that can see an
// error wins). This also serves as the catch-all for anything that slips past
// every more specific boundary.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const alertRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Best-effort console visibility only - no secrets, no remote reporting here.
    console.error(error)
    // Move focus into the alert region so screen-reader and keyboard users are
    // notified of the failure immediately, instead of focus silently staying on
    // whatever was focused before the crash (or landing on <body>).
    alertRef.current?.focus()
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div ref={alertRef} role="alert" tabIndex={-1} className="w-full max-w-md space-y-5 text-center">
        <span
          className="font-display text-2xl font-semibold"
          style={{
            backgroundImage: 'var(--brand-gradient)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}
        >
          Redeemo
        </span>

        <div className="rounded-[20px] border border-[#EFE7E2] bg-white px-6 py-8 shadow-[0_1px_2px_rgba(1,12,53,0.04),0_18px_44px_-28px_rgba(1,12,53,0.32)]">
          <span
            aria-hidden="true"
            className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#FFF1EC] text-[#E84A00]"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3.5 21.5 20H2.5ZM12 10v4M12 17.6h.01" />
            </svg>
          </span>
          <h1 className="mt-3 font-display text-lg font-semibold text-foreground">Something went wrong</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#566079]">
            We hit a snag loading this page. Nothing you did caused this, and your data is safe.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button type="button" variant="gradient" onClick={reset}>
            Try again
          </Button>
          <Link href="/" className={buttonVariants({ variant: 'secondary' })}>
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}

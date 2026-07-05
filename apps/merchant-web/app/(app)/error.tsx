'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'

// Route-level error boundary for the authenticated (app) shell (Next.js App
// Router convention: error.tsx wraps this route segment and its children in a
// React error boundary; the sibling app/(app)/layout.tsx - MerchantPortalShell's
// sidebar/topbar - sits ABOVE this file in the tree, so it keeps rendering
// around this fallback rather than being torn down). Without this file, an
// uncaught render throw anywhere under (app) fell through to Next's unbranded
// default error screen.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Best-effort console visibility only - no secrets, no remote reporting here.
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <div className="w-full max-w-md space-y-5 text-center">
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
          <h1 className="mt-3 font-display text-lg font-semibold text-foreground">Something went wrong on our side</h1>
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

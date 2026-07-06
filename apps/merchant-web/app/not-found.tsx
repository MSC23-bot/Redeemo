import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

// Root-level not-found boundary (Next.js App Router convention: a not-found.tsx
// at the app root covers every unmatched route across the whole app, including
// paths outside both the (app) and (auth) route groups). Renders inside the
// root app/layout.tsx only - no portal sidebar/topbar, matching the plain,
// centred treatment the (auth) screens already use for unauthenticated visitors.
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-5 text-center">
        <div>
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
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">for Business</p>
        </div>

        <div className="rounded-[20px] border border-[#EFE7E2] bg-white px-6 py-8 shadow-[0_1px_2px_rgba(1,12,53,0.04),0_18px_44px_-28px_rgba(1,12,53,0.32)]">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-[#E84A00]">404</div>
          <h1 className="mt-1.5 font-display text-lg font-semibold text-foreground">We could not find that page</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#566079]">
            The page you are looking for does not exist, or may have moved.
          </p>
        </div>

        <Link href="/" className={buttonVariants({ variant: 'gradient' })}>
          Back to dashboard
        </Link>
      </div>
    </main>
  )
}

'use client'

/**
 * A8: shared skeleton-loading primitives. Every merchant-web route currently gates its
 * content slot on a literal "Loading X..." text string (see the A8 audit in the PR body);
 * these primitives replace that flash-of-text with a layout-matching placeholder while
 * keeping the exact same accessible contract: ONE `role="status" aria-live="polite"`
 * region per loading gate (several existing page tests assert `getByRole('status')`
 * singular), carrying the ORIGINAL sr-only copy so `getByText(/loading your account/i)`
 * style assertions keep passing unchanged.
 *
 * Reduced motion (mirrors the local `usePrefersReducedMotion` in
 * components/insights/MetricInfo.tsx, duplicated here rather than shared so this file
 * stays a self-contained, additive primitive with no risk to that existing surface): the
 * shimmer is suppressed at the JS level (not just via a CSS media query) so it is
 * unit-testable with a mocked `matchMedia`.
 *
 * Tokens only: `bg-muted` / `bg-card` / `border-border` are the existing shadcn-semantic
 * utilities mapped from `app/globals.css`; no new colours.
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = React.useState(false)
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduce(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduce(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduce
}

/** The base bone. Every composed shape below is built from this. */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  const reduceMotion = usePrefersReducedMotion()
  return (
    <div
      data-slot="skeleton"
      data-testid="skeleton-bone"
      className={cn('rounded-md bg-muted', !reduceMotion && 'animate-pulse', className)}
      {...props}
    />
  )
}

/** A single text-line bone. `w` takes a Tailwind width utility (default full width). */
export function SkeletonText({
  className,
  w = 'w-full',
}: {
  className?: string
  w?: string
}) {
  return <Skeleton className={cn('h-3.5', w, className)} />
}

/** A circular bone (icon slots / avatars). */
export function SkeletonCircle({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <Skeleton
      className={cn('shrink-0 rounded-full', className)}
      style={{ width: size, height: size }}
    />
  )
}

/**
 * A card-chrome bone matching `components/ui/card.tsx` (rounded-xl border bg-card): a
 * head row (optional icon + a label bar) followed by N body lines. Covers KPI tiles,
 * voucher-card rows, and the info cards on Business Profile / My Account.
 */
export function SkeletonCard({
  lines = 3,
  showIcon = false,
  className,
}: {
  lines?: number
  showIcon?: boolean
  className?: string
}) {
  return (
    <div
      className={cn('flex flex-col gap-3 rounded-2xl border border-border bg-card p-5', className)}
    >
      <div className="flex items-start justify-between gap-2">
        <SkeletonText w="w-1/3" />
        {showIcon && <SkeletonCircle size={36} />}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonText key={i} w={i === 0 ? 'w-2/3' : i % 2 === 0 ? 'w-1/2' : 'w-full'} />
        ))}
      </div>
    </div>
  )
}

/** The 4-tile KPI row bone (Insights overview / Home KPIs). */
export function SkeletonKpiRow({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={2} showIcon />
      ))}
    </div>
  )
}

/** A chart-card bone (TrendChart / BusiestDays / the Home charts row). */
export function SkeletonChartBlock({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-4 rounded-2xl border border-border bg-card p-5', className)}>
      <SkeletonText w="w-1/4" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  )
}

/**
 * A table bone: an optional header bar + N row bones inside the same rounded-xl
 * border/bg-card chrome the real tables use. `columns` controls how many bars sit in
 * each row (proportioned to roughly mirror a real column count).
 */
export function SkeletonTable({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number
  columns?: number
  className?: string
}) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className={cn(
            'flex items-center gap-4 px-4 py-3.5',
            r !== rows - 1 && 'border-b border-border',
          )}
        >
          {Array.from({ length: columns }).map((_, c) => (
            <SkeletonText key={c} w={c === 0 ? 'w-20' : 'flex-1'} />
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * A stack of `SkeletonCard`s (Vouchers list, Business Profile, My Account): every
 * surface that is really "a handful of cards stacked" reuses this instead of a bespoke
 * shape per page.
 */
export function SkeletonCardList({
  count = 3,
  lines = 3,
  className,
}: {
  count?: number
  lines?: number
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </div>
  )
}

/**
 * The shared accessible wrapper: ONE `role="status"` region per loading gate. `label`
 * is the exact existing copy (kept for every already-passing `getByText`/aria-label
 * assertion); the skeleton bones render underneath, `aria-hidden` so a screen reader
 * hears the label once rather than walking decorative bones.
 */
export function LoadingStatus({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  )
}

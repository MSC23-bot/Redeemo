'use client'

/**
 * PlaceholderTab: the honest not-yet-built panel for every Merchant 360 tab that
 * does not render real content in slice A1. It shows the tab title and the
 * spec's honest reason (queued for a later slice, or gated on a net-new
 * endpoint / schema / privacy or billing gate). It NEVER shows fabricated data.
 */
import { Info } from 'lucide-react'
import { M360_PLACEHOLDER_COPY } from './tabs'
import type { M360TabKey } from './tabs'

type PlaceholderKey = Exclude<
  M360TabKey,
  'overview' | 'identity' | 'branches' | 'vouchers' | 'redemptions' | 'documents' | 'activity'
>

export function PlaceholderTab({ tabKey }: { tabKey: PlaceholderKey }) {
  const copy = M360_PLACEHOLDER_COPY[tabKey]
  return (
    <section
      className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center"
      data-testid={`workspace-placeholder-${tabKey}`}
    >
      <Info className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-sm font-semibold text-foreground">{copy.title}</h2>
      <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">{copy.body}</p>
    </section>
  )
}

'use client'

/**
 * ActivityTimeline — read-only "communication + activity" feed for a merchant.
 *
 * Replaces the old approval-scoped audit card. Fetches
 * GET /api/v1/admin/merchants/:id/timeline and renders the merged, newest-first
 * feed of merchant lifecycle actions interleaved with the OWNER's lifecycle
 * emails (with delivery state). The backend already sorts the items newest-first
 * and strips every sensitive field, so this component renders the list in the
 * given order without re-sorting.
 *
 * Locked owner decision (D1): the email history is resolved via the OWNER
 * account, not a perfect merchant-specific correspondence record, so a visible
 * label discloses that whenever an owner resolved.
 */
import { Loader2, AlertCircle } from 'lucide-react'
import { useTimeline } from '@/lib/timeline/useTimeline'
import { ActionRow } from './ActionRow'
import { EmailRow } from './EmailRow'

/**
 * Optional view filter over the merged feed. `all` (default) preserves the
 * original behaviour; `comms` shows only the owner lifecycle emails; `actions`
 * shows only the merchant lifecycle action rows. The feed is a discriminated
 * union (`kind: 'email' | 'action'`), so the split is a trivial predicate.
 */
export type TimelineFilter = 'all' | 'comms' | 'actions'

interface ActivityTimelineProps {
  merchantId: string
  enabled?: boolean
  filter?: TimelineFilter
}

function TimelineShell({ children }: { children: React.ReactNode }) {
  return (
    <section aria-labelledby="timeline-heading" data-testid="activity-timeline">
      <h2 id="timeline-heading" className="mb-3 text-sm font-semibold text-foreground">
        Activity and communications
      </h2>
      {children}
    </section>
  )
}

export function ActivityTimeline({
  merchantId,
  enabled = true,
  filter = 'all',
}: ActivityTimelineProps) {
  const { data, isLoading, isError, refetch } = useTimeline(merchantId, enabled)

  if (isLoading) {
    return (
      <TimelineShell>
        <div
          className="flex items-center justify-center rounded-lg border border-border bg-card py-10"
          data-testid="timeline-loading"
        >
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading activity" />
        </div>
      </TimelineShell>
    )
  }

  if (isError || !data) {
    return (
      <TimelineShell>
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-8 text-center"
          data-testid="timeline-error"
        >
          <AlertCircle className="mx-auto mb-3 size-5 text-destructive" aria-hidden="true" />
          <p className="mb-3 text-sm text-destructive">
            Could not load the activity timeline. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm font-medium text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      </TimelineShell>
    )
  }

  const { items, emailsResolvedViaOwner } = data

  // View filter over the already-sorted feed (default `all` = no change).
  const visibleItems = items.filter((item) => {
    if (filter === 'comms') return item.kind === 'email'
    if (filter === 'actions') return item.kind === 'action'
    return true
  })

  // Owner-resolution disclosure (locked D1): never imply a perfect
  // merchant-specific correspondence history.
  const ownerLabel = emailsResolvedViaOwner ? (
    <p
      className="mt-2 text-xs text-muted-foreground"
      data-testid="timeline-owner-resolved-label"
    >
      Email history is resolved via the owner account.
    </p>
  ) : (
    <p className="mt-2 text-xs text-muted-foreground" data-testid="timeline-no-owner-emails">
      Email history is unavailable: no owner account resolved.
    </p>
  )

  if (visibleItems.length === 0) {
    // Distinguish a genuinely empty feed from a filtered-out view so the
    // operator is not misled into thinking there is no history at all.
    const emptyCopy =
      items.length === 0
        ? 'No activity recorded yet.'
        : filter === 'comms'
          ? 'No communications in this view.'
          : 'No actions in this view.'
    return (
      <TimelineShell>
        <div className="rounded-lg border border-border bg-card px-6 py-8 text-center">
          <p className="text-sm text-muted-foreground" data-testid="timeline-empty">
            {emptyCopy}
          </p>
        </div>
        {ownerLabel}
      </TimelineShell>
    )
  }

  return (
    <TimelineShell>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <ul role="list" className="divide-y divide-border">
          {visibleItems.map((item) =>
            item.kind === 'action' ? (
              <ActionRow key={`action-${item.id}`} item={item} />
            ) : (
              <EmailRow key={`email-${item.id}`} item={item} />
            )
          )}
        </ul>
      </div>
      {ownerLabel}
    </TimelineShell>
  )
}

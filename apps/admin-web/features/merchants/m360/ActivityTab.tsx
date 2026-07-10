'use client'

/**
 * ActivityTab: rehomes the per-merchant ActivityTimeline (spec
 * merchant-360-spec.md). The prototype's separate Comms + Audit tabs collapse
 * into one Activity tab for v1 (recorded plan divergence: both feeds already
 * come from the same timeline read); a lightweight All / Comms / Actions filter
 * chip row lets the operator narrow the merged feed without a second endpoint.
 *
 * Fail-closed capability gate: the timeline read
 * (`GET /admin/merchants/:id/timeline`) is enforced on `approval:read` by the
 * backend (same as the review-context read). The page fail-closes on
 * `merchant:read`, but an admin with `merchant:read` and NOT `approval:read`
 * must not fire the request, so this tab renders a denied panel that names the
 * capability and passes `enabled=false` down (both UI-gate and never-fire).
 */
import { useState } from 'react'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ActivityTimeline } from '@/features/timeline/ActivityTimeline'
import type { TimelineFilter } from '@/features/timeline/ActivityTimeline'

const FILTERS: readonly { key: TimelineFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'comms', label: 'Comms' },
  { key: 'actions', label: 'Actions' },
]

interface ActivityTabProps {
  merchantId: string
  canReadActivity: boolean
}

export function ActivityTab({ merchantId, canReadActivity }: ActivityTabProps) {
  const [filter, setFilter] = useState<TimelineFilter>('all')

  if (!canReadActivity) {
    return (
      <section
        className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center"
        data-testid="workspace-activity-denied"
      >
        <Lock className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-foreground">Activity</h2>
        <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">
          You do not have access to this merchant&apos;s activity. The activity and communications
          timeline needs the approval:read capability, which your role does not hold.
        </p>
      </section>
    )
  }

  return (
    <div className="space-y-4" data-testid="workspace-activity">
      <div
        role="group"
        aria-label="Filter activity"
        className="flex flex-wrap gap-1"
        data-testid="activity-filter"
      >
        {FILTERS.map(({ key, label }) => {
          const isActive = key === filter
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={isActive}
              data-testid={`activity-filter-${key}`}
              data-active={isActive ? 'true' : 'false'}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          )
        })}
      </div>

      <ActivityTimeline merchantId={merchantId} enabled={canReadActivity} filter={filter} />
    </div>
  )
}

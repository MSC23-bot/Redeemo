/**
 * ActivityList — read-only audit trail for an approval.
 *
 * Shows audit log events in newest-first order. Each event has a human-readable
 * label, the acting party (admin name or "Merchant" or "System"), and a relative
 * timestamp. Capped at 50 rows by the backend.
 */
import { formatRelativeTime } from '@/lib/notifications/relativeTime'
import { cn } from '@/lib/utils'
import type { ReviewActivity } from '@/lib/api/review'

interface ActivityListProps {
  activity: ReviewActivity[]
}

const EVENT_LABELS: Record<string, string> = {
  MERCHANT_DRAFT_CREATED: 'Draft merchant created',
  MERCHANT_CONTRACT_ACCEPTED: 'Contract accepted',
  MERCHANT_SUBMITTED_FOR_APPROVAL: 'Submitted for review',
  MERCHANT_RESUBMITTED: 'Resubmitted for review',
  MERCHANT_APPROVAL_CLAIMED: 'Approval claimed',
  MERCHANT_APPROVAL_RELEASED: 'Approval released',
  MERCHANT_CHANGES_REQUESTED: 'Changes requested',
  MERCHANT_APPROVAL_REJECTED: 'Approval rejected',
  MERCHANT_APPROVAL_APPROVED: 'Approval approved',
  MERCHANT_GO_LIVE: 'Merchant went live',
  MERCHANT_SUSPENDED: 'Merchant suspended',
  MERCHANT_REACTIVATED: 'Merchant reactivated',
  MERCHANT_CLAIM_COMPLETED: 'Account claimed',
  MEMBERSHIP_CREATED: 'Membership created',
  BRANCH_LOCATION_CONFIRMED: 'Branch location confirmed',
}

function eventLabel(event: string): string {
  return EVENT_LABELS[event] ?? event
}

function actorLabel(activity: ReviewActivity): string {
  if (activity.actorType === 'ADMIN') {
    return activity.actor?.name ?? 'Admin'
  }
  if (activity.actorType === 'MERCHANT') return 'Merchant'
  if (activity.actorType === 'SYSTEM') return 'System'
  return 'Unknown'
}

export function ActivityList({ activity }: ActivityListProps) {
  if (activity.length === 0) {
    return (
      <section aria-labelledby="activity-heading" data-testid="activity-list">
        <h2 id="activity-heading" className="text-sm font-semibold text-foreground mb-3">
          Activity
        </h2>
        <div className="rounded-lg border border-border bg-card px-6 py-8 text-center">
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="activity-heading" data-testid="activity-list">
      <h2 id="activity-heading" className="text-sm font-semibold text-foreground mb-3">
        Activity
      </h2>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <ul role="list" className="divide-y divide-border">
          {activity.map((row, idx) => (
            <li
              key={row.id}
              className={cn(
                'px-4 py-3 flex items-start gap-3',
                idx % 2 === 0 ? 'bg-card' : 'bg-secondary/10'
              )}
              data-testid={`activity-row-${row.id}`}
            >
              {/* Timeline dot */}
              <span
                aria-hidden="true"
                className="mt-1.5 inline-flex size-2 shrink-0 rounded-full bg-border"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">
                    {eventLabel(row.event)}
                  </span>
                  <time
                    dateTime={row.createdAt}
                    className="text-xs text-muted-foreground shrink-0"
                    title={new Date(row.createdAt).toLocaleString('en-GB')}
                  >
                    {formatRelativeTime(row.createdAt)}
                  </time>
                </div>

                <p className="text-xs text-muted-foreground mt-0.5">
                  {actorLabel(row)}
                  {row.reason && (
                    <span className="ml-1 italic">— {row.reason}</span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

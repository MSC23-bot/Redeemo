/**
 * ActionRow — renders one merchant lifecycle action (kind: 'action') in the
 * timeline. A friendly event label, the acting party (admin name / "Merchant" /
 * "System"), an optional reason, and a relative timestamp.
 *
 * Visual: a small neutral dot marks an action, so it reads differently from an
 * EmailRow (which carries a Mail icon).
 */
import { Dot } from 'lucide-react'
import { formatRelativeTime } from '@/lib/notifications/relativeTime'
import type { TimelineActionItem } from '@/lib/api/timeline'

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

function actorLabel(item: TimelineActionItem): string {
  if (item.actorType === 'ADMIN') {
    return item.actorName ?? 'Admin'
  }
  if (item.actorType === 'MERCHANT') return 'Merchant'
  if (item.actorType === 'SYSTEM') return 'System'
  return 'Unknown'
}

export function ActionRow({ item }: { item: TimelineActionItem }) {
  return (
    <li
      className="flex items-start gap-3 px-4 py-3"
      data-testid={`timeline-action-${item.id}`}
    >
      {/* Action marker: a small neutral dot inside a muted chip. */}
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground"
      >
        <Dot className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{eventLabel(item.event)}</span>
          <time
            dateTime={item.at}
            className="shrink-0 text-xs text-muted-foreground"
            title={new Date(item.at).toLocaleString('en-GB')}
          >
            {formatRelativeTime(item.at)}
          </time>
        </div>

        <p className="mt-0.5 text-xs text-muted-foreground">{actorLabel(item)}</p>

        {item.reason && (
          <p className="mt-1 text-xs italic text-muted-foreground">{item.reason}</p>
        )}
      </div>
    </li>
  )
}

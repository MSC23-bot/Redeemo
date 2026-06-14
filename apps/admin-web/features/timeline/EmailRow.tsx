/**
 * EmailRow — renders one owner lifecycle email (kind: 'email') in the timeline.
 * A friendly email-type label, the subject (muted), a delivery-status badge,
 * and a relative timestamp.
 *
 * Visual: a Mail icon marks an email, so it reads as a communication rather than
 * an action (which carries a neutral dot).
 *
 * The backend only ever returns the safe email shape (id/type/subject/status/
 * channel/at) — no payload, recipient routing, or branch-PIN emails — so this
 * row renders nothing sensitive.
 */
import { Mail } from 'lucide-react'
import { DeliveryBadge } from './DeliveryBadge'
import { formatRelativeTime } from '@/lib/notifications/relativeTime'
import type { TimelineEmailItem } from '@/lib/api/timeline'

const TYPE_LABELS: Record<string, string> = {
  merchant_claim: 'Account setup email',
  merchant_changes_requested: 'Changes requested',
  merchant_rejected: 'Application update',
  merchant_live: 'Went live confirmation',
}

/** Humanize a raw email type: underscores -> spaces, sentence case. */
function humanizeType(type: string): string {
  const words = type.replace(/_/g, ' ').trim().toLowerCase()
  if (words.length === 0) return type
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? humanizeType(type)
}

export function EmailRow({ item }: { item: TimelineEmailItem }) {
  return (
    <li
      className="flex items-start gap-3 px-4 py-3"
      data-testid={`timeline-email-${item.id}`}
    >
      {/* Email marker: a Mail icon inside a muted chip. */}
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground"
      >
        <Mail className="size-3.5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{typeLabel(item.type)}</span>
          <time
            dateTime={item.at}
            className="shrink-0 text-xs text-muted-foreground"
            title={new Date(item.at).toLocaleString('en-GB')}
          >
            {formatRelativeTime(item.at)}
          </time>
        </div>

        {item.subject && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.subject}</p>
        )}

        <div className="mt-1.5">
          <DeliveryBadge status={item.status} />
        </div>
      </div>
    </li>
  )
}

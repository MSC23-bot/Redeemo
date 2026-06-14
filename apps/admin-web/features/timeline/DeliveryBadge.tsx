/**
 * DeliveryBadge — maps a CommunicationLog delivery status to the shared Badge.
 *
 * Mapping:
 *   QUEUED  -> neutral "Queued"
 *   SENT    -> success "Sent"
 *   FAILED  -> danger  "Failed"
 *   BOUNCED -> warn    "Bounced"
 */
import { Badge } from '@/features/shared/Badge'
import type { BadgeTone } from '@/features/shared/Badge'
import type { CommunicationStatusValue } from '@/lib/api/timeline'

const STATUS_BADGE: Record<CommunicationStatusValue, { tone: BadgeTone; label: string }> = {
  QUEUED: { tone: 'neutral', label: 'Queued' },
  SENT: { tone: 'success', label: 'Sent' },
  FAILED: { tone: 'danger', label: 'Failed' },
  BOUNCED: { tone: 'warn', label: 'Bounced' },
}

export function DeliveryBadge({ status }: { status: CommunicationStatusValue }) {
  const { tone, label } = STATUS_BADGE[status]
  return (
    <span data-testid={`delivery-badge-${status}`}>
      <Badge tone={tone}>{label}</Badge>
    </span>
  )
}

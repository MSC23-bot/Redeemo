/**
 * UrgencyBadge — waiting-age pill for a queue row.
 *
 * Shows how long a submission has been waiting, tinted by urgency:
 *   neutral   -> muted text
 *   amber     -> warm warning colour
 *   red       -> destructive brand red
 */
import { urgencyForAge, formatWaiting, urgencyTextClass, type Urgency } from '@/lib/queue/urgency'
import { cn } from '@/lib/utils'

interface UrgencyBadgeProps {
  submittedAtIso: string
  /** Override now (ms) — useful for tests. */
  now?: number
}

/** Maps urgency level to a screen-reader-only severity suffix. */
function urgencySrSuffix(urgency: Urgency): string {
  if (urgency === 'red') return ' (urgent)'
  if (urgency === 'amber') return ' (warning)'
  return ''
}

export function UrgencyBadge({ submittedAtIso, now }: UrgencyBadgeProps) {
  const urgency = urgencyForAge(submittedAtIso, now)
  const label = formatWaiting(submittedAtIso, now)
  const srSuffix = urgencySrSuffix(urgency)

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        'border border-border bg-secondary',
        urgencyTextClass(urgency)
      )}
    >
      {label}
      {srSuffix && (
        <span className="sr-only">{srSuffix}</span>
      )}
    </span>
  )
}

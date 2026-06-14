/**
 * Urgency helpers for the approval queue.
 *
 * Both functions are pure (accept an optional `now` param) so they are trivial
 * to unit-test without mocking Date.now().
 */

export type Urgency = 'neutral' | 'amber' | 'red'

/**
 * Derives urgency from the age of a submission.
 *   < 3 days  -> neutral
 *   >= 3 days and < 5 days -> amber
 *   >= 5 days -> red
 */
export function urgencyForAge(
  submittedAtIso: string,
  now: number = Date.now()
): Urgency {
  const daysWaiting = Math.floor((now - new Date(submittedAtIso).getTime()) / 86_400_000)
  if (daysWaiting >= 5) return 'red'
  if (daysWaiting >= 3) return 'amber'
  return 'neutral'
}

/**
 * Human-readable waiting duration from submission to now.
 *   >= 1 day  -> "N day" / "N days"
 *   >= 1 hour -> "N hour" / "N hours"
 *   else      -> "under an hour"
 */
export function formatWaiting(
  submittedAtIso: string,
  now: number = Date.now()
): string {
  const ms = now - new Date(submittedAtIso).getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days >= 1) return days === 1 ? '1 day' : `${days} days`
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 1) return hours === 1 ? '1 hour' : `${hours} hours`
  return 'under an hour'
}

/** Tailwind class for urgency text colour. */
export function urgencyTextClass(urgency: Urgency): string {
  if (urgency === 'red') return 'text-destructive'
  if (urgency === 'amber') return 'text-amber-600'
  return 'text-muted-foreground'
}

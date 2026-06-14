/**
 * Pure relative-time formatter.
 *
 * Returns a compact human-readable string relative to `now` (defaults to
 * Date.now()). `now` is an explicit parameter so the function is unit-testable
 * without fake timers.
 *
 * Examples:
 *   < 1 min  -> "just now"
 *   < 1 hr   -> "2m ago"
 *   < 24 hrs -> "3h ago"
 *   < 7 days -> "Mon"  (abbreviated weekday)
 *   otherwise -> "Apr 4" (abbreviated month + day)
 */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  const diffMs = now - then
  const diffSecs = Math.floor(diffMs / 1_000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffHours < 1) return `${diffMins}m ago`
  if (diffDays < 1) return `${diffHours}h ago`

  const date = new Date(then)

  if (diffDays < 7) {
    return date.toLocaleDateString('en-GB', { weekday: 'short' })
  }

  return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
}

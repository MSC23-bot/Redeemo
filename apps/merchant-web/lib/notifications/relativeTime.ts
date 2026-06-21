// Pure relative-time formatter for the notification bell + list. Buckets:
//   < 60s            -> "just now"
//   < 60m            -> "Nm ago"
//   < 24h            -> "Nh ago"
//   < 7d             -> "Nd ago"
//   >= 7d (or older) -> a short date ("13 Jun" / "13 Jun 2025" across years)
// `now` is injectable for deterministic tests.
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  const ms = now.getTime() - then.getTime()

  // Defensive: an unparseable date or a future timestamp falls back to a short date.
  if (Number.isNaN(then.getTime())) return ''
  if (ms < 0) return formatShortDate(then, now)

  if (ms < MINUTE) return 'just now'
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m ago`
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ago`
  if (ms < WEEK) return `${Math.floor(ms / DAY)}d ago`
  return formatShortDate(then, now)
}

function formatShortDate(date: Date, now: Date): string {
  const sameYear = date.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date)
}

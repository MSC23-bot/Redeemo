type Hours = {
  dayOfWeek: number        // 0=Sun, 1=Mon, ..., 6=Sat
  openTime: string | null  // "HH:MM"
  closeTime: string | null // "HH:MM"
  isClosed: boolean
}

/**
 * Returns true if the venue is currently open based on its BranchOpeningHours.
 * All comparisons are done in Europe/London time (handles BST/GMT automatically).
 * Pass `now` for testability (defaults to new Date()).
 */
export function isOpenNow(hours: Hours[], now: Date = new Date()): boolean {
  // Convert `now` to GB local time
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(now)
  const weekdayShort = parts.find(p => p.type === 'weekday')?.value  // 'Mon', 'Tue', etc.
  const hour   = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10)
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10)

  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }
  const dayOfWeek = weekdayShort ? weekdayMap[weekdayShort] : -1

  const todayHours = hours.find(h => h.dayOfWeek === dayOfWeek)
  if (!todayHours || todayHours.isClosed) return false
  if (!todayHours.openTime || !todayHours.closeTime) return false

  const [openH, openM]   = todayHours.openTime.split(':').map(Number)
  const [closeH, closeM] = todayHours.closeTime.split(':').map(Number)
  const nowMins   = hour * 60 + minute
  const openMins  = openH * 60 + openM
  const closeMins = closeH * 60 + closeM

  return nowMins >= openMins && nowMins < closeMins
}

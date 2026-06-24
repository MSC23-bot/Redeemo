// Branches PR-1 F1: a PURE CLIENT MIRROR of src/api/shared/isOpenNow.ts. Used for
// the "Open right now" summary count (F2) and the Today's-hours cell. All
// comparisons are done in Europe/London time (handles BST/GMT automatically).
//
// IMPORTANT: this intentionally reproduces the backend's CURRENT behaviour,
// including the documented cross-midnight limitation (closeTime must be greater
// than openTime within the same calendar day; an overnight window like
// 22:00->02:00 reads closed). Do NOT "fix" cross-midnight here: that is PR-8.

export interface OpeningHoursRow {
  dayOfWeek: number // 0=Sun, 1=Mon, ..., 6=Sat
  openTime?: string | null // "HH:MM"
  closeTime?: string | null // "HH:MM"
  isClosed: boolean
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/**
 * Returns true if the branch is currently open based on its openingHours.
 * `now` is injectable for testability (defaults to new Date()).
 */
export function openNow(openingHours: OpeningHoursRow[], now: Date = new Date()): boolean {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(now)
  const weekdayShort = parts.find((p) => p.type === 'weekday')?.value // 'Mon', 'Tue', ...
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)

  const dayOfWeek = weekdayShort ? WEEKDAY_MAP[weekdayShort] : -1

  const todayHours = openingHours.find((h) => h.dayOfWeek === dayOfWeek)
  if (!todayHours || todayHours.isClosed) return false
  if (!todayHours.openTime || !todayHours.closeTime) return false

  const [openH, openM] = todayHours.openTime.split(':').map(Number)
  const [closeH, closeM] = todayHours.closeTime.split(':').map(Number)
  const nowMins = hour * 60 + minute
  const openMins = openH * 60 + openM
  const closeMins = closeH * 60 + closeM

  return nowMins >= openMins && nowMins < closeMins
}

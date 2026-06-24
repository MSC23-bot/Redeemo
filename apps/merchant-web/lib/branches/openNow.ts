// Branches PR-8 (umbrella D9): a PURE CLIENT MIRROR of src/api/shared/isOpenNow.ts.
// Used for the "Open right now" summary count (F2) and the Today's-hours cell. All
// comparisons are done in Europe/London time (handles BST/GMT automatically).
//
// MULTI-WINDOW + CROSS-MIDNIGHT (the D9 fix; the prior version read ONLY today's single
// row on a half-open same-day interval, so an overnight window read perpetually CLOSED
// and a post-midnight tail was never reported open). This now mirrors the backend
// isOpenNow exactly:
//   1. Today's windows: iterate ALL of today's non-closed rows.
//      - same-day (close > open, incl. the 24:00 = 1440 end-of-day close): open iff
//        now >= open && now < close (half-open).
//      - overnight (close < open): open iff now >= open (the pre-midnight portion of
//        today's overnight window; its post-midnight tail belongs to TOMORROW).
//   2. Yesterday-spillover: iterate yesterday's overnight rows (close < open); open iff
//      now < close (the post-midnight tail spilling into today).
// Returns true on the first hit. Half-open intervals throughout.

export interface OpeningHoursRow {
  dayOfWeek: number // 0=Sun, 1=Mon, ..., 6=Sat
  openTime?: string | null // "HH:MM" (or the "24:00" end-of-day close sentinel)
  closeTime?: string | null // "HH:MM" (or "24:00")
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

const MINUTES_PER_DAY = 24 * 60 // 1440

// Parse "HH:MM" (or the "24:00" close sentinel) into minutes-since-midnight, or null
// if absent/malformed.
function toMinutes(hhmm: string | null | undefined): number | null {
  if (hhmm === null || hhmm === undefined) return null
  if (hhmm === '24:00') return MINUTES_PER_DAY
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

/**
 * Returns true if the branch is currently open based on its (MULTI-WINDOW) openingHours.
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
  let hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)
  // Some engines render midnight as "24" rather than "00" under hour12:false; normalise.
  if (hour === 24) hour = 0

  const todayDow = weekdayShort ? WEEKDAY_MAP[weekdayShort] : -1
  if (todayDow < 0) return false
  const yesterdayDow = (todayDow + 6) % 7 // (todayDow - 1 + 7) % 7
  const nowMins = hour * 60 + minute

  // (1) Today's windows (same-day + the pre-midnight portion of an overnight window).
  for (const h of openingHours) {
    if (h.dayOfWeek !== todayDow || h.isClosed) continue
    const openMins = toMinutes(h.openTime)
    const closeMins = toMinutes(h.closeTime)
    if (openMins === null || closeMins === null) continue

    if (closeMins > openMins) {
      // Same-day window (incl. 24:00 end-of-day close).
      if (nowMins >= openMins && nowMins < closeMins) return true
    } else if (closeMins < openMins) {
      // Overnight window: today carries the pre-midnight portion [open, 24:00).
      if (nowMins >= openMins) return true
    }
    // closeMins === openMins is a zero-length window (validator-rejected); skip.
  }

  // (2) Yesterday-spillover: the post-midnight tail [0, close) of yesterday's overnight
  // windows reaches into today.
  for (const h of openingHours) {
    if (h.dayOfWeek !== yesterdayDow || h.isClosed) continue
    const openMins = toMinutes(h.openTime)
    const closeMins = toMinutes(h.closeTime)
    if (openMins === null || closeMins === null) continue
    if (closeMins < openMins) {
      if (nowMins < closeMins) return true
    }
  }

  return false
}

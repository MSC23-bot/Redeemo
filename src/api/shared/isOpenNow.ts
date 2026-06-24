import { getLondonClock } from './londonClock'

export type Hours = {
  dayOfWeek: number        // 0=Sun, 1=Mon, ..., 6=Sat
  openTime: string | null  // "HH:MM" (or the "24:00" end-of-day close sentinel)
  closeTime: string | null // "HH:MM" (or "24:00")
  isClosed: boolean
}

const MINUTES_PER_DAY = 24 * 60 // 1440

/** Parse "HH:MM" (or the "24:00" close sentinel) into minutes-since-midnight, or null if absent/malformed. */
function toMinutes(hhmm: string | null): number | null {
  if (hhmm === null) return null
  if (hhmm === '24:00') return MINUTES_PER_DAY
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

/**
 * Branches PR-8 (umbrella D9): THE canonical server open-status evaluator and the
 * SINGLE producer of the customer open/closed boolean. Returns true if the venue is
 * currently open based on its (now MULTI-WINDOW) BranchOpeningHours rows.
 *
 * All comparisons are in Europe/London time (BST/GMT handled by `getLondonClock`).
 * Pass `now` for testability (defaults to new Date()).
 *
 * Multi-window + cross-midnight semantics (the D9 fix; the prior version read ONLY
 * today's single row on a half-open same-day interval, so an overnight window read
 * perpetually CLOSED and a post-midnight tail was never reported open):
 *  1. Today's windows: iterate ALL of today's non-closed rows.
 *     - same-day (close > open, incl. the 24:00 = 1440 end-of-day close): open iff
 *       `now >= open && now < close` (half-open, matching the validator).
 *     - overnight (close < open): open iff `now >= open` (the pre-midnight portion of
 *       today's overnight window — its post-midnight tail belongs to TOMORROW and is
 *       reported by tomorrow's yesterday-spillover pass).
 *  2. Yesterday-spillover: iterate yesterday's overnight rows (close < open); open iff
 *     `now < close` (the post-midnight tail that spills into today).
 * Returns true on the first hit. Half-open intervals throughout so abutting windows
 * never double-open and a zero-length close can never report open.
 */
export function isOpenNow(hours: Hours[], now: Date = new Date()): boolean {
  const { dayOfWeek: todayDow, minutes: nowMins } = getLondonClock(now)
  const yesterdayDow = (todayDow + 6) % 7 // (todayDow - 1 + 7) % 7

  // (1) Today's windows (same-day + the pre-midnight portion of an overnight window).
  for (const h of hours) {
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

  // (2) Yesterday-spillover: the post-midnight tail [0, close) of yesterday's
  // overnight windows reaches into today.
  for (const h of hours) {
    if (h.dayOfWeek !== yesterdayDow || h.isClosed) continue
    const openMins = toMinutes(h.openTime)
    const closeMins = toMinutes(h.closeTime)
    if (openMins === null || closeMins === null) continue
    if (closeMins < openMins) {
      // Overnight: spilled into today as [0, close).
      if (nowMins < closeMins) return true
    }
  }

  return false
}

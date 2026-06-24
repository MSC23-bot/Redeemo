import type { OpeningHourEntry } from '@/lib/api/merchant'

/**
 * Branches PR-8 (umbrella D9) — the SINGLE customer-app multi-window
 * branch-hours formatter. Group a day's BranchOpeningHours rows (now N per
 * day under the multi-row model) into a human-readable string, ordered by
 * openTime.
 *
 * This ADAPTS the rendering register of the voucher `scheduleString`
 * (utils/scheduleString.ts) but is NOT a verbatim reuse: branch hours encode
 * a cross-midnight window as a SINGLE row where `close < open`
 * (e.g. open 18:00, close 02:00 = 6:00 pm to 2:00 am), whereas the voucher
 * formatter detects cross-midnight via a TWO-ROW partner pattern
 * (dayN close 24:00 + dayN+1 open 00:00). The voucher path is left untouched.
 *
 * Locked display semantics (mini-spec §4 / §5):
 *  - Closed day (one isClosed row, or no open windows)  → "Closed".
 *  - A full 00:00 → 24:00 window                         → "Open 24 hours".
 *  - A 24:00 close (literal end-of-day sentinel)         → "to midnight".
 *  - An overnight window (close < open)                  → honest "{open} to {close}"
 *                                                          (e.g. "6:00 pm to 2:00 am").
 *  - N windows in a day                                  → comma-joined, openTime asc
 *                                                          (e.g. "9:00 am to 2:00 pm, 5:00 pm to 11:00 pm").
 */

const MINUTES_PER_DAY = 24 * 60 // 1440

/** Parse "HH:MM" (or the "24:00" close sentinel) into minutes since midnight, or null if absent/malformed. */
export function hhmmToMinutes(hhmm: string | null | undefined): number | null {
  if (hhmm == null) return null
  if (hhmm === '24:00') return MINUTES_PER_DAY
  const [hStr, mStr] = hhmm.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

/**
 * Format "HH:MM" → "H:MM am/pm" (friendly, with a space before the period and
 * the meridiem in the brand-house style used across the hours surfaces).
 *  "09:00" → "9:00 am" · "14:00" → "2:00 pm" · "00:00" → "12:00 am" · "00:30" → "12:30 am"
 *
 * Note: "24:00" is NOT routed through here — it renders as the word
 * "midnight" by the day formatter so an end-of-day close reads honestly.
 */
export function formatTimeFriendly(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':')
  let h = parseInt(hStr ?? '0', 10)
  const m = mStr ?? '00'
  const period = h >= 12 ? 'pm' : 'am'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${m} ${period}`
}

type Window = { openTime: string; closeTime: string }

/**
 * Render a single window honestly. `24:00` close → "to midnight". Everything
 * else (same-day, overnight `close < open`) renders as "{open} to {close}".
 */
function formatWindow(w: Window): string {
  // Full-day window → "Open 24 hours" is handled by the caller (it needs to
  // know it is the day's ONLY window before collapsing the copy).
  const openDisplay = formatTimeFriendly(w.openTime)
  if (w.closeTime === '24:00') {
    return `${openDisplay} to midnight`
  }
  return `${openDisplay} to ${formatTimeFriendly(w.closeTime)}`
}

/**
 * Collect a single day's windows from the (multi-row) openingHours array,
 * dropping closed / malformed / null rows, sorted by openTime ascending.
 * `openTime` is a deterministic, unique sort key within a day because the
 * backend validator forbids overlaps (mini-spec §3 ordering note).
 */
export function windowsForDay(hours: OpeningHourEntry[], dayOfWeek: number): Window[] {
  const windows: Window[] = []
  for (const h of hours) {
    if (h.dayOfWeek !== dayOfWeek) continue
    if (h.isClosed) continue
    if (h.openTime == null || h.closeTime == null) continue
    const openMins = hhmmToMinutes(h.openTime)
    const closeMins = hhmmToMinutes(h.closeTime)
    if (openMins == null || closeMins == null) continue
    if (openMins === closeMins) continue // zero-length (validator-rejected); skip defensively
    windows.push({ openTime: h.openTime, closeTime: h.closeTime })
  }
  windows.sort((a, b) => (hhmmToMinutes(a.openTime) ?? 0) - (hhmmToMinutes(b.openTime) ?? 0))
  return windows
}

/**
 * Format ALL of a day's windows into one display string.
 *  - No open windows                       → "Closed".
 *  - Single full-day 00:00 → 24:00 window  → "Open 24 hours".
 *  - One or more windows                   → comma-joined, openTime asc.
 */
export function formatDayHours(hours: OpeningHourEntry[], dayOfWeek: number): string {
  const windows = windowsForDay(hours, dayOfWeek)
  if (windows.length === 0) return 'Closed'
  if (
    windows.length === 1 &&
    windows[0]!.openTime === '00:00' &&
    windows[0]!.closeTime === '24:00'
  ) {
    return 'Open 24 hours'
  }
  return windows.map(formatWindow).join(', ')
}

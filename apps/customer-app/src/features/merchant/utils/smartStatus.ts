import type { OpeningHourEntry } from '@/lib/api/merchant'
import { getLondonClock } from './londonNow'

export type SmartStatus = {
  pillState: 'open' | 'closing-soon' | 'closed'
  pillLabel: 'Open' | 'Closing soon' | 'Closed'
  statusText: string
}

// Bug fix (2026-05-05 QA): smartStatus reads day-of-week and time-of-day from
// the shared `getLondonClock(now)` helper instead of device-local
// `now.getDay()` / `now.getHours()` / `now.getMinutes()`.
//
// Product rule: UK branch opening hours are calculated in Europe/London
// regardless of the customer's device timezone. The shared helper uses
// Intl numeric date parts (universally supported, no CLDR locale data
// required) — see `londonNow.ts` for the full why.
//
// Branches PR-8 (umbrella D9): smartStatus is now MULTI-WINDOW + CROSS-MIDNIGHT
// aware, in lockstep with the backend `src/api/shared/isOpenNow.ts` rewrite.
// The prior version read ONLY today's single row on a half-open same-day
// interval, so an overnight window (`close < open`) read perpetually CLOSED
// and a post-midnight tail was never reported open, AND "Closes"/"Opens" text
// only ever considered one window per day. Now:
//  - the active-window scan considers ALL of today's windows (same-day +
//    the pre-midnight portion of an overnight window) AND a yesterday-spillover
//    pass (an overnight window's post-midnight tail);
//  - "Closes at / Closes in N min" references the CURRENTLY-ACTIVE window's
//    close (which may be tomorrow's clock time for an overnight window);
//  - "Opens at / Opens tomorrow" finds the NEXT window across days, considering
//    every window in a day (not just one).

const MINUTES_PER_DAY = 24 * 60 // 1440

// Format "HH:MM" → "H:MMam/pm" (am/pm, friendly, NO space — the locked status-
// text register used by "Closes at"/"Opens at").
// "09:00" → "9:00am" · "10:30" → "10:30am" · "17:00" → "5:00pm" · "00:30" → "12:30am"
// The "24:00" end-of-day close sentinel renders as "midnight".
function formatAmPm(hhmm: string): string {
  if (hhmm === '24:00') return 'midnight'
  const [hStr, mStr] = hhmm.split(':')
  let h = parseInt(hStr ?? '0', 10)
  const m = mStr ?? '00'
  const period = h >= 12 ? 'pm' : 'am'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${m}${period}`
}

function parseHM(hhmm: string): number {
  if (hhmm === '24:00') return MINUTES_PER_DAY
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

type WindowRow = { openTime: string; closeTime: string }

// Collect a day's non-closed, well-formed windows, sorted by openTime asc.
function dayWindows(hours: OpeningHourEntry[], dow: number): WindowRow[] {
  const rows: WindowRow[] = []
  for (const h of hours) {
    if (h.dayOfWeek !== dow || h.isClosed) continue
    if (h.openTime == null || h.closeTime == null) continue
    const open = parseHM(h.openTime)
    const close = parseHM(h.closeTime)
    if (open === close) continue // zero-length (validator-rejected); skip
    rows.push({ openTime: h.openTime, closeTime: h.closeTime })
  }
  rows.sort((a, b) => parseHM(a.openTime) - parseHM(b.openTime))
  return rows
}

// Find the window currently active at `nowMinutes` (Europe/London `today`),
// considering today's same-day + overnight pre-midnight windows AND
// yesterday's overnight post-midnight tail. Returns the active window's close
// time as an absolute minutes-from-`now` countdown plus the close clock-string,
// or null when nothing is active.
function activeWindowClose(
  hours: OpeningHourEntry[],
  today: number,
  nowMinutes: number,
): { closeTime: string; minsUntilClose: number } | null {
  // (1) Today's windows.
  for (const w of dayWindows(hours, today)) {
    const open = parseHM(w.openTime)
    const close = parseHM(w.closeTime)
    if (close > open) {
      // Same-day window (incl. 24:00 = 1440 end-of-day close).
      if (nowMinutes >= open && nowMinutes < close) {
        return { closeTime: w.closeTime, minsUntilClose: close - nowMinutes }
      }
    } else if (close < open) {
      // Overnight: today carries the pre-midnight portion [open, 24:00). The
      // close lands at `close` minutes TOMORROW, so the countdown wraps past
      // midnight: (1440 - now) + close.
      if (nowMinutes >= open) {
        return { closeTime: w.closeTime, minsUntilClose: MINUTES_PER_DAY - nowMinutes + close }
      }
    }
  }

  // (2) Yesterday-spillover: the post-midnight tail [0, close) of yesterday's
  // overnight windows reaches into today.
  const yesterday = (today + 6) % 7
  for (const w of dayWindows(hours, yesterday)) {
    const open = parseHM(w.openTime)
    const close = parseHM(w.closeTime)
    if (close < open && nowMinutes < close) {
      return { closeTime: w.closeTime, minsUntilClose: close - nowMinutes }
    }
  }

  return null
}

// Find the next open window starting at-or-after `now`, scanning today's later
// windows first, then subsequent days. Returns { dayOffset, openTime } or null.
//
// Day 0 (today): only a window whose openTime is > nowMinutes counts (an
//                already-started window would have been caught as active).
// Day 1+: the EARLIEST window of the first non-empty day.
function findNextOpen(
  hours: OpeningHourEntry[],
  today: number,
  nowMinutes: number,
): { dayOffset: number; openTime: string } | null {
  for (let offset = 0; offset < 7; offset++) {
    const dow = (today + offset) % 7
    const windows = dayWindows(hours, dow)
    if (windows.length === 0) continue
    if (offset === 0) {
      // Earliest window today that opens strictly after now.
      const upcoming = windows.find(w => parseHM(w.openTime) > nowMinutes)
      if (upcoming) return { dayOffset: 0, openTime: upcoming.openTime }
      continue
    }
    return { dayOffset: offset, openTime: windows[0]!.openTime }
  }
  return null
}

/**
 * Derive pill state + status text from `isOpenNow` + `openingHours`.
 *
 * @param isOpenNow  Server-computed boolean (Europe/London, multi-window +
 *                   cross-midnight correct per backend `isOpenNow`).
 * @param hours      `selectedBranch.openingHours` array (N rows per day).
 * @param now        Current Date (defaults to `new Date()`; test injectable).
 */
export function smartStatus(
  isOpenNow: boolean,
  hours: OpeningHourEntry[],
  now: Date = new Date(),
): SmartStatus {
  // Europe/London-local via shared helper — see londonNow.ts for the
  // full audit / why we use numeric Intl parts.
  const { dow: today, minutes: nowMinutes } = getLondonClock(now)

  if (isOpenNow) {
    const active = activeWindowClose(hours, today, nowMinutes)
    if (!active) {
      // Server says open but we can't resolve an active window (malformed /
      // missing hours data) — fall back to the honest "Hours unavailable".
      return { pillState: 'open', pillLabel: 'Open', statusText: 'Hours unavailable' }
    }
    const { closeTime, minsUntilClose } = active
    if (minsUntilClose <= 60 && minsUntilClose > 0) {
      return {
        pillState: 'closing-soon',
        pillLabel: 'Closing soon',
        statusText: `Closes in ${minsUntilClose} min`,
      }
    }
    return { pillState: 'open', pillLabel: 'Open', statusText: `Closes at ${formatAmPm(closeTime)}` }
  }

  // Closed
  const next = findNextOpen(hours, today, nowMinutes)
  if (!next) {
    return { pillState: 'closed', pillLabel: 'Closed', statusText: 'Hours unavailable' }
  }
  if (next.dayOffset === 0) {
    return { pillState: 'closed', pillLabel: 'Closed', statusText: `Opens at ${formatAmPm(next.openTime)}` }
  }
  if (next.dayOffset === 1) {
    return {
      pillState: 'closed',
      pillLabel: 'Closed',
      statusText: `Opens tomorrow at ${formatAmPm(next.openTime)}`,
    }
  }
  // After tomorrow: drop the day reference (avoids "Opens tomorrow" lie when
  // actually opens later in the week).
  return {
    pillState: 'closed',
    pillLabel: 'Closed',
    statusText: `Opens at ${formatAmPm(next.openTime)}`,
  }
}

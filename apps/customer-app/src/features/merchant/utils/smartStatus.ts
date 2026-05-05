import type { OpeningHourEntry } from '@/lib/api/merchant'

export type SmartStatus = {
  pillState: 'open' | 'closing-soon' | 'closed'
  pillLabel: 'Open' | 'Closing soon' | 'Closed'
  statusText: string
}

// Bug fix (2026-05-05 QA): smartStatus previously read `now.getDay()`,
// `now.getHours()`, `now.getMinutes()` — DEVICE-LOCAL time. On a Qatar
// device (UTC+3) these returned Qatar's day/hour/minute, not London's, so
// the status text could announce the wrong day's open/close hours
// whenever the user's device timezone disagreed with Europe/London.
//
// Product rule: UK branch opening hours must always be calculated in
// Europe/London time, regardless of where the customer's device is. This
// matches the backend `isOpenNow` resolver and the schedule-grid hook
// (`useOpenStatus.getLondonTodayDow`).
//
// `Intl.DateTimeFormat({ timeZone: 'Europe/London' })` handles BST/GMT
// switching automatically, so this works year-round without DST tracking.
const WEEKDAY_TO_DOW: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}
function getLondonDayAndMinutes(now: Date): { dow: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const weekdayShort = parts.find(p => p.type === 'weekday')?.value
  const hour   = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10)
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10)
  return {
    dow: weekdayShort ? (WEEKDAY_TO_DOW[weekdayShort] ?? 0) : 0,
    minutes: hour * 60 + minute,
  }
}

// Format "HH:MM" → "H:MMam/pm" (am/pm, friendly).
// "09:00" → "9:00am" · "10:30" → "10:30am" · "17:00" → "5:00pm" · "00:30" → "12:30am"
function formatAmPm(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':')
  let h = parseInt(hStr ?? '0', 10)
  const m = mStr ?? '00'
  const period = h >= 12 ? 'pm' : 'am'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${m}${period}`
}

function parseHM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

// Find the next open interval starting at-or-after `now` on `today`, or on
// any subsequent day. Returns { dayOffset, openTime } or null.
//
// Day 0 (today): only an open interval whose openTime is > nowMinutes counts.
// Day 1+: any non-closed entry counts (even if openTime is null — caller
//         decides how to render the missing time).
function findNextOpen(
  hours: OpeningHourEntry[],
  today: number,
  nowMinutes: number,
): { dayOffset: number; openTime: string | null } | null {
  for (let offset = 0; offset < 7; offset++) {
    const dow = (today + offset) % 7
    const entry = hours.find(h => h.dayOfWeek === dow)
    if (!entry || entry.isClosed) continue
    if (offset === 0) {
      if (!entry.openTime) continue
      if (parseHM(entry.openTime) <= nowMinutes) continue
      return { dayOffset: 0, openTime: entry.openTime }
    }
    return { dayOffset: offset, openTime: entry.openTime ?? null }
  }
  return null
}

/**
 * Derive pill state + status text from `isOpenNow` + `openingHours`.
 *
 * Today (Pass 2): single-interval data. Backend `selectedBranch.statusText`
 * + `isClosingSoon` are deferred (§A). When that ships, this helper
 * becomes a thin pass-through.
 *
 * @param isOpenNow  Server-computed boolean (Europe/London).
 * @param hours      `selectedBranch.openingHours` array.
 * @param now        Current Date (defaults to `new Date()`; test injectable).
 */
export function smartStatus(
  isOpenNow: boolean,
  hours: OpeningHourEntry[],
  now: Date = new Date(),
): SmartStatus {
  // Europe/London-local — see getLondonDayAndMinutes header comment.
  const { dow: today, minutes: nowMinutes } = getLondonDayAndMinutes(now)

  if (isOpenNow) {
    const todayEntry = hours.find(h => h.dayOfWeek === today)
    if (!todayEntry || !todayEntry.closeTime) {
      return { pillState: 'open', pillLabel: 'Open', statusText: 'Hours unavailable' }
    }
    // Single-interval limitation: minsUntilClose can be negative when a venue's
    // closeTime crosses midnight (e.g. closes at 02:00). The `> 0` guard below
    // prevents incorrect closing-soon under that case; the `Closes at H:MMam/pm`
    // text is still textually correct. Full fix lands when backend
    // selectedBranch.statusText + isClosingSoon ship (deferred §A).
    const minsUntilClose = parseHM(todayEntry.closeTime) - nowMinutes
    if (minsUntilClose <= 60 && minsUntilClose > 0) {
      return {
        pillState: 'closing-soon',
        pillLabel: 'Closing soon',
        statusText: `Closes in ${minsUntilClose} min`,
      }
    }
    return { pillState: 'open', pillLabel: 'Open', statusText: `Closes at ${formatAmPm(todayEntry.closeTime)}` }
  }

  // Closed
  const next = findNextOpen(hours, today, nowMinutes)
  if (!next) {
    return { pillState: 'closed', pillLabel: 'Closed', statusText: 'Hours unavailable' }
  }
  if (next.dayOffset === 0) {
    if (!next.openTime) return { pillState: 'closed', pillLabel: 'Closed', statusText: 'Hours unavailable' }
    return { pillState: 'closed', pillLabel: 'Closed', statusText: `Opens at ${formatAmPm(next.openTime)}` }
  }
  if (next.dayOffset === 1) {
    return {
      pillState: 'closed',
      pillLabel: 'Closed',
      statusText: next.openTime ? `Opens tomorrow at ${formatAmPm(next.openTime)}` : 'Opens tomorrow',
    }
  }
  // After tomorrow: drop the day reference (avoids "Opens tomorrow" lie when
  // actually opens later in the week).
  return {
    pillState: 'closed',
    pillLabel: 'Closed',
    statusText: next.openTime ? `Opens at ${formatAmPm(next.openTime)}` : 'Hours unavailable',
  }
}

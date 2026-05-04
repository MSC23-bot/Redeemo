import type { OpeningHourEntry } from '@/lib/api/merchant'

export type SmartStatus = {
  pillState: 'open' | 'closing-soon' | 'closed'
  pillLabel: 'Open' | 'Closing soon' | 'Closed'
  statusText: string
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
  const today = now.getDay()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  if (isOpenNow) {
    const todayEntry = hours.find(h => h.dayOfWeek === today)
    if (!todayEntry || !todayEntry.closeTime) {
      return { pillState: 'open', pillLabel: 'Open', statusText: 'Hours unavailable' }
    }
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

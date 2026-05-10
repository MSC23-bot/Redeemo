import { getLondonClock } from './londonClock'

export type AvailabilityWindow = {
  dayOfWeek: number  // 0=Sun ... 6=Sat
  openTime: string   // "HH:mm" — 00:00 to 23:59
  closeTime: string  // "HH:mm" — 00:01 to 23:59, OR "24:00" sentinel
}

export type WindowOccurrence = {
  startsAt: Date
  endsAt:   Date
}

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Parse an "HH:mm" wall-clock string into minutes since midnight (0-1440).
 *
 * Accepts the special sentinel "24:00" as a closeTime end-of-day marker
 * (returns 1440). All other "HH:mm" values must be in [00:00, 23:59].
 */
export function parseTimeString(s: string): number {
  if (s === '24:00') return 1440
  if (!TIME_REGEX.test(s)) {
    throw new Error(`parseTimeString: invalid time format "${s}"`)
  }
  const [hh, mm] = s.split(':').map(n => parseInt(n, 10))
  return hh * 60 + mm
}

/**
 * Find the open window-occurrence at `now`, or null.
 * Half-open semantics: minute-of-day is in [openMin, closeMin).
 * `closeTime: "24:00"` parses to 1440 (end-of-day).
 */
export function getCurrentWindowOccurrence(
  windows: AvailabilityWindow[],
  now: Date,
): WindowOccurrence | null {
  if (windows.length === 0) return null

  const { dayOfWeek, minutes } = getLondonClock(now)

  for (const w of windows) {
    if (w.dayOfWeek !== dayOfWeek) continue
    const openMin  = parseTimeString(w.openTime)
    const closeMin = parseTimeString(w.closeTime)
    if (minutes >= openMin && minutes < closeMin) {
      return {
        startsAt: londonDateAtMinute(now, 0, openMin),
        endsAt:   londonDateAtMinute(now, 0, closeMin),
      }
    }
  }
  return null
}

/**
 * Find the NEXT window-occurrence to open from `now`, scanning forward
 * up to 7 days.
 *
 * Algorithm:
 *   For each dayOffset 0..7 (today through next-week-same-day):
 *     targetDow = (nowDay + dayOffset) % 7
 *     For each w in windows where w.dayOfWeek === targetDow:
 *       openMin = parseTimeString(w.openTime)
 *       closeMin = parseTimeString(w.closeTime)
 *       IF dayOffset === 0 AND openMin <= nowMinutes → skip
 *       ELSE → candidate
 *   Sort by (dayOffset asc, openMin asc); take earliest.
 */
export function getNextWindowOccurrence(
  windows: AvailabilityWindow[],
  now: Date,
): WindowOccurrence | null {
  if (windows.length === 0) return null
  const { dayOfWeek: nowDay, minutes: nowMin } = getLondonClock(now)

  type Candidate = { dayOffset: number; openMin: number; closeMin: number }
  const candidates: Candidate[] = []

  for (let offset = 0; offset <= 7; offset++) {
    const targetDow = (nowDay + offset) % 7
    for (const w of windows) {
      if (w.dayOfWeek !== targetDow) continue
      const openMin  = parseTimeString(w.openTime)
      const closeMin = parseTimeString(w.closeTime)
      if (offset === 0 && openMin <= nowMin) continue
      candidates.push({ dayOffset: offset, openMin, closeMin })
    }
  }
  if (candidates.length === 0) return null

  candidates.sort((a, b) =>
    a.dayOffset !== b.dayOffset ? a.dayOffset - b.dayOffset : a.openMin - b.openMin,
  )
  const c = candidates[0]
  return {
    startsAt: londonDateAtMinute(now, c.dayOffset, c.openMin),
    endsAt:   londonDateAtMinute(now, c.dayOffset, c.closeMin),
  }
}

/**
 * Find the most-recently-CLOSED window-occurrence ending strictly before
 * `now`, scanning backward up to 7 days.
 *
 * Algorithm: symmetric inverse of getNextWindowOccurrence:
 *   For each dayOffset 0..7:
 *     targetDow = (nowDay - dayOffset + 7) % 7
 *     For each w in windows where w.dayOfWeek === targetDow:
 *       closeMin = parseTimeString(w.closeTime)
 *       IF dayOffset === 0 AND closeMin > nowMinutes → skip
 *       ELSE → candidate
 *   Sort by (dayOffset asc, closeMin desc); take most recent close.
 */
export function getMostRecentlyClosedWindowOccurrence(
  windows: AvailabilityWindow[],
  now: Date,
): WindowOccurrence | null {
  if (windows.length === 0) return null
  const { dayOfWeek: nowDay, minutes: nowMin } = getLondonClock(now)

  type Candidate = { dayOffset: number; openMin: number; closeMin: number }
  const candidates: Candidate[] = []

  for (let offset = 0; offset <= 7; offset++) {
    const targetDow = (nowDay - offset + 7) % 7
    for (const w of windows) {
      if (w.dayOfWeek !== targetDow) continue
      const openMin  = parseTimeString(w.openTime)
      const closeMin = parseTimeString(w.closeTime)
      if (offset === 0 && closeMin > nowMin) continue
      candidates.push({ dayOffset: offset, openMin, closeMin })
    }
  }
  if (candidates.length === 0) return null

  candidates.sort((a, b) =>
    a.dayOffset !== b.dayOffset ? a.dayOffset - b.dayOffset : b.closeMin - a.closeMin,
  )
  const c = candidates[0]
  return {
    startsAt: londonDateAtMinute(now, -c.dayOffset, c.openMin),
    endsAt:   londonDateAtMinute(now, -c.dayOffset, c.closeMin),
  }
}

/**
 * Compute the absolute UTC instant for "London-local minute M on the
 * day that is `dayOffset` days from today's London-local date."
 *
 * BST/GMT-correct: builds a UTC date from the London-local year/month/day,
 * then re-applies the London → UTC offset for that specific calendar day.
 * `dayOffset` may be negative (for getMostRecentlyClosedWindowOccurrence).
 */
function londonDateAtMinute(now: Date, dayOffset: number, minute: number): Date {
  const ymdParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London',
    year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(now)
  const get = (t: Intl.DateTimeFormatPartTypes): number => {
    const p = ymdParts.find(x => x.type === t)
    if (!p) throw new Error(`londonDateAtMinute: missing ${t}`)
    return parseInt(p.value, 10)
  }
  const year  = get('year')
  const month = get('month')
  const day   = get('day')

  // UTC midnight for the target London-local date.
  const utcMidnight = new Date(Date.UTC(year, month - 1, day + dayOffset, 0, 0, 0))

  // Read the London offset for THAT date via shortOffset, handling BST/GMT.
  const offsetParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London',
    timeZoneName: 'shortOffset',
    year: 'numeric',
  }).formatToParts(utcMidnight)
  const tzName = offsetParts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = tzName.match(/^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/)
  let offsetMinutes = 0
  if (m && m[1]) {
    const sign = m[1] === '+' ? 1 : -1
    offsetMinutes = sign * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0))
  }

  // utcMidnight is "00:00 UTC on day D"; we want "00:00 LONDON on day D"
  // which is `offsetMinutes` BEFORE that. Then add the wall-clock minute.
  return new Date(utcMidnight.getTime() - offsetMinutes * 60_000 + minute * 60_000)
}

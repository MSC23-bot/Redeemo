/**
 * Shared multi-window opening-hours rendering for customer-web merchant-profile
 * surfaces (OpeningHoursSection + HoursAndAmenitiesSection).
 *
 * Backend (PR-8) returns MULTIPLE `BranchOpeningHours` entries that share a
 * `dayOfWeek` for a multi-window day; the wire carries N entries per day ordered
 * by `(dayOfWeek, openTime)`. A closed day is one entry with `isClosed: true`.
 * `closeTime` may be `24:00` (end-of-day); `closeTime < openTime` means the
 * window crosses midnight (e.g. `18:00 -> 02:00` = 6:00 pm to 2:00 am next day).
 *
 * Rendering rules (matched across customer-app + merchant-web surfaces):
 *  - N windows per day join with ", " (e.g. "9:00 am to 2:00 pm, 5:00 pm to 11:00 pm").
 *  - `24:00` close renders as "midnight".
 *  - A full `00:00 -> 24:00` window renders as "Open 24 hours".
 *  - An overnight window (`close < open`) renders honestly across midnight
 *    (e.g. "6:00 pm to 2:00 am"); it is NOT collapsed to an empty/invalid range.
 *
 * The open/closed BOOLEAN (the open-now dot) is server-computed via `isOpenNow`,
 * so this module only governs the static DISPLAY + the TODAY-row weekday.
 */

export type OpeningHour = {
  dayOfWeek: number
  openTime: string
  closeTime: string
  isClosed: boolean
}

// UK convention: Monday first.
export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]
export const UK_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] // Mon -> Sun

/**
 * Europe/London weekday index (0=Sun .. 6=Sat) for the given instant.
 * Fixes the device-local `new Date().getDay()` TODAY-row drift: a customer
 * abroad (or a server rendering near midnight) must see the London day, since
 * Redeemo is a UK-local marketplace and the hours are UK-local.
 */
export function getLondonDayIndex(now: Date = new Date()): number {
  const weekday = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
  }).format(now)
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  // `weekday: 'short'` yields the 3-letter form; fall back to Sunday only if an
  // unexpected locale string ever appears (defensive, should not happen).
  return map[weekday] ?? 0
}

/** Parse an "HH:MM" string into total minutes; "24:00" -> 1440 (end-of-day). */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(n => parseInt(n, 10))
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN
  return h * 60 + m
}

/** Format total minutes (0..1440) as a 12-hour "h:mm am/pm" label. */
function minutesToLabel(mins: number): string {
  if (mins === 1440) return 'midnight'
  if (mins === 0) return 'midnight'
  const h24 = Math.floor(mins / 60)
  const m = mins % 60
  const period = h24 >= 12 ? 'pm' : 'am'
  let h12 = h24 % 12
  if (h12 === 0) h12 = 12
  const mm = m.toString().padStart(2, '0')
  return `${h12}:${mm} ${period}`
}

/** Format a single window "HH:MM"/"HH:MM" pair into a human range. */
function formatWindow(openTime: string, closeTime: string): string {
  const open = toMinutes(openTime)
  const close = toMinutes(closeTime)
  // Open 24 hours: a full 00:00 -> 24:00 window.
  if (open === 0 && close === 1440) return 'Open 24 hours'
  // 24:00 close renders as "midnight" via minutesToLabel; an overnight window
  // (close < open) renders both ends honestly so it reads as crossing midnight.
  return `${minutesToLabel(open)} to ${minutesToLabel(close)}`
}

/**
 * Group all backend entries by weekday into a stable, openTime-sorted view.
 * Replaces the old last-wins `new Map(...)` collapse that silently dropped
 * extra windows for a multi-window day.
 */
export function groupHoursByDay(hours: OpeningHour[]): Map<number, OpeningHour[]> {
  const byDay = new Map<number, OpeningHour[]>()
  for (const h of hours) {
    const list = byDay.get(h.dayOfWeek) ?? []
    list.push(h)
    byDay.set(h.dayOfWeek, list)
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => toMinutes(a.openTime) - toMinutes(b.openTime))
  }
  return byDay
}

/**
 * Human label for a single day's entries.
 *  - No entries for the day -> "Closed" (the profile shows the full week).
 *  - A closed-day entry (`isClosed: true`) -> "Closed".
 *  - N open windows -> comma-joined window strings, openTime-sorted.
 */
export function formatDayLabel(entries: OpeningHour[] | undefined): string {
  if (!entries || entries.length === 0) return 'Closed'
  const open = entries.filter(e => !e.isClosed)
  if (open.length === 0) return 'Closed'
  return open.map(e => formatWindow(e.openTime, e.closeTime)).join(', ')
}

/** True when the day has no open window (no entries, or only a closed entry). */
export function isDayClosed(entries: OpeningHour[] | undefined): boolean {
  if (!entries || entries.length === 0) return true
  return entries.every(e => e.isClosed)
}

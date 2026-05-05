/**
 * Europe/London-local clock helpers used wherever opening-hours UI needs to
 * decide which day "today" is. UK product rule: branch opening hours are
 * always calculated in Europe/London, regardless of the customer's device
 * timezone — so a user in Qatar / India / the US still sees the UK branch's
 * London-local TODAY highlight and status.
 *
 * Bug fix (2026-05-05 QA): the previous implementations in `useOpenStatus`
 * and `smartStatus` used `Intl.DateTimeFormat({ weekday: 'short' })` and a
 * string-keyed lookup (`{ Sun: 0, Mon: 1, ... }[weekdayShort]`). That works
 * fine on JSC (Web) and V8 (Node — Jest runner) because both ship the full
 * CLDR locale data set, but it's fragile on Hermes (React Native), which
 * historically ships a stripped-down CLDR set. If en-GB short-weekday
 * data is missing on the device's Hermes build, `formatToParts` may:
 *   • return the weekday part with an unexpected string ("Tue.", "Tu",
 *     "Tuesday", a non-English fallback, …),
 *   • or omit the weekday part entirely.
 * Both paths fall through the original code's defaults (`?? 'Sun'` then
 * `?? 0`) and lock the result to Sunday — exactly the on-device symptom
 * reported (TODAY badge stuck on Sunday on a Tuesday device).
 *
 * Robust replacement: ask Intl only for NUMERIC date parts (year / month /
 * day / hour / minute), which are universally supported across runtimes
 * because they don't depend on locale-specific weekday strings. Then build
 * a UTC `Date` from the resulting wall-clock components and read the
 * day-of-week via `getUTCDay()` — a guaranteed-portable 0=Sun..6=Sat lookup
 * built into every JS engine.
 *
 * `Intl.DateTimeFormat` handles BST/GMT switching automatically, so this
 * works year-round without manual DST tracking.
 */

export type LondonClock = {
  /** Day-of-week in Europe/London. 0=Sunday, 1=Monday, ..., 6=Saturday. */
  dow: number
  /** Minutes since midnight, Europe/London. 0..1439. */
  minutes: number
}

function getLondonDateParts(now: Date): {
  year:   number
  month:  number   // 1..12
  day:    number   // 1..31
  hour:   number   // 0..23
  minute: number   // 0..59
} {
  // en-US locale used here intentionally — it has the most stable CLDR
  // numeric date-part output across runtimes. We're only asking for
  // numbers, so locale doesn't influence the values, only the format
  // strings we'd never read.
  // hour12:false combined with hourCycle:'h23' guards against the V8
  // "hour 0 → '24'" quirk seen in some locales when only one is set.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London',
    year:   'numeric',
    month:  'numeric',
    day:    'numeric',
    hour:   'numeric',
    minute: 'numeric',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(now)
  const find = (type: string) => parts.find(p => p.type === type)?.value
  const rawHour = parseInt(find('hour') ?? '0', 10)
  return {
    year:   parseInt(find('year')   ?? '1970', 10),
    month:  parseInt(find('month')  ?? '1',    10),
    day:    parseInt(find('day')    ?? '1',    10),
    // Belt-and-braces against the V8 "hour 0 formatted as 24" quirk.
    hour:   rawHour === 24 ? 0 : rawHour,
    minute: parseInt(find('minute') ?? '0',    10),
  }
}

export function getLondonClock(now: Date = new Date()): LondonClock {
  const { year, month, day, hour, minute } = getLondonDateParts(now)
  // Build a UTC Date from London's wall-clock components, then read
  // day-of-week via getUTCDay (guaranteed 0=Sun..6=Sat across all
  // engines — no locale data required).
  const utcAtLondonWallClock = new Date(Date.UTC(year, month - 1, day))
  return {
    dow: utcAtLondonWallClock.getUTCDay(),
    minutes: hour * 60 + minute,
  }
}

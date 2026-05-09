/**
 * Show-to-Staff date/time formatters — Hermes-robust pure helpers
 * (locked 2026-05-09 from deferred-followups §AG2 — post-PR-#49
 * pre-public-launch hardening).
 *
 * Replaces the previous `Intl.DateTimeFormat('en-GB', { month:
 * 'short', ... }).format(d).split(', ')` pattern in ShowToStaff
 * with the formatToParts numeric pattern locked across the project
 * after the wave-3 device-QA bug on `formatExpiryLine` (Hermes ships
 * a stripped-down CLDR set; some option combinations on
 * `toLocaleTimeString` / `month: 'short'` silently fall through to
 * fragile defaults — observed silently rendering the redeemed time
 * instead of the +2h expiry on a Qatar iOS Hermes device).
 *
 * Pattern (mirrors `formatExpiryLine` in
 * `apps/customer-app/src/features/voucher/components/RedemptionDetailsCard.tsx`
 * + `getLondonClock` in `apps/customer-app/src/features/merchant/utils/londonNow.ts`):
 *
 *   • en-US locale for `Intl.DateTimeFormat` — most stable numeric
 *     output across runtimes; we read only numbers, never locale
 *     strings.
 *   • `formatToParts` numeric extraction (no `month: 'short'`, no
 *     `.format()` + `.split(', ')`).
 *   • Hardcoded English month-name array — locale-string formatting
 *     is never on the hot path.
 *   • Belt-and-braces against the V8 "hour 0 formatted as 24" quirk.
 *
 * Display contracts preserved from the previous implementation:
 *
 *   • `formatShowToStaffLive(d)` → "08 May 2026 · 14:24:38"
 *   • `formatShowToStaffRedeemed(d)` → "08 May 2026, 14:24"
 *
 * Display timezone — Europe/London preserved (NOT switched to device-
 * local like `formatExpiryLine` was). Owner direction §AG2: "Europe/
 * London timezone remains for ShowToStaff unless you find a specific
 * reason to change it." The Show-to-Staff surface is a staff-facing
 * trust signal — staff verify against the live UK clock; consistency
 * with the UK product framing matters more than matching the user's
 * device clock.
 *
 * Tests pin scenarios by passing an explicit `timeZone` — production
 * always omits it and uses the default `'Europe/London'`.
 *
 * Both helpers return `''` on malformed input so the surface never
 * crashes; the visible state degrades to an empty string rather than
 * "Invalid Date" or NaN.
 */

const MONTH_SHORT_EN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

const DEFAULT_TZ = 'Europe/London'

type LondonParts = {
  day:    number  // 1..31
  month:  number  // 1..12
  year:   number
  hour:   number  // 0..23 (V8 "24" quirk normalised)
  minute: number  // 0..59
  second: number  // 0..59
}

function getParts(d: Date, timeZone: string): LondonParts | null {
  if (Number.isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    day:       'numeric',
    month:     'numeric',
    year:      'numeric',
    hour:      'numeric',
    minute:    'numeric',
    second:    'numeric',
    hour12:    false,
    hourCycle: 'h23',
  }).formatToParts(d)
  const find = (type: string) => parts.find((p) => p.type === type)?.value
  const day     = parseInt(find('day')    ?? '', 10)
  const month   = parseInt(find('month')  ?? '', 10)
  const year    = parseInt(find('year')   ?? '', 10)
  const hourRaw = parseInt(find('hour')   ?? '', 10)
  const minute  = parseInt(find('minute') ?? '', 10)
  const second  = parseInt(find('second') ?? '', 10)
  if (
    !Number.isFinite(day)    || day    < 1 || day    > 31 ||
    !Number.isFinite(month)  || month  < 1 || month  > 12 ||
    !Number.isFinite(year)   ||
    !Number.isFinite(hourRaw)||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) return null
  return {
    day,
    month,
    year,
    hour: hourRaw === 24 ? 0 : hourRaw,
    minute,
    second,
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Format the live ticking clock on Show-to-Staff: "08 May 2026 · 14:24:38".
 * en-GB short-form date + 24-hour clock with seconds.
 *
 * Production calls omit the second arg (defaults to Europe/London).
 * Tests pass an explicit timezone to make scenarios deterministic
 * regardless of the host runtime's TZ.
 */
export function formatShowToStaffLive(d: Date, timeZone: string = DEFAULT_TZ): string {
  const p = getParts(d, timeZone)
  if (!p) return ''
  return `${pad2(p.day)} ${MONTH_SHORT_EN[p.month - 1]} ${p.year} · ${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`
}

/**
 * Format the static "Redeemed on" line on Show-to-Staff:
 * "08 May 2026, 14:24". Same date format as the live line, no seconds
 * (receipt detail, not real-time signal).
 */
export function formatShowToStaffRedeemed(d: Date, timeZone: string = DEFAULT_TZ): string {
  const p = getParts(d, timeZone)
  if (!p) return ''
  return `${pad2(p.day)} ${MONTH_SHORT_EN[p.month - 1]} ${p.year}, ${pad2(p.hour)}:${pad2(p.minute)}`
}

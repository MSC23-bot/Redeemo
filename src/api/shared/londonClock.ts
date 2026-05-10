/**
 * Server-side mirror of apps/customer-app/src/features/merchant/utils/londonNow.ts.
 *
 * Hermes-robust numeric extraction pattern (locked 2026-05-09 in PR #49 device QA).
 * AVOID `Intl.DateTimeFormat({ weekday: 'short' | 'long' })` AND
 * `Date.prototype.toLocaleTimeString` — both can silently fall back on
 * stripped-CLDR builds. Use `formatToParts` numeric-only extraction.
 *
 * See `~/.claude/projects/.../memory/reference_london_clock_helper.md`.
 */

// Locale 'en-US' chosen because it returns the year-month-day-hour-minute
// parts in a stable, well-tested order. The actual values are timezone-
// adjusted to Europe/London by the `timeZone` option.
const PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/London',
  year:   'numeric',
  month:  'numeric',
  day:    'numeric',
  hour:   'numeric',
  minute: 'numeric',
  hour12: false,
})

export type LondonClock = {
  /** 0=Sun, 1=Mon, ..., 6=Sat — matches BranchOpeningHours.dayOfWeek convention */
  dayOfWeek: number
  /** Minutes since midnight Europe/London local (0-1439) */
  minutes: number
}

export function getLondonClock(now: Date): LondonClock {
  const parts = PARTS_FORMATTER.formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find(p => p.type === type)
    if (!part) throw new Error(`getLondonClock: missing part ${type}`)
    return parseInt(part.value, 10)
  }

  const year   = get('year')
  const month  = get('month')   // 1-12
  const day    = get('day')     // 1-31
  let   hour   = get('hour')    // 0-24 (V8 returns 24 at midnight in some envs)
  const minute = get('minute')

  // V8 hour-24 quirk: at exact midnight Europe/London some V8 builds emit
  // hour=24. Normalise to 0. Mirrors the customer-app helper.
  if (hour === 24) hour = 0

  // Compute day-of-week from a UTC-anchored date built from the London
  // wall-clock parts. This is safe because we only need .getUTCDay() —
  // we are NOT round-tripping back through any locale.
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay()

  return {
    dayOfWeek,
    minutes: hour * 60 + minute,
  }
}

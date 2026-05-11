/**
 * Countdown formatting for TIME_LIMITED voucher states (M4b-1).
 *
 * No seconds anywhere. Per-minute updates within hours; per-hour in days
 * territory (the consuming hook is responsible for the update cadence —
 * these helpers are pure formatters).
 *
 * Hermes-robust: hardcoded English day-name array; numeric extraction
 * via `formatToParts` for clock-time. AVOID `weekday: 'long'` and
 * `toLocaleTimeString`. See `reference_london_clock_helper.md`.
 */

export type CountdownState =
  | 'active'
  | 'urgent'
  | 'unavailable-today'
  | 'unavailable-future-day'
  | 'redeemed-this-window'
  | 'expired'

const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

const HHMM_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/London',
  hour: 'numeric', minute: 'numeric', hour12: false,
})

const YMD_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/London',
  year: 'numeric', month: 'numeric', day: 'numeric',
})

export function formatDurationCompact(deltaMs: number): string {
  if (deltaMs <= 0) return '0m'
  const totalMinutes = Math.floor(deltaMs / 60_000)
  if (totalMinutes < 60) return `${totalMinutes}m`
  if (totalMinutes < 24 * 60) {
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    return `${h}h ${m}m`
  }
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  return `${days}d ${hours}h`
}

export function formatClockTime(date: Date): string {
  const parts = HHMM_FORMATTER.formatToParts(date)
  const get = (t: Intl.DateTimeFormatPartTypes): string => {
    const p = parts.find(x => x.type === t)
    return p ? p.value : '00'
  }
  let hour = parseInt(get('hour'), 10)
  if (hour === 24) hour = 0  // V8 quirk normalisation
  const hh = String(hour).padStart(2, '0')
  const mm = get('minute').padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * 12-hour clock-hour formatter. Returns "5pm" / "12am" / "12pm" for whole
 * hours, and "9:30pm" / "5:45am" for minute-bearing instants.
 *
 * Used by the M4c merchant-card state pill for "Opens 5pm today" / "Tomorrow
 * 12pm" / "Available now · ends 3pm today" copy (locked Gate J 2026-05-11).
 * Hermes-robust: extracts hour + minute via `formatToParts` numeric (NOT
 * `toLocaleTimeString`) — see `reference_london_clock_helper.md` for the
 * AVOID rules. Reuses the module-level `HHMM_FORMATTER` (Europe/London,
 * 24h-internal) to share the same offset-extraction behaviour as
 * `formatClockTime` above.
 */
export function formatClockHour12(date: Date): string {
  const parts = HHMM_FORMATTER.formatToParts(date)
  const get = (t: Intl.DateTimeFormatPartTypes): string => {
    const p = parts.find(x => x.type === t)
    return p ? p.value : '00'
  }
  let hour = parseInt(get('hour'), 10)
  if (hour === 24) hour = 0  // V8 quirk normalisation
  const minute = parseInt(get('minute'), 10)
  const period = hour < 12 ? 'am' : 'pm'
  const h12 = hour === 0 ? 12 : hour <= 12 ? hour : hour - 12
  if (minute === 0) return `${h12}${period}`
  return `${h12}:${String(minute).padStart(2, '0')}${period}`
}

export function formatDayName(date: Date): string {
  // Compute London-local day-of-week from formatToParts numeric ymd, then
  // index into the hardcoded English array. Avoids weekday: 'long'/'short'
  // which has Hermes/CLDR fragility on stripped builds.
  const parts = YMD_FORMATTER.formatToParts(date)
  const get = (t: Intl.DateTimeFormatPartTypes): number => {
    const p = parts.find(x => x.type === t)
    if (!p) throw new Error(`formatDayName: missing ${t}`)
    return parseInt(p.value, 10)
  }
  const year  = get('year')
  const month = get('month')
  const day   = get('day')
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  // dayOfWeek is 0-6 (Date.getUTCDay) — always in range; non-null-assert
  // because TS's `noUncheckedIndexedAccess` widens array access to T | undefined.
  return DAYS_FULL[dayOfWeek]!
}

/**
 * Renders the M4d hero-status-block primary line:
 *   "Today at <H>am/pm"
 *   "Tomorrow at <H>am/pm"
 *   "<Weekday> at <H>am/pm"  (2+ days out, full weekday name)
 *
 * Locked: spec D3 canonical primary format. Hermes-robust — uses
 * formatToParts numeric extraction + the hardcoded DAYS_FULL array;
 * avoids weekday: 'long'/'short' and toLocaleTimeString. London-local
 * for the day-comparison (matches the rest of the voucher-detail surface).
 */
export function formatPrimaryWhen(boundary: Date, now: Date): string {
  const clock = formatClockHour12(boundary)
  const boundaryYmd = ymdFor(boundary)
  const nowYmd = ymdFor(now)
  if (sameYmd(boundaryYmd, nowYmd)) return `Today at ${clock}`
  const tomorrowYmd = addOneDay(nowYmd)
  if (sameYmd(boundaryYmd, tomorrowYmd)) return `Tomorrow at ${clock}`
  return `${formatDayName(boundary)} at ${clock}`
}

/**
 * M4d hero-status-block urgent-state primary formatter.
 *
 * Returns the user-facing countdown string given the absolute ms-until-
 * window-close. Seconds appear ONLY in the final 60 seconds (msToClose
 * ≤ 60_000). Above that, falls through to minute-or-coarser granularity
 * via formatDurationCompact. At or past the boundary, returns "Closes
 * now" until the parent state flips to outside-window.
 *
 * Locked: spec D10 final-60-seconds-only rule.
 */
export function formatUrgentCountdown(msToClose: number): string {
  if (msToClose <= 0) return 'Closes now'
  if (msToClose <= 60_000) {
    const seconds = Math.ceil(msToClose / 1_000)
    return `Closes in ${seconds}s`
  }
  return `Closes in ${formatDurationCompact(msToClose)}`
}

/**
 * M4d-amended duration formatter (spec D3 amendment 2026-05-11).
 *
 * 4-tier precision:
 *   ≥ 1 day            → "2d 4h"
 *   < 1 day, ≥ 1 hour  → "5h 12m"
 *   < 1 hour, ≥ 1 min  → "42m 15s"
 *   < 1 min, > 0       → "59s"
 *   ≤ 0                → "0s"  (caller routes to "<verb> now")
 *
 * Used by the duration-first hero status block primary line. Replaces
 * formatDurationCompact for the M4d hero — kept separate so the legacy
 * compact formatter (still used by formatPrimaryCountdown /
 * formatSupportingCountdown for the M4b FrostedCountdown / banner /
 * details card) is untouched until those components are deleted in
 * Phase H.
 */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '0s'

  const totalSeconds = Math.ceil(ms / 1_000)
  if (totalSeconds < 60) return `${totalSeconds}s`

  const totalMinutes = Math.floor(ms / 60_000)
  if (totalMinutes < 60) {
    const seconds = Math.ceil((ms - totalMinutes * 60_000) / 1_000)
    // Edge case: rounding-up seconds to 60 would render "Nm 60s" — bump minute, zero seconds.
    if (seconds === 60) return `${totalMinutes + 1}m 0s`
    return `${totalMinutes}m ${seconds}s`
  }

  const totalHours = Math.floor(ms / 3_600_000)
  if (totalHours < 24) {
    const minutes = Math.floor((ms - totalHours * 3_600_000) / 60_000)
    return `${totalHours}h ${minutes}m`
  }

  const totalDays = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms - totalDays * 86_400_000) / 3_600_000)
  return `${totalDays}d ${hours}h`
}

/** "Closes in <duration>" / "Closes now" */
export function formatClosingCountdown(ms: number): string {
  if (ms <= 0) return 'Closes now'
  return `Closes in ${formatDuration(ms)}`
}

/** "Opens in <duration>" / "Opens now" */
export function formatOpeningCountdown(ms: number): string {
  if (ms <= 0) return 'Opens now'
  return `Opens in ${formatDuration(ms)}`
}

/** "Available again in <duration>" / "Available now" */
export function formatAvailableAgainCountdown(ms: number): string {
  if (ms <= 0) return 'Available now'
  return `Available again in ${formatDuration(ms)}`
}

/**
 * Stable a11y label for the closing direction's polite live region.
 * Returns null for the ≥1h band — caller uses the eyebrow phrasing as
 * the accessibility label instead. Per spec D10 amendment 2026-05-11.
 */
export function formatClosingA11y(ms: number): string | null {
  if (ms <= 0) return null
  if (ms < 60_000) return 'Closes in under a minute'
  if (ms < 3_600_000) {
    const minutes = Math.round(ms / 60_000)
    return `Closes in about ${minutes} minutes`
  }
  return null
}

/** Stable a11y label for the opening direction. */
export function formatOpeningA11y(ms: number): string | null {
  if (ms <= 0) return null
  if (ms < 60_000) return 'Opens in under a minute'
  if (ms < 3_600_000) {
    const minutes = Math.round(ms / 60_000)
    return `Opens in about ${minutes} minutes`
  }
  return null
}

/** Stable a11y label for the available-again direction. */
export function formatAvailableAgainA11y(ms: number): string | null {
  if (ms <= 0) return null
  if (ms < 60_000) return 'Available again in under a minute'
  if (ms < 3_600_000) {
    const minutes = Math.round(ms / 60_000)
    return `Available again in about ${minutes} minutes`
  }
  return null
}

/**
 * M4d hero-status-block supporting line formatter (spec D3 amendment 2026-05-11).
 *
 * Returns the clock+day context that accompanies the duration-first
 * primary. Format depends on how far in the future the boundary is
 * relative to London-local "now":
 *   • Same London day  → "<verb> <Hour><am/pm> today"   e.g. "Ends 5:30pm today"
 *   • Next London day  → "<verb> <Hour><am/pm> tomorrow" e.g. "Opens 12:15am tomorrow"
 *   • 2+ days away     → "<Weekday> <Hour><am/pm>"       e.g. "Saturday 11am"
 *
 * The verb is only included for same-day / tomorrow. For 2+ days, the
 * eyebrow already carries the direction ("Opens Saturday"), so the
 * supporting line omits it (matches the spec D3 example).
 *
 * Hermes-robust via the ymdFor helper + formatClockHour12 + formatDayName.
 */
export function formatSupportingClock(
  boundary: Date,
  now: Date,
  verb: 'Ends' | 'Opens',
): string {
  const clock = formatClockHour12(boundary)
  const boundaryYmd = ymdFor(boundary)
  const nowYmd = ymdFor(now)
  if (sameYmd(boundaryYmd, nowYmd)) return `${verb} ${clock} today`
  const tomorrowYmd = addOneDay(nowYmd)
  if (sameYmd(boundaryYmd, tomorrowYmd)) return `${verb} ${clock} tomorrow`
  return `${formatDayName(boundary)} ${clock}`
}

type Ymd = { year: number; month: number; day: number }

function ymdFor(date: Date): Ymd {
  const parts = YMD_FORMATTER.formatToParts(date)
  const get = (t: Intl.DateTimeFormatPartTypes): number => {
    const p = parts.find(x => x.type === t)
    if (!p) throw new Error(`ymdFor: missing ${t}`)
    return parseInt(p.value, 10)
  }
  return { year: get('year'), month: get('month'), day: get('day') }
}

function sameYmd(a: Ymd, b: Ymd): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day
}

function addOneDay(ymd: Ymd): Ymd {
  // Use Date.UTC arithmetic — no DST exposure since we operate on
  // London-local calendar coordinates already extracted via YMD_FORMATTER.
  const t = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day))
  t.setUTCDate(t.getUTCDate() + 1)
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() }
}

export type CountdownInput = {
  state: CountdownState
  now: Date
  boundaryAt: Date | null  // window-close for active/urgent; window-open for unavailable; nextWindow.startsAt for redeemed; null for expired
}

export function formatPrimaryCountdown(input: CountdownInput): string {
  const { state, now, boundaryAt } = input
  if (state === 'expired' || boundaryAt === null) return '—'
  const deltaMs = boundaryAt.getTime() - now.getTime()
  if (state === 'active') {
    // Clock-time anchor — boundaryAt is the window CLOSE.
    return formatClockTime(boundaryAt)
  }
  // urgent / unavailable-* / redeemed-this-window → duration
  return formatDurationCompact(deltaMs)
}

export type CountdownSupportingInput = {
  state: CountdownState
  now: Date
  boundaryAt: Date | null
  schedule: string  // "Mon-Fri, 11am-3pm" etc. from scheduleString.ts (M4b-3)
}

export function formatSupportingCountdown(input: CountdownSupportingInput): string {
  const { state, now, boundaryAt, schedule } = input
  if (state === 'expired' || boundaryAt === null) return schedule

  switch (state) {
    case 'active': {
      const dur = formatDurationCompact(boundaryAt.getTime() - now.getTime())
      return `Ends in ${dur} · ${schedule}`
    }
    case 'urgent': {
      return `Ends at ${formatClockTime(boundaryAt)} · ${schedule}`
    }
    case 'unavailable-today': {
      return `Starts at ${formatClockTime(boundaryAt)} · ${schedule}`
    }
    case 'unavailable-future-day':
    case 'redeemed-this-window': {
      return `${formatDayName(boundaryAt)} ${formatClockTime(boundaryAt)} · ${schedule}`
    }
    default: {
      const _exhaustive: never = state
      void _exhaustive
      return schedule
    }
  }
}

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

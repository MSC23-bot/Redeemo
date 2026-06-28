// Insights PR-A Task A1: London/DST time math (spec 1.7, 2.3). Pure functions
// only: no DB, no SQL, no Date.now() side-channels (callers inject `now` for
// deterministic tests). Every window is half-open [start, end) computed against
// the Europe/London calendar then expressed as UTC instants, so callers can
// query `redeemedAt >= startUtc AND redeemedAt < endUtc` directly.
//
// All London<->UTC conversion goes through Intl.DateTimeFormat with
// timeZone:'Europe/London', which tracks the BST/GMT switch automatically. We
// never hardcode a fixed UTC offset, because DST shifts it (GMT in winter,
// BST = UTC+1 in summer; in 2026 BST runs Sun 29 Mar .. Sun 25 Oct).

/** A half-open [startUtc, endUtc) window. `null` startUtc means open-ended (the 'all' period). */
export type PeriodWindow = {
  /** Inclusive UTC start instant, or null for an open-ended 'all' window. */
  startUtc: Date | null
  /** Exclusive UTC end instant. */
  endUtc: Date
  /** The comparable preceding window, or null when not comparable (incomplete / 'all'). */
  comparison: { startUtc: Date; endUtc: Date } | null
  /** Stable machine label for the period. */
  label: PeriodPreset
}

export type PeriodPreset = 'this_month' | 'last_month' | 'last_3m' | 'last_6m' | 'all' | 'custom'

export type CustomRange = { from: string; to: string } // YYYY-MM .. YYYY-MM (inclusive months)

/** A London wall-clock instant, expressed as calendar components (no timezone). */
export type LondonWall = {
  year: number
  month: number // 1..12
  day: number // 1..31
  hour: number // 0..23
  minute: number // 0..59
}

/**
 * The offset (in minutes) that Europe/London is AHEAD of UTC at the given UTC
 * instant. GMT -> 0, BST -> +60. Derived from Intl numeric parts (universally
 * supported across runtimes; no locale-specific weekday strings) mirroring the
 * vetted approach in apps/customer-app/.../londonNow.ts.
 */
function londonOffsetMinutesAt(utc: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(utc)
  const find = (type: string) => parts.find((p) => p.type === type)?.value
  const rawHour = parseInt(find('hour') ?? '0', 10)
  const wall = Date.UTC(
    parseInt(find('year') ?? '1970', 10),
    parseInt(find('month') ?? '1', 10) - 1,
    parseInt(find('day') ?? '1', 10),
    rawHour === 24 ? 0 : rawHour,
    parseInt(find('minute') ?? '0', 10),
    parseInt(find('second') ?? '0', 10)
  )
  // (London wall clock read as if UTC) - (actual UTC) = the offset London is ahead.
  return Math.round((wall - utc.getTime()) / 60000)
}

/**
 * Convert a Europe/London wall-clock time to its UTC instant, DST-correct.
 *
 * A naive `Date.UTC(...)` treats the components as UTC, which is wrong by the
 * London offset. We subtract the offset that applies at the resulting instant.
 * Because the offset itself depends on the instant (and changes at DST
 * boundaries), we converge in two passes: estimate with the offset at the naive
 * UTC guess, then re-evaluate the offset at the corrected instant. Two passes
 * are sufficient for month/day boundaries (we never sit on the single ambiguous
 * DST-transition hour for these window edges).
 */
export function londonRangeUtc(wall: LondonWall): Date {
  const naiveUtcMs = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0)
  const offset1 = londonOffsetMinutesAt(new Date(naiveUtcMs))
  const guess1 = naiveUtcMs - offset1 * 60000
  const offset2 = londonOffsetMinutesAt(new Date(guess1))
  const guess2 = naiveUtcMs - offset2 * 60000
  return new Date(guess2)
}

/**
 * The half-open [startUtc, endUtc) window for a single London calendar month.
 * `month` is 1..12; December rolls to January of the next year for the end edge.
 */
export function londonMonthWindow(year: number, month: number): { startUtc: Date; endUtc: Date } {
  const startUtc = londonRangeUtc({ year, month, day: 1, hour: 0, minute: 0 })
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const endUtc = londonRangeUtc({ year: nextYear, month: nextMonth, day: 1, hour: 0, minute: 0 })
  return { startUtc, endUtc }
}

/** The London wall-clock year+month for a UTC instant (used to find the current month). */
function londonYearMonth(utc: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: 'numeric',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(utc)
  const find = (type: string) => parts.find((p) => p.type === type)?.value
  return {
    year: parseInt(find('year') ?? '1970', 10),
    month: parseInt(find('month') ?? '1', 10),
  }
}

/** Step a (year, month-1..12) pair forward/back by `delta` months, normalised. */
function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  // month is 1..12; convert to a 0-based absolute month index, shift, convert back.
  const zeroBased = (year * 12 + (month - 1)) + delta
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 }
}

function parseYearMonth(s: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(s)
  if (!m) throw new Error(`Invalid YYYY-MM value: ${s}`)
  const year = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  if (month < 1 || month > 12) throw new Error(`Invalid month in YYYY-MM value: ${s}`)
  return { year, month }
}

/**
 * Whether the window for a period is COMPLETE (does not include the current
 * incomplete London month). An incomplete period drives comparison = null
 * upstream (spec §6.2, locked rule). 'all' and 'this_month' are incomplete;
 * 'last_month'/'last_3m'/'last_6m' exclude the current month and are complete;
 * 'custom' is complete iff its `to` month is strictly before the current month.
 */
export function isPeriodComplete(period: PeriodPreset, now: Date, custom?: CustomRange): boolean {
  if (period === 'all' || period === 'this_month') return false
  if (period === 'last_month' || period === 'last_3m' || period === 'last_6m') return true
  // custom
  if (!custom) throw new Error("custom period requires a { from, to } range")
  const cur = londonYearMonth(now)
  const to = parseYearMonth(custom.to)
  const curAbs = cur.year * 12 + (cur.month - 1)
  const toAbs = to.year * 12 + (to.month - 1)
  return toAbs < curAbs
}

/**
 * Resolve the [startUtc, endUtc) window for a period. `now` is injected so
 * tests are deterministic (no internal Date.now()). For 'all', startUtc is null
 * (open-ended earliest) and endUtc is `now`. The returned `comparison` is the
 * immediately-preceding comparable window, or null when not comparable.
 */
export function periodWindow(period: PeriodPreset, now: Date, custom?: CustomRange): PeriodWindow {
  const cur = londonYearMonth(now)

  switch (period) {
    case 'this_month': {
      const start = londonMonthWindow(cur.year, cur.month).startUtc
      return { startUtc: start, endUtc: now, comparison: null, label: period }
    }
    case 'last_month': {
      const prev = addMonths(cur.year, cur.month, -1)
      const w = londonMonthWindow(prev.year, prev.month)
      return { startUtc: w.startUtc, endUtc: w.endUtc, comparison: resolveComparisonWindow(period, now), label: period }
    }
    case 'last_3m':
    case 'last_6m': {
      const span = period === 'last_3m' ? 3 : 6
      const end = londonMonthWindow(cur.year, cur.month).startUtc // current month start = exclusive end
      const first = addMonths(cur.year, cur.month, -span)
      const start = londonMonthWindow(first.year, first.month).startUtc
      return { startUtc: start, endUtc: end, comparison: resolveComparisonWindow(period, now), label: period }
    }
    case 'all': {
      return { startUtc: null, endUtc: now, comparison: null, label: period }
    }
    case 'custom': {
      if (!custom) throw new Error("custom period requires a { from, to } range")
      const from = parseYearMonth(custom.from)
      const to = parseYearMonth(custom.to)
      const start = londonMonthWindow(from.year, from.month).startUtc
      const afterTo = addMonths(to.year, to.month, 1)
      const end = londonMonthWindow(afterTo.year, afterTo.month).startUtc
      return { startUtc: start, endUtc: end, comparison: resolveComparisonWindow(period, now, custom), label: period }
    }
    default: {
      const exhaustive: never = period
      throw new Error(`Unknown period: ${String(exhaustive)}`)
    }
  }
}

/** Alias matching the prompt's preferred name; identical to periodWindow. */
export function resolvePeriodWindow(period: PeriodPreset, now: Date, custom?: CustomRange): PeriodWindow {
  return periodWindow(period, now, custom)
}

/**
 * The immediately-preceding comparable [startUtc, endUtc) window, or null when
 * the period is incomplete / 'all' / not comparable. Comparison is
 * completed-month-only: it is the contiguous, equal-length window that ends
 * exactly where the main window starts.
 */
export function resolveComparisonWindow(
  period: PeriodPreset,
  now: Date,
  custom?: CustomRange
): { startUtc: Date; endUtc: Date } | null {
  if (period === 'all' || period === 'this_month') return null
  if (!isPeriodComplete(period, now, custom)) return null

  const cur = londonYearMonth(now)

  if (period === 'last_month') {
    const prev = addMonths(cur.year, cur.month, -1)
    const cmp = addMonths(prev.year, prev.month, -1)
    return londonMonthWindow(cmp.year, cmp.month)
  }

  if (period === 'last_3m' || period === 'last_6m') {
    const span = period === 'last_3m' ? 3 : 6
    // main window: [cur-span, cur). comparison: [cur-2*span, cur-span).
    const cmpStart = addMonths(cur.year, cur.month, -2 * span)
    const cmpEnd = addMonths(cur.year, cur.month, -span)
    return {
      startUtc: londonMonthWindow(cmpStart.year, cmpStart.month).startUtc,
      endUtc: londonMonthWindow(cmpEnd.year, cmpEnd.month).startUtc,
    }
  }

  // custom (completed): N = number of months in [from, to] inclusive.
  if (!custom) throw new Error("custom period requires a { from, to } range")
  const from = parseYearMonth(custom.from)
  const to = parseYearMonth(custom.to)
  const fromAbs = from.year * 12 + (from.month - 1)
  const toAbs = to.year * 12 + (to.month - 1)
  const n = toAbs - fromAbs + 1
  const cmpStart = addMonths(from.year, from.month, -n)
  return {
    startUtc: londonMonthWindow(cmpStart.year, cmpStart.month).startUtc,
    endUtc: londonMonthWindow(from.year, from.month).startUtc,
  }
}

// --- Dayparts (spec §1.7, six locked owner-facing Europe/London dayparts) ---

export type Daypart = { label: string; startHour: number; endHour: number }

/**
 * The six ordered Europe/London dayparts with half-open [startHour, endHour)
 * bounds. No gaps, no overlaps, covering the full 24h. Locked labels (spec §1.7).
 */
export const DAYPARTS: readonly Daypart[] = [
  { label: 'Overnight', startHour: 0, endHour: 7 },
  { label: 'Morning', startHour: 7, endHour: 12 },
  { label: 'Lunch', startHour: 12, endHour: 15 },
  { label: 'Afternoon', startHour: 15, endHour: 18 },
  { label: 'Evening', startHour: 18, endHour: 22 },
  { label: 'Late', startHour: 22, endHour: 24 },
]

/** The six ordered daypart labels, index-aligned to DAYPARTS. */
export const DAYPART_LABELS: readonly string[] = DAYPARTS.map((d) => d.label)

/**
 * Map a Europe/London hour-of-day (0..23) to its daypart index (0..5) under the
 * half-open [startHour, endHour) bounds above. Throws for an out-of-range hour.
 */
export function daypartIndexForLondonHour(hour: number): number {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`London hour out of range (expected 0..23): ${hour}`)
  }
  for (let i = 0; i < DAYPARTS.length; i++) {
    if (hour >= DAYPARTS[i].startHour && hour < DAYPARTS[i].endHour) return i
  }
  // Unreachable for 0..23 given the full-coverage bounds, but keep it explicit.
  throw new Error(`London hour did not match any daypart: ${hour}`)
}

/**
 * Europe/London weekday for a UTC instant, remapped to Mon=0..Sun=6 (the
 * busy-times grid row order, spec §1.7). DELIBERATELY DIFFERENT from
 * getLondonClock's 0=Sun..6=Sat: we derive the London calendar day then remap
 * Sun(0) -> 6 and Mon(1)..Sat(6) -> 0..5. After-midnight London belongs to its
 * actual London calendar day (the Intl conversion gives the London date, so a
 * 00:30 London time on a Tuesday reads as Tuesday, not the previous evening).
 */
export function londonDowMon0(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(date)
  const find = (type: string) => parts.find((p) => p.type === type)?.value
  const year = parseInt(find('year') ?? '1970', 10)
  const month = parseInt(find('month') ?? '1', 10)
  const day = parseInt(find('day') ?? '1', 10)
  // Read the London calendar day-of-week via a UTC Date built from London's
  // wall-clock date (getUTCDay is a portable 0=Sun..6=Sat lookup).
  const sunZero = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  // Remap Sun(0) -> 6, Mon(1)..Sat(6) -> 0..5.
  return (sunZero + 6) % 7
}

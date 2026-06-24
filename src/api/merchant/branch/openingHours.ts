import { AppError } from '../../shared/errors'

/**
 * Branches PR-8 (umbrella D9): pure, IO-free opening-hours validation for the
 * MULTI-WINDOW storage model.
 *
 * The live model is now MULTIPLE windows per day: `BranchOpeningHours` no longer
 * carries `@@unique([branchId, dayOfWeek])`, so a single day can hold N>=1 open
 * windows (e.g. "9am-2pm, 5pm-11pm"). This validator guards THAT model.
 *
 * Cardinality rules (per day):
 *  - Open day  (isClosed:false): N>=1 rows, EACH with a well-formed openTime AND
 *    closeTime.
 *  - Closed day (isClosed:true): EXACTLY ONE row, with openTime AND closeTime
 *    absent/null, and ZERO open-window rows for that day. Mixing an isClosed:true
 *    row with open-window rows on the same day is REJECTED.
 *
 * Per-row format rules (unchanged from the single-window model):
 *  - dayOfWeek range: 0-6 (defense-in-depth; the route Zod also guards this).
 *  - Time format: "HH:MM", hours 00-23, minutes 00-59. closeTime MAY additionally
 *    be the "24:00" sentinel (end-of-day / Open 24h); openTime may NOT be "24:00".
 *  - Degenerate window: openTime === closeTime is rejected (zero-length).
 *
 * Overnight / cross-midnight (D9-settled):
 *  - `close < open` is the FIRST-CLASS encoding for a window that crosses midnight
 *    (e.g. open 18:00, close 02:00 = 6pm to 2am next day). It is ACCEPTED — the
 *    readers (isOpenNow + the clients) interpret it as crossing midnight.
 *  - `24:00` as a close is the literal end-of-day sentinel (open 09:00, close 24:00
 *    = 9am to midnight); Open 24h is a single 00:00 -> 24:00 window. `24:00`-as-close
 *    and `close < open`-overnight are DISTINCT (24:00 ends exactly at midnight;
 *    close<open continues past midnight into the next day).
 *
 * No-overlap (HALF-OPEN intervals `[open, close)`, both WITHIN-day and CROSS-day):
 *  - WITHIN-DAY: sort a day's windows by openTime; no two may overlap. An overnight
 *    window's same-day part is `[open, 24:00)`.
 *  - CROSS-DAY: an overnight window (`close < open`) on day D spills into D+1 as the
 *    interval `[00:00, close)` of D+1. A window ON D+1 that overlaps that spill is
 *    REJECTED (with a 7-day wrap, so Sunday's overnight spills into Monday). A day
 *    marked CLOSED (one isClosed row, zero windows) may still RECEIVE a prior-day
 *    spill — it has no own windows, so there is nothing to reject; the branch is
 *    genuinely open during the spill and `isOpenNow`'s yesterday-spillover pass
 *    reports it open.
 *  - Boundary: overlap is detected on HALF-OPEN intervals, so abutting windows where
 *    `prev.close === next.open` (e.g. 09:00-14:00 then 14:00-23:00, OR a prior-day
 *    spill ending exactly at the next window's open) are ACCEPTED.
 *
 * Kept pure (no Prisma, no async) so it is unit-testable in isolation and could be
 * shared with the frontend later. Throws AppError('OPENING_HOURS_INVALID') on the
 * first violation. The validated set is the same shape that is persisted (N rows
 * per day); read-time ordering is `(dayOfWeek asc, openTime asc)`.
 */

export type OpeningHoursInput = {
  dayOfWeek: number
  openTime?: string | null
  closeTime?: string | null
  isClosed: boolean
}

// "HH:MM" with hours 00-23 and minutes 00-59. The "24:00" sentinel is handled
// separately (allowed only as a closeTime), NOT by this regex.
const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

const MINUTES_PER_DAY = 24 * 60 // 1440

function reject(reason: string): never {
  throw new AppError('OPENING_HOURS_INVALID', { reason })
}

function hasValue(v: string | null | undefined): v is string {
  return v !== undefined && v !== null
}

/** Parse a validated "HH:MM" (or the "24:00" close sentinel) into minutes-since-midnight. */
function toMinutes(hhmm: string): number {
  if (hhmm === '24:00') return MINUTES_PER_DAY
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Half-open interval [start, end) in minutes. */
interface Interval {
  start: number
  end: number
}

/** True iff two HALF-OPEN intervals [a.start,a.end) and [b.start,b.end) overlap. Abutting (a.end===b.start) does NOT overlap. */
function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end
}

export function validateOpeningHours(hours: OpeningHoursInput[]): void {
  // (1) Per-row format + dayOfWeek-range checks, and GROUP by dayOfWeek. We build,
  // per open day, the list of half-open same-day window intervals [open, sameDayEnd),
  // where an overnight window (close < open) contributes [open, 24:00) on its own day
  // and (separately, below) a [0, close) spill into the next day.
  const closedDays = new Set<number>()
  const openWindowDays = new Set<number>()
  const sameDayWindows = new Map<number, Interval[]>() // dayOfWeek -> [open, sameDayEnd)
  const overnightSpills = new Map<number, number>()    // dayOfWeek -> the LATEST overnight close (minutes) that spills into the NEXT day

  for (const row of hours) {
    const { dayOfWeek, openTime, closeTime, isClosed } = row

    // dayOfWeek range (defense-in-depth).
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      reject(`dayOfWeek must be an integer in [0, 6] (got ${dayOfWeek})`)
    }

    if (isClosed) {
      // Closed-day row must carry no times.
      if (hasValue(openTime) || hasValue(closeTime)) {
        reject(`dayOfWeek ${dayOfWeek} is closed but still has openTime/closeTime`)
      }
      if (closedDays.has(dayOfWeek)) {
        reject(`dayOfWeek ${dayOfWeek} has more than one closed row (a closed day is exactly one isClosed row)`)
      }
      closedDays.add(dayOfWeek)
      continue
    }

    // Open window: both times required.
    if (!hasValue(openTime) || !hasValue(closeTime)) {
      reject(`dayOfWeek ${dayOfWeek} is open but is missing openTime or closeTime`)
    }

    // openTime format ("24:00" not allowed as an open).
    if (!HHMM_REGEX.test(openTime as string)) {
      reject(`dayOfWeek ${dayOfWeek} openTime must be HH:MM in [00:00, 23:59] (got "${openTime}")`)
    }

    // closeTime format (HH:MM OR the "24:00" sentinel).
    if (closeTime !== '24:00' && !HHMM_REGEX.test(closeTime as string)) {
      reject(`dayOfWeek ${dayOfWeek} closeTime must be HH:MM in [00:00, 23:59] or "24:00" (got "${closeTime}")`)
    }

    // Degenerate zero-length window. close < open is ACCEPTED (overnight); only the
    // exact equality is a zero-length reject.
    if (openTime === closeTime) {
      reject(`dayOfWeek ${dayOfWeek} openTime and closeTime are identical (zero-length window)`)
    }

    openWindowDays.add(dayOfWeek)

    const openMins = toMinutes(openTime as string)
    const closeMins = toMinutes(closeTime as string)

    // Same-day part of this window: [open, close) for a same-day window, or
    // [open, 24:00) for an overnight window (the part before midnight). The
    // [0, close) spill of an overnight window is tracked separately for the
    // cross-day check.
    const sameDayEnd = closeMins > openMins ? closeMins : MINUTES_PER_DAY
    const dayWindows = sameDayWindows.get(dayOfWeek) ?? []
    dayWindows.push({ start: openMins, end: sameDayEnd })
    sameDayWindows.set(dayOfWeek, dayWindows)

    if (closeMins < openMins) {
      // Overnight: spills into the NEXT day as [0, close). Keep the LATEST close so
      // the cross-day check uses the widest spill (if a day somehow had two overnight
      // windows the within-day no-overlap check below would already have rejected
      // them, but track the max defensively).
      const prev = overnightSpills.get(dayOfWeek)
      overnightSpills.set(dayOfWeek, prev === undefined ? closeMins : Math.max(prev, closeMins))
    }
  }

  // (2) FORBID mixing a closed-day row with open windows on the same day.
  for (const day of closedDays) {
    if (openWindowDays.has(day)) {
      reject(`dayOfWeek ${day} mixes a closed (isClosed:true) row with open windows`)
    }
  }

  // (3) WITHIN-DAY no-overlap: sort each day's same-day windows by start and ensure
  // no two adjacent (after sort) half-open intervals overlap.
  for (const [day, windows] of sameDayWindows) {
    const sorted = [...windows].sort((a, b) => a.start - b.start)
    for (let i = 1; i < sorted.length; i++) {
      if (overlaps(sorted[i - 1], sorted[i])) {
        reject(`dayOfWeek ${day} has overlapping windows`)
      }
    }
  }

  // (4) CROSS-DAY no-overlap: for each day that originated an overnight window, that
  // window spills into the NEXT day (7-day wrap) as [0, spillClose). Reject any of
  // the next day's OWN same-day windows that overlap that spill. A closed next day
  // has no own windows, so a prior-day spill onto a closed day is allowed.
  for (const [day, spillClose] of overnightSpills) {
    const nextDay = (day + 1) % 7
    const spill: Interval = { start: 0, end: spillClose }
    const nextWindows = sameDayWindows.get(nextDay) ?? []
    for (const w of nextWindows) {
      if (overlaps(spill, w)) {
        reject(
          `dayOfWeek ${nextDay} has a window overlapping the overnight spill from dayOfWeek ${day} ` +
            `([00:00, ${spillClose} min))`,
        )
      }
    }
  }
}

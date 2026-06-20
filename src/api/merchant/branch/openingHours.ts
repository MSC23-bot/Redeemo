import { AppError } from '../../shared/errors'

/**
 * M2 B4 (D8a): pure, IO-free opening-hours validation for the LIVE storage model.
 *
 * The live model is SINGLE-period-per-day: `BranchOpeningHours` has
 * `@@unique([branchId, dayOfWeek])`, so there is exactly one (open, close) period
 * per (branch, day). This validator guards THAT model (it does NOT add multi-period
 * support, which would need a schema change).
 *
 * Rules:
 *  - Duplicate day: each dayOfWeek may appear at most once (the single-period
 *    "overlapping / unordered" case).
 *  - dayOfWeek range: 0-6 (defense-in-depth; the route Zod also guards this).
 *  - Closed day (isClosed:true): openTime AND closeTime must both be absent/null.
 *  - Open day (isClosed:false): both openTime AND closeTime are required + well-formed.
 *  - Time format: "HH:MM", hours 00-23, minutes 00-59. closeTime MAY additionally be
 *    the "24:00" sentinel (end-of-day / Open 24h); openTime may NOT be "24:00".
 *  - Degenerate period: openTime === closeTime is rejected (zero-length).
 *  - ACCEPTED: same-day (close > open), OVERNIGHT (close < open, e.g. 18:00 -> 02:00 -
 *    the customer-app consumer treats a close earlier than open as crossing midnight),
 *    and Open 24h (00:00 -> 24:00). close < open is NOT rejected.
 *
 * Kept pure (no Prisma, no async) so it is unit-testable in isolation and could be
 * shared with the frontend later. Throws AppError('OPENING_HOURS_INVALID') on the
 * first violation.
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

function reject(reason: string): never {
  throw new AppError('OPENING_HOURS_INVALID', { reason })
}

function hasValue(v: string | null | undefined): v is string {
  return v !== undefined && v !== null
}

export function validateOpeningHours(hours: OpeningHoursInput[]): void {
  const seenDays = new Set<number>()

  for (const row of hours) {
    const { dayOfWeek, openTime, closeTime, isClosed } = row

    // dayOfWeek range (defense-in-depth).
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      reject(`dayOfWeek must be an integer in [0, 6] (got ${dayOfWeek})`)
    }

    // Duplicate day (the single-period "overlap").
    if (seenDays.has(dayOfWeek)) {
      reject(`dayOfWeek ${dayOfWeek} appears more than once`)
    }
    seenDays.add(dayOfWeek)

    if (isClosed) {
      // Closed day must carry no times.
      if (hasValue(openTime) || hasValue(closeTime)) {
        reject(`dayOfWeek ${dayOfWeek} is closed but still has openTime/closeTime`)
      }
      continue
    }

    // Open day: both times required.
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

    // Degenerate zero-length period. close < open is ACCEPTED (overnight); only the
    // exact equality is a zero-length reject.
    if (openTime === closeTime) {
      reject(`dayOfWeek ${dayOfWeek} openTime and closeTime are identical (zero-length period)`)
    }
  }
}

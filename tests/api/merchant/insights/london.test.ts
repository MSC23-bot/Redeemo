import { describe, it, expect } from 'vitest'
import {
  londonMonthWindow,
  londonRangeUtc,
  periodWindow,
  resolvePeriodWindow,
  isPeriodComplete,
  resolveComparisonWindow,
  daypartIndexForLondonHour,
  londonDowMon0,
  DAYPARTS,
  DAYPART_LABELS,
} from '../../../../src/api/merchant/insights/london'

// Foundation-stage unit tests (Insights PR-A Task A1; spec 1.7, 2.3). Pure
// London/DST time math only: no real DB, no SQL, no routes. Europe/London
// boundaries are derived via Intl (timeZone:'Europe/London') and converted to
// UTC instants; we never hardcode a fixed UTC offset, because BST/GMT shifts it.
// BST 2026: starts Sun 29 Mar 2026, ends Sun 25 Oct 2026.

describe('londonMonthWindow', () => {
  it('GMT month: 1 March 2026 00:00 London = 2026-03-01T00:00:00Z', () => {
    const w = londonMonthWindow(2026, 3)
    expect(w.startUtc.toISOString()).toBe('2026-03-01T00:00:00.000Z')
    // April 1 is still GMT (BST starts 29 Mar, but the month boundary is the
    // April calendar start which is after the switch).
    expect(w.endUtc.toISOString()).toBe('2026-03-31T23:00:00.000Z')
  })

  it('BST month: 1 July 2026 00:00 London = 2026-06-30T23:00:00Z (UTC+1)', () => {
    const w = londonMonthWindow(2026, 7)
    expect(w.startUtc.toISOString()).toBe('2026-06-30T23:00:00.000Z')
    expect(w.endUtc.toISOString()).toBe('2026-07-31T23:00:00.000Z')
  })

  it('December rolls to January of the next year', () => {
    const w = londonMonthWindow(2026, 12)
    // Dec 2026 is GMT (BST ended 25 Oct), so 1 Dec 00:00 London = 2026-12-01T00:00:00Z.
    expect(w.startUtc.toISOString()).toBe('2026-12-01T00:00:00.000Z')
    // End edge is 1 Jan 2027 00:00 London (GMT) = 2027-01-01T00:00:00Z.
    expect(w.endUtc.toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })

  it('spring-forward month (March 2026) still produces correct UTC start (GMT before BST switch)', () => {
    // 1 March 2026 is GMT; the BST switch is 29 March, but the start boundary is
    // the GMT-side instant. End boundary is 1 April 00:00 London, which by then
    // is BST (UTC+1) -> 2026-03-31T23:00:00Z.
    const w = londonMonthWindow(2026, 3)
    expect(w.startUtc.toISOString()).toBe('2026-03-01T00:00:00.000Z')
    expect(w.endUtc.toISOString()).toBe('2026-03-31T23:00:00.000Z')
  })

  it('autumn-back month (October 2026) still produces correct UTC boundaries', () => {
    // 1 Oct 2026 00:00 London is BST (UTC+1) -> 2026-09-30T23:00:00Z. End is
    // 1 Nov 2026 00:00 London, which is GMT after the 25 Oct switch -> 2026-11-01T00:00:00Z.
    const w = londonMonthWindow(2026, 10)
    expect(w.startUtc.toISOString()).toBe('2026-09-30T23:00:00.000Z')
    expect(w.endUtc.toISOString()).toBe('2026-11-01T00:00:00.000Z')
  })
})

describe('londonRangeUtc', () => {
  it('maps a London wall-clock to its UTC instant (GMT)', () => {
    expect(londonRangeUtc({ year: 2026, month: 1, day: 1, hour: 0, minute: 0 }).toISOString()).toBe(
      '2026-01-01T00:00:00.000Z'
    )
  })

  it('maps a London wall-clock to its UTC instant (BST, UTC+1)', () => {
    expect(londonRangeUtc({ year: 2026, month: 7, day: 1, hour: 0, minute: 0 }).toISOString()).toBe(
      '2026-06-30T23:00:00.000Z'
    )
  })
})

describe('periodWindow / resolvePeriodWindow', () => {
  it('this_month is [1st 00:00 London, now) in UTC, with no comparison (incomplete)', () => {
    const now = new Date('2026-03-15T12:00:00Z')
    const w = periodWindow('this_month', now)
    // startUtc is non-null for every period except 'all' (asserted separately).
    expect(w.startUtc!.toISOString()).toBe('2026-03-01T00:00:00.000Z')
    expect(w.endUtc.toISOString()).toBe('2026-03-15T12:00:00.000Z')
    expect(w.comparison).toBeNull()
  })

  it('resolvePeriodWindow is an alias of periodWindow', () => {
    const now = new Date('2026-03-15T12:00:00Z')
    const a = resolvePeriodWindow('this_month', now)
    const b = periodWindow('this_month', now)
    expect(a.startUtc!.toISOString()).toBe(b.startUtc!.toISOString())
    expect(a.endUtc.toISOString()).toBe(b.endUtc.toISOString())
    expect(a.comparison).toBeNull()
  })

  it('completed last_month is [Feb, Mar) and compares to the month before [Jan, Feb)', () => {
    const w = periodWindow('last_month', new Date('2026-03-15T12:00:00Z'))
    expect(w.startUtc!.toISOString()).toBe('2026-02-01T00:00:00.000Z')
    expect(w.endUtc.toISOString()).toBe('2026-03-01T00:00:00.000Z')
    expect(w.comparison?.startUtc.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(w.comparison?.endUtc.toISOString()).toBe('2026-02-01T00:00:00.000Z')
  })

  it('last_3m excludes the current month; compares the preceding 3 (contiguous, equal length) - BST-robust', () => {
    const w = periodWindow('last_3m', new Date('2026-04-15T12:00:00Z'))
    // April (current) EXCLUDED
    expect(w.endUtc.toISOString()).toBe(londonMonthWindow(2026, 4).startUtc.toISOString())
    // Jan..Mar
    expect(w.startUtc!.toISOString()).toBe(londonMonthWindow(2026, 1).startUtc.toISOString())
    // contiguous
    expect(w.comparison?.endUtc.toISOString()).toBe(w.startUtc!.toISOString())
    // Oct..Dec 2025
    expect(w.comparison?.startUtc.toISOString()).toBe(londonMonthWindow(2025, 10).startUtc.toISOString())
  })

  it('last_6m excludes the current month; compares the preceding 6', () => {
    const w = periodWindow('last_6m', new Date('2026-07-15T12:00:00Z'))
    // July (current) EXCLUDED
    expect(w.endUtc.toISOString()).toBe(londonMonthWindow(2026, 7).startUtc.toISOString())
    // Jan..Jun
    expect(w.startUtc!.toISOString()).toBe(londonMonthWindow(2026, 1).startUtc.toISOString())
    // Jul..Dec 2025
    expect(w.comparison?.startUtc.toISOString()).toBe(londonMonthWindow(2025, 7).startUtc.toISOString())
    expect(w.comparison?.endUtc.toISOString()).toBe(w.startUtc!.toISOString())
  })

  it("'all' is open-ended: startUtc null, endUtc = now, comparison null", () => {
    const now = new Date('2026-03-15T12:00:00Z')
    const w = periodWindow('all', now)
    expect(w.startUtc).toBeNull()
    expect(w.endUtc.toISOString()).toBe('2026-03-15T12:00:00.000Z')
    expect(w.comparison).toBeNull()
  })

  it('custom range over completed months only compares to the immediately-preceding equal-length window', () => {
    // Jan..Feb 2026 (two completed months relative to a March 2026 now)
    const w = periodWindow('custom', new Date('2026-03-15T12:00:00Z'), { from: '2026-01', to: '2026-02' })
    expect(w.startUtc!.toISOString()).toBe(londonMonthWindow(2026, 1).startUtc.toISOString())
    // half-open: end is the start of the month AFTER 'to' (Feb -> Mar 1)
    expect(w.endUtc.toISOString()).toBe(londonMonthWindow(2026, 3).startUtc.toISOString())
    // preceding equal-length (2 months): Nov..Dec 2025
    expect(w.comparison?.startUtc.toISOString()).toBe(londonMonthWindow(2025, 11).startUtc.toISOString())
    expect(w.comparison?.endUtc.toISOString()).toBe(w.startUtc!.toISOString())
  })

  it('custom range containing the current incomplete month yields no comparison', () => {
    const w = periodWindow('custom', new Date('2026-03-15T12:00:00Z'), { from: '2026-01', to: '2026-03' })
    // end is start of month after 'to' (Mar -> Apr 1)
    expect(w.endUtc.toISOString()).toBe(londonMonthWindow(2026, 4).startUtc.toISOString())
    expect(w.comparison).toBeNull()
  })

  it('half-open boundary: end is exclusive (a redemption exactly at endUtc is OUTSIDE the window)', () => {
    const w = periodWindow('last_month', new Date('2026-03-15T12:00:00Z'))
    const end = w.endUtc.getTime()
    // A row redeemed exactly at endUtc must NOT satisfy redeemedAt < endUtc.
    expect(end < end).toBe(false)
    // The last included instant is strictly before endUtc.
    expect(end - 1 < end).toBe(true)
  })
})

describe('isPeriodComplete', () => {
  const march15 = new Date('2026-03-15T12:00:00Z')

  it('this_month is incomplete (includes the current London month)', () => {
    expect(isPeriodComplete('this_month', march15)).toBe(false)
  })

  it('last_month is complete', () => {
    expect(isPeriodComplete('last_month', march15)).toBe(true)
  })

  it('last_3m / last_6m are complete (exclude the current month)', () => {
    expect(isPeriodComplete('last_3m', march15)).toBe(true)
    expect(isPeriodComplete('last_6m', march15)).toBe(true)
  })

  it("'all' is incomplete (it includes the current incomplete month)", () => {
    expect(isPeriodComplete('all', march15)).toBe(false)
  })

  it('custom ending on a completed month is complete', () => {
    expect(isPeriodComplete('custom', march15, { from: '2026-01', to: '2026-02' })).toBe(true)
  })

  it('custom ending on the current month is incomplete -> no comparison upstream', () => {
    expect(isPeriodComplete('custom', march15, { from: '2026-01', to: '2026-03' })).toBe(false)
    expect(periodWindow('custom', march15, { from: '2026-01', to: '2026-03' }).comparison).toBeNull()
  })
})

describe('resolveComparisonWindow', () => {
  const march15 = new Date('2026-03-15T12:00:00Z')

  it('this_month -> null (incomplete)', () => {
    expect(resolveComparisonWindow('this_month', march15)).toBeNull()
  })

  it("'all' -> null (not comparable)", () => {
    expect(resolveComparisonWindow('all', march15)).toBeNull()
  })

  it('last_month -> the immediately-preceding completed month [Jan, Feb)', () => {
    const c = resolveComparisonWindow('last_month', march15)
    expect(c?.startUtc.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(c?.endUtc.toISOString()).toBe('2026-02-01T00:00:00.000Z')
  })

  it('matches periodWindow().comparison for the same inputs', () => {
    const c = resolveComparisonWindow('last_3m', new Date('2026-04-15T12:00:00Z'))
    const w = periodWindow('last_3m', new Date('2026-04-15T12:00:00Z'))
    expect(c?.startUtc.toISOString()).toBe(w.comparison?.startUtc.toISOString())
    expect(c?.endUtc.toISOString()).toBe(w.comparison?.endUtc.toISOString())
  })
})

describe('DAYPARTS / daypartIndexForLondonHour', () => {
  it('exports the six ordered dayparts with half-open [startHour, endHour) bounds', () => {
    expect(DAYPARTS).toEqual([
      { label: 'Overnight', startHour: 0, endHour: 7 },
      { label: 'Morning', startHour: 7, endHour: 12 },
      { label: 'Lunch', startHour: 12, endHour: 15 },
      { label: 'Afternoon', startHour: 15, endHour: 18 },
      { label: 'Evening', startHour: 18, endHour: 22 },
      { label: 'Late', startHour: 22, endHour: 24 },
    ])
  })

  it('exports the six ordered labels', () => {
    expect(DAYPART_LABELS).toEqual(['Overnight', 'Morning', 'Lunch', 'Afternoon', 'Evening', 'Late'])
  })

  it('maps each boundary hour to its half-open daypart index', () => {
    // Overnight [0,7)
    expect(daypartIndexForLondonHour(0)).toBe(0)
    expect(daypartIndexForLondonHour(6)).toBe(0)
    // Morning [7,12)
    expect(daypartIndexForLondonHour(7)).toBe(1)
    expect(daypartIndexForLondonHour(11)).toBe(1)
    // Lunch [12,15)
    expect(daypartIndexForLondonHour(12)).toBe(2)
    expect(daypartIndexForLondonHour(14)).toBe(2)
    // Afternoon [15,18)
    expect(daypartIndexForLondonHour(15)).toBe(3)
    expect(daypartIndexForLondonHour(17)).toBe(3)
    // Evening [18,22)
    expect(daypartIndexForLondonHour(18)).toBe(4)
    expect(daypartIndexForLondonHour(21)).toBe(4)
    // Late [22,24)
    expect(daypartIndexForLondonHour(22)).toBe(5)
    expect(daypartIndexForLondonHour(23)).toBe(5)
  })

  it('rejects an out-of-range hour', () => {
    expect(() => daypartIndexForLondonHour(-1)).toThrow()
    expect(() => daypartIndexForLondonHour(24)).toThrow()
  })
})

describe('londonDowMon0', () => {
  it('maps a known London Monday to 0', () => {
    // Mon 16 March 2026 12:00 London is GMT (before BST switch) -> same UTC date.
    expect(londonDowMon0(new Date('2026-03-16T12:00:00Z'))).toBe(0)
  })

  it('maps a known London Sunday to 6', () => {
    // Sun 15 March 2026 12:00 London -> 6 (Sun -> 6, NOT 0).
    expect(londonDowMon0(new Date('2026-03-15T12:00:00Z'))).toBe(6)
  })

  it('maps the full week Mon..Sun to 0..6 (Sat -> 5, Sun -> 6)', () => {
    // 16..22 March 2026 are Mon..Sun (GMT before the 29 Mar BST switch).
    expect(londonDowMon0(new Date('2026-03-16T12:00:00Z'))).toBe(0) // Mon
    expect(londonDowMon0(new Date('2026-03-17T12:00:00Z'))).toBe(1) // Tue
    expect(londonDowMon0(new Date('2026-03-18T12:00:00Z'))).toBe(2) // Wed
    expect(londonDowMon0(new Date('2026-03-19T12:00:00Z'))).toBe(3) // Thu
    expect(londonDowMon0(new Date('2026-03-20T12:00:00Z'))).toBe(4) // Fri
    expect(londonDowMon0(new Date('2026-03-21T12:00:00Z'))).toBe(5) // Sat
    expect(londonDowMon0(new Date('2026-03-22T12:00:00Z'))).toBe(6) // Sun
  })

  it('after-midnight London belongs to its actual London calendar day', () => {
    // 2026-07-13T23:30:00Z is 00:30 London on Tue 14 July 2026 (BST). Tuesday -> 1.
    expect(londonDowMon0(new Date('2026-07-13T23:30:00Z'))).toBe(1)
  })
})

/**
 * Branches PR-8 parity tests for lib/branches/openNow.ts.
 *
 * openNow is a CLIENT MIRROR of the backend src/api/shared/isOpenNow.ts: the
 * Europe/London open-now evaluation over a MULTI-WINDOW openingHours[]. These cases
 * mirror the backend's PR-8 behaviour exactly: iterate ALL of today's windows
 * (same-day + the pre-midnight portion of an overnight window) PLUS a yesterday-
 * spillover pass (the post-midnight tail of yesterday's overnight window). Half-open
 * intervals throughout.
 *
 * We pin times with explicit UTC instants and assert against the resulting
 * Europe/London wall-clock. London is on BST (UTC+1) on a June date, so a
 * 2026-06-23T11:30:00Z instant is 12:30 London (a Tuesday).
 */
import { openNow } from '../openNow'

type Row = {
  dayOfWeek: number
  openTime: string | null
  closeTime: string | null
  isClosed: boolean
}

// 2026-06-23 is a Tuesday (dayOfWeek 2). BST (UTC+1) is in force in June.
const TUE_1230_LONDON = new Date('2026-06-23T11:30:00.000Z') // 12:30 London, Tue
const TUE_0830_LONDON = new Date('2026-06-23T07:30:00.000Z') // 08:30 London, Tue
const TUE_1830_LONDON = new Date('2026-06-23T17:30:00.000Z') // 18:30 London, Tue
const TUE_1530_LONDON = new Date('2026-06-23T14:30:00.000Z') // 15:30 London, Tue
const TUE_2300_LONDON = new Date('2026-06-23T22:00:00.000Z') // 23:00 London, Tue
const TUE_0100_LONDON = new Date('2026-06-23T00:00:00.000Z') // 01:00 London, Tue (BST)

function week(rows: Partial<Row>[]): Row[] {
  // default a full closed week, then overlay the provided rows (multiple rows MAY
  // share a dayOfWeek under the multi-window model).
  const base: Row[] = Array.from({ length: 7 }, (_, dow) => ({
    dayOfWeek: dow,
    openTime: null,
    closeTime: null,
    isClosed: true,
  }))
  const out: Row[] = []
  const overridden = new Set(rows.map((r) => r.dayOfWeek))
  for (const b of base) {
    if (!overridden.has(b.dayOfWeek)) out.push(b)
  }
  for (const r of rows) {
    out.push({ dayOfWeek: 0, openTime: null, closeTime: null, isClosed: false, ...r } as Row)
  }
  return out
}

describe('openNow (parity with backend isOpenNow): single same-day window', () => {
  it("returns true when now is within today's open window (Europe/London)", () => {
    const hours = week([{ dayOfWeek: 2, isClosed: false, openTime: '09:00', closeTime: '17:00' }])
    expect(openNow(hours, TUE_1230_LONDON)).toBe(true)
  })

  it('returns false before opening time', () => {
    const hours = week([{ dayOfWeek: 2, isClosed: false, openTime: '09:00', closeTime: '17:00' }])
    expect(openNow(hours, TUE_0830_LONDON)).toBe(false)
  })

  it('returns false at/after closing time (closeTime is exclusive)', () => {
    const hours = week([{ dayOfWeek: 2, isClosed: false, openTime: '09:00', closeTime: '17:00' }])
    expect(openNow(hours, TUE_1830_LONDON)).toBe(false)
  })

  it('returns false on a Closed day', () => {
    const hours = week([{ dayOfWeek: 2, isClosed: true, openTime: null, closeTime: null }])
    expect(openNow(hours, TUE_1230_LONDON)).toBe(false)
  })

  it('returns false when there is no row for today', () => {
    const hours: Row[] = [{ dayOfWeek: 1, isClosed: false, openTime: '09:00', closeTime: '17:00' }]
    expect(openNow(hours, TUE_1230_LONDON)).toBe(false)
  })

  it('returns false when open/close times are missing on an open day', () => {
    const hours = week([{ dayOfWeek: 2, isClosed: false, openTime: null, closeTime: null }])
    expect(openNow(hours, TUE_1230_LONDON)).toBe(false)
  })

  it('returns false on an empty hours array', () => {
    expect(openNow([], TUE_1230_LONDON)).toBe(false)
  })

  it('treats a 24:00 end-of-day close as a same-day window (open until midnight)', () => {
    const hours = week([{ dayOfWeek: 2, isClosed: false, openTime: '09:00', closeTime: '24:00' }])
    expect(openNow(hours, TUE_2300_LONDON)).toBe(true)
  })
})

describe('openNow (PR-8): multiple windows in a day', () => {
  it('is OPEN in the SECOND window of a split day, CLOSED in the gap', () => {
    // Tuesday 09:00-14:00 + 17:00-23:00. 12:30 = window 1, 15:30 = gap, 18:30 = window 2.
    const hours = week([
      { dayOfWeek: 2, isClosed: false, openTime: '09:00', closeTime: '14:00' },
      { dayOfWeek: 2, isClosed: false, openTime: '17:00', closeTime: '23:00' },
    ])
    expect(openNow(hours, TUE_1230_LONDON)).toBe(true) // window 1
    expect(openNow(hours, TUE_1530_LONDON)).toBe(false) // lunch gap
    expect(openNow(hours, TUE_1830_LONDON)).toBe(true) // window 2
  })
})

describe('openNow (PR-8): overnight / cross-midnight', () => {
  it('reads OPEN in the PRE-midnight portion of TODAY\'s overnight window (close < open)', () => {
    // Tuesday 22:00 -> 02:00. At 23:00 Tuesday the pre-midnight portion is open.
    const hours = week([{ dayOfWeek: 2, isClosed: false, openTime: '22:00', closeTime: '02:00' }])
    expect(openNow(hours, TUE_2300_LONDON)).toBe(true)
  })

  it('reads OPEN in the POST-midnight tail via the YESTERDAY-spillover pass', () => {
    // Monday (dow 1) 22:00 -> 02:00 spills into Tuesday [00:00, 02:00). At 01:00 Tuesday
    // there is no Tuesday window, but the Monday overnight tail keeps it open.
    const hours = week([{ dayOfWeek: 1, isClosed: false, openTime: '22:00', closeTime: '02:00' }])
    expect(openNow(hours, TUE_0100_LONDON)).toBe(true)
  })

  it('reads CLOSED after the post-midnight tail ends', () => {
    // Monday 22:00 -> 02:00 spill ends at 02:00. At 12:30 Tuesday nothing is open.
    const hours = week([{ dayOfWeek: 1, isClosed: false, openTime: '22:00', closeTime: '02:00' }])
    expect(openNow(hours, TUE_1230_LONDON)).toBe(false)
  })

  it('reads CLOSED mid-afternoon for an evening-only overnight window', () => {
    // Tuesday 18:00 -> 02:00. At 12:30 Tuesday, before the window opens: closed.
    const hours = week([{ dayOfWeek: 2, isClosed: false, openTime: '18:00', closeTime: '02:00' }])
    expect(openNow(hours, TUE_1230_LONDON)).toBe(false)
  })
})

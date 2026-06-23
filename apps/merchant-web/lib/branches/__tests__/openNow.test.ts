/**
 * PR-1 F1 parity tests for lib/branches/openNow.ts.
 *
 * openNow is a CLIENT MIRROR of the backend src/api/shared/isOpenNow.ts: the
 * Europe/London open-now evaluation over a single-window-per-day openingHours[].
 * These cases mirror the backend's CURRENT behaviour exactly, including the
 * documented cross-midnight limitation (closeTime must be > openTime within the
 * same calendar day). Do NOT "fix" cross-midnight here: that is PR-8.
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

function week(rows: Partial<Row>[]): Row[] {
  // default a full closed week, then overlay the provided rows
  const base: Row[] = Array.from({ length: 7 }, (_, dow) => ({
    dayOfWeek: dow,
    openTime: null,
    closeTime: null,
    isClosed: true,
  }))
  for (const r of rows) {
    const i = base.findIndex((b) => b.dayOfWeek === r.dayOfWeek)
    if (i >= 0) base[i] = { ...base[i], ...r }
  }
  return base
}

describe('openNow (parity with backend isOpenNow)', () => {
  it('returns true when now is within today\'s open window (Europe/London)', () => {
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
    const hours = week([{ dayOfWeek: 2, isClosed: true }])
    expect(openNow(hours, TUE_1230_LONDON)).toBe(false)
  })

  it('returns false when there is no row for today', () => {
    // Only Monday defined; Tuesday absent entirely.
    const hours: Row[] = [{ dayOfWeek: 1, isClosed: false, openTime: '09:00', closeTime: '17:00' }]
    expect(openNow(hours, TUE_1230_LONDON)).toBe(false)
  })

  it('returns false when open/close times are missing on an open day', () => {
    const hours = week([{ dayOfWeek: 2, isClosed: false, openTime: null, closeTime: null }])
    expect(openNow(hours, TUE_1230_LONDON)).toBe(false)
  })

  it('mirrors the backend cross-midnight limitation: an overnight window (22:00->02:00) reads closed mid-evening (not fixed in PR-1)', () => {
    // openMins=1320, closeMins=120 → nowMins(750=12:30) >= 1320 is false → closed.
    // Backend has the same behaviour; PR-8 fixes cross-midnight, not here.
    const hours = week([{ dayOfWeek: 2, isClosed: false, openTime: '22:00', closeTime: '02:00' }])
    expect(openNow(hours, TUE_1230_LONDON)).toBe(false)
    // And even at 23:00 London the backend returns false (23:00 < 22:00 is false BUT
    // 23:00 >= 22:00 true && 23:00 < 02:00 false → closed). Mirror that exactly.
    const TUE_2300_LONDON = new Date('2026-06-23T22:00:00.000Z') // 23:00 London, Tue
    expect(openNow(hours, TUE_2300_LONDON)).toBe(false)
  })

  it('returns false on an empty hours array', () => {
    expect(openNow([], TUE_1230_LONDON)).toBe(false)
  })
})

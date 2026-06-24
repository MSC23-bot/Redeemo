import { describe, it, expect } from 'vitest'
import { isOpenNow, type Hours } from '../../../src/api/shared/isOpenNow'

describe('isOpenNow', () => {
  // Wednesday 15 April 2026 13:00:00 UTC = 14:00 BST (UTC+1). dayOfWeek = 3.
  const WED_2PM_BST = new Date('2026-04-15T13:00:00Z')

  const makeHours = (overrides: Partial<Hours>[]): Hours[] =>
    [0,1,2,3,4,5,6].map(day => ({
      dayOfWeek: day,
      openTime: '09:00',
      closeTime: '22:00',
      isClosed: false,
      ...overrides.find(o => o.dayOfWeek === day),
    }))

  it('returns true when within opening hours on current day', () => {
    const hours = makeHours([])
    expect(isOpenNow(hours, WED_2PM_BST)).toBe(true)
  })

  it('returns false when day is marked isClosed', () => {
    // Wednesday = dayOfWeek 3
    const hours = makeHours([{ dayOfWeek: 3, isClosed: true, openTime: null, closeTime: null }])
    expect(isOpenNow(hours, WED_2PM_BST)).toBe(false)
  })

  it('returns false when current time is before openTime', () => {
    // Now is 14:00 BST, open at 15:00
    const hours = makeHours([{ dayOfWeek: 3, openTime: '15:00', closeTime: '22:00', isClosed: false }])
    expect(isOpenNow(hours, WED_2PM_BST)).toBe(false)
  })

  it('returns false when current time is after closeTime', () => {
    // Now is 14:00 BST, closes at 13:00
    const hours = makeHours([{ dayOfWeek: 3, openTime: '09:00', closeTime: '13:00', isClosed: false }])
    expect(isOpenNow(hours, WED_2PM_BST)).toBe(false)
  })

  it('returns false when hours array is empty', () => {
    expect(isOpenNow([], WED_2PM_BST)).toBe(false)
  })

  it('returns false when openTime or closeTime is null and isClosed is false', () => {
    const hours = makeHours([{ dayOfWeek: 3, openTime: null, closeTime: null, isClosed: false }])
    expect(isOpenNow(hours, WED_2PM_BST)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Branches PR-8 (umbrella D9): multi-window + cross-midnight semantics. These pin
// the D9 fix — the prior isOpenNow read ONLY today's single row on a half-open
// same-day interval, so an overnight window (close < open) read perpetually CLOSED
// and the post-midnight tail of yesterday's overnight window was never reported
// open.
// ─────────────────────────────────────────────────────────────────────────────
describe('isOpenNow — PR-8 multi-window + cross-midnight', () => {
  // A single Wednesday window of interest; other days closed so we test ONLY
  // the day we care about.
  const onlyDay = (dayOfWeek: number, windows: Array<{ openTime: string; closeTime: string }>): Hours[] => {
    const rows: Hours[] = []
    for (let d = 0; d <= 6; d++) {
      if (d === dayOfWeek) {
        for (const w of windows) {
          rows.push({ dayOfWeek: d, openTime: w.openTime, closeTime: w.closeTime, isClosed: false })
        }
      } else {
        rows.push({ dayOfWeek: d, openTime: null, closeTime: null, isClosed: true })
      }
    }
    return rows
  }

  describe('multiple windows in a single day', () => {
    // Wednesday 14:00 BST. dayOfWeek = 3. Two windows: 09:00-12:00 (closed by 14:00)
    // and 13:00-23:00 (open at 14:00). The SECOND window is the open one.
    const WED_2PM_BST = new Date('2026-04-15T13:00:00Z')

    it('returns true when now falls in the SECOND window of the day', () => {
      const hours = onlyDay(3, [
        { openTime: '09:00', closeTime: '12:00' },
        { openTime: '13:00', closeTime: '23:00' },
      ])
      expect(isOpenNow(hours, WED_2PM_BST)).toBe(true)
    })

    it('returns false when now falls in the GAP between two windows', () => {
      // 12:00-13:00 is a closed gap; 14:00 is past it but inside the 2nd window, so
      // pick a time inside the gap: 12:30 BST = 11:30 UTC.
      const WED_1230_BST = new Date('2026-04-15T11:30:00Z')
      const hours = onlyDay(3, [
        { openTime: '09:00', closeTime: '12:00' },
        { openTime: '13:00', closeTime: '23:00' },
      ])
      expect(isOpenNow(hours, WED_1230_BST)).toBe(false)
    })
  })

  describe('overnight window (close < open)', () => {
    // Friday overnight 22:00 -> 02:00. The PRE-midnight portion is on Friday; the
    // POST-midnight tail is on Saturday (reported by the yesterday-spillover pass).
    const overnightFri = onlyDay(5, [{ openTime: '22:00', closeTime: '02:00' }])

    it('returns true in the PRE-midnight portion (today\'s overnight row)', () => {
      // Friday 23:30 BST = 22:30 UTC, dayOfWeek = 5.
      const FRI_2330_BST = new Date('2026-06-26T22:30:00Z')
      expect(isOpenNow(overnightFri, FRI_2330_BST)).toBe(true)
    })

    it('returns true in the POST-midnight tail (yesterday-spillover pass)', () => {
      // Saturday 01:00 BST = 00:00 UTC, dayOfWeek = 6. Yesterday (Friday) overnight
      // 22:00-02:00 spills into Saturday [00:00, 02:00); 01:00 is inside it.
      const SAT_0100_BST = new Date('2026-06-27T00:00:00Z')
      expect(isOpenNow(overnightFri, SAT_0100_BST)).toBe(true)
    })

    it('returns false on Saturday AFTER the spill tail closes (02:30 > 02:00)', () => {
      // Saturday 02:30 BST = 01:30 UTC, dayOfWeek = 6.
      const SAT_0230_BST = new Date('2026-06-27T01:30:00Z')
      expect(isOpenNow(overnightFri, SAT_0230_BST)).toBe(false)
    })

    it('returns false on Friday BEFORE the overnight window opens (21:30 < 22:00)', () => {
      // Friday 21:30 BST = 20:30 UTC, dayOfWeek = 5.
      const FRI_2130_BST = new Date('2026-06-26T20:30:00Z')
      expect(isOpenNow(overnightFri, FRI_2130_BST)).toBe(false)
    })
  })

  describe('24:00 end-of-day boundary', () => {
    const open24hWed = onlyDay(3, [{ openTime: '00:00', closeTime: '24:00' }])

    it('returns true just before midnight with a 24:00 close (Open 24h)', () => {
      // Wednesday 23:59 BST = 22:59 UTC, dayOfWeek = 3.
      const WED_2359_BST = new Date('2026-04-15T22:59:00Z')
      expect(isOpenNow(open24hWed, WED_2359_BST)).toBe(true)
    })

    it('returns true right at the start of an Open-24h day', () => {
      // Wednesday 00:10 BST = Tuesday 23:10 UTC. dayOfWeek (London) = 3.
      const WED_0010_BST = new Date('2026-04-14T23:10:00Z')
      expect(isOpenNow(open24hWed, WED_0010_BST)).toBe(true)
    })
  })

  describe('Europe/London correctness (BST + GMT instants)', () => {
    // A branch open 09:00-17:00 every day.
    const nineToFive = [0,1,2,3,4,5,6].map((d) => ({
      dayOfWeek: d, openTime: '09:00', closeTime: '17:00', isClosed: false,
    }))

    it('BST: 15:30 UTC = 16:30 BST is OPEN (within 09:00-17:00 London)', () => {
      // 15 July 2026 (BST, UTC+1). 15:30 UTC -> 16:30 BST.
      expect(isOpenNow(nineToFive, new Date('2026-07-15T15:30:00Z'))).toBe(true)
    })

    it('BST: 16:30 UTC = 17:30 BST is CLOSED (past the 17:00 London close)', () => {
      expect(isOpenNow(nineToFive, new Date('2026-07-15T16:30:00Z'))).toBe(false)
    })

    it('GMT: 10:00 UTC = 10:00 GMT is OPEN (winter, no offset)', () => {
      // 15 January 2026 (GMT, UTC+0). 10:00 UTC -> 10:00 GMT.
      expect(isOpenNow(nineToFive, new Date('2026-01-15T10:00:00Z'))).toBe(true)
    })

    it('GMT: 08:30 UTC = 08:30 GMT is CLOSED (before the 09:00 London open)', () => {
      expect(isOpenNow(nineToFive, new Date('2026-01-15T08:30:00Z'))).toBe(false)
    })
  })

  // The favourites `isOpen` sort key (src/api/customer/favourites/service.ts:159
  // / :580) sorts open branches AHEAD of closed ones via `a.isOpen !== b.isOpen`.
  // It derives `isOpen` from this same isOpenNow producer, so the PR-8 fix flips a
  // previously-always-closed overnight branch to OPEN inside its window — it now
  // floats UP. This pins that intended correctness shift at the producer level (the
  // service ordering itself is covered by the real-DB favourites integration suite).
  describe('favourites ordering shift — an overnight branch now reads OPEN (intended PR-8 fix)', () => {
    const overnightFri = [0,1,2,3,4,5,6].map((d) =>
      d === 5
        ? { dayOfWeek: d, openTime: '22:00', closeTime: '02:00', isClosed: false }
        : { dayOfWeek: d, openTime: null, closeTime: null, isClosed: true },
    )

    it('inside the overnight window the sort key is OPEN (would have been CLOSED pre-PR-8)', () => {
      // Friday 23:30 BST = 22:30 UTC. Pre-PR-8 this read CLOSED (half-open same-day
      // interval was empty because close 02:00 < open 22:00); now it reads OPEN.
      const FRI_2330_BST = new Date('2026-06-26T22:30:00Z')
      expect(isOpenNow(overnightFri, FRI_2330_BST)).toBe(true)
    })
  })
})

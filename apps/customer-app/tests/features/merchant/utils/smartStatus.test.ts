import { smartStatus } from '@/features/merchant/utils/smartStatus'
import type { OpeningHourEntry } from '@/lib/api/merchant'

// Helper: build a fixed Date pinned to a specific day-of-week + hh:mm.
// Uses local-time construction so getDay()/getHours()/getMinutes() return
// the expected values regardless of the host machine's timezone.
// 2026-05-04 is a Monday (dayOfWeek=1) in JS getDay() terms.
function dt(dayOfWeek: number, hh: number, mm: number): Date {
  // Use a known week of May 2026: 2026-05-03 = Sun (0), 2026-05-04 = Mon (1), etc.
  const day = 3 + dayOfWeek  // May 3 + dayOfWeek → local calendar date
  // new Date(year, month0, day, hh, mm) uses LOCAL time — getDay/getHours/getMinutes work correctly.
  return new Date(2026, 4, day, hh, mm, 0, 0)
}

const open9to17: OpeningHourEntry = { dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isClosed: false }

describe('smartStatus', () => {
  describe('Open state (>60 min until close)', () => {
    it('returns "Closes at H:MMam/pm" when more than 60 min remain', () => {
      const hours: OpeningHourEntry[] = [{ ...open9to17, dayOfWeek: 1, openTime: '09:00', closeTime: '22:30' }]
      const result = smartStatus(true, hours, dt(1, 18, 0))  // Mon 18:00, closes 22:30 — 4h30m left
      expect(result.pillState).toBe('open')
      expect(result.pillLabel).toBe('Open')
      expect(result.statusText).toBe('Closes at 10:30pm')
    })
  })

  describe('Closing soon state (≤60 min until close)', () => {
    it('returns "Closes in N min" when 30 min remain', () => {
      const hours: OpeningHourEntry[] = [{ ...open9to17, dayOfWeek: 1, openTime: '09:00', closeTime: '22:30' }]
      const result = smartStatus(true, hours, dt(1, 22, 0))  // Mon 22:00, closes 22:30 — 30m
      expect(result.pillState).toBe('closing-soon')
      expect(result.pillLabel).toBe('Closing soon')
      expect(result.statusText).toBe('Closes in 30 min')
    })

    it('uses singular "1 min" at 1 min remaining', () => {
      const hours: OpeningHourEntry[] = [{ ...open9to17, dayOfWeek: 1, closeTime: '22:30' }]
      const result = smartStatus(true, hours, dt(1, 22, 29))  // 1m left
      expect(result.statusText).toBe('Closes in 1 min')
    })

    it('60 min boundary uses "Closes in 60 min" countdown (not "Closes at")', () => {
      const hours: OpeningHourEntry[] = [{ ...open9to17, dayOfWeek: 1, closeTime: '22:30' }]
      const result = smartStatus(true, hours, dt(1, 21, 30))  // exactly 60m
      expect(result.pillState).toBe('closing-soon')
      expect(result.statusText).toBe('Closes in 60 min')
    })
  })

  describe('Closed — next open is later TODAY (split-hours mid-day gap)', () => {
    it('returns "Opens at H:MMam/pm" when later same-day open exists', () => {
      // Single-interval seed (12-22:30 on Mon). At 15:00 Mon. Same-interval —
      // `isOpenNow` would actually be true; for this test we override to false
      // simulating a split-hours data shape (where backend statusText would
      // give the right answer; frontend stopgap reads what's available).
      const hours: OpeningHourEntry[] = [{ dayOfWeek: 1, openTime: '17:00', closeTime: '22:30', isClosed: false }]
      const result = smartStatus(false, hours, dt(1, 15, 0))
      expect(result.pillState).toBe('closed')
      expect(result.pillLabel).toBe('Closed')
      expect(result.statusText).toBe('Opens at 5:00pm')
    })
  })

  describe('Closed — next open is TOMORROW', () => {
    it('returns "Opens tomorrow at H:MMam/pm" when tomorrow opens', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 1, openTime: null, closeTime: null, isClosed: true },   // Mon closed
        { dayOfWeek: 2, openTime: '09:00', closeTime: '17:00', isClosed: false }, // Tue 9-17
      ]
      const result = smartStatus(false, hours, dt(1, 15, 0))  // Mon 15:00
      expect(result.pillState).toBe('closed')
      expect(result.statusText).toBe('Opens tomorrow at 9:00am')
    })
  })

  describe('Closed — next open is AFTER tomorrow (multi-day closed)', () => {
    it('returns "Opens at H:MMam/pm" with NO day reference when next open is later than tomorrow', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 1, openTime: null, closeTime: null, isClosed: true },   // Mon closed
        { dayOfWeek: 2, openTime: null, closeTime: null, isClosed: true },   // Tue closed
        { dayOfWeek: 3, openTime: '09:00', closeTime: '17:00', isClosed: false }, // Wed 9-17
      ]
      const result = smartStatus(false, hours, dt(1, 15, 0))  // Mon 15:00, opens Wed
      expect(result.pillState).toBe('closed')
      expect(result.statusText).toBe('Opens at 9:00am')
    })
  })

  describe('Defensive rules (§9)', () => {
    it('Open + closeTime null → "Hours unavailable"', () => {
      const hours: OpeningHourEntry[] = [{ dayOfWeek: 1, openTime: '09:00', closeTime: null, isClosed: false }]
      const result = smartStatus(true, hours, dt(1, 12, 0))
      expect(result.pillState).toBe('open')
      expect(result.pillLabel).toBe('Open')
      expect(result.statusText).toBe('Hours unavailable')
    })

    it('Closed + tomorrow openTime null → "Opens tomorrow" without time', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 1, openTime: null, closeTime: null, isClosed: true },
        { dayOfWeek: 2, openTime: null, closeTime: '17:00', isClosed: false },  // ← openTime missing
      ]
      const result = smartStatus(false, hours, dt(1, 12, 0))
      expect(result.statusText).toBe('Opens tomorrow')
    })

    it('Closed + openingHours: [] → "Hours unavailable"', () => {
      const result = smartStatus(false, [], dt(1, 12, 0))
      expect(result.pillState).toBe('closed')
      expect(result.statusText).toBe('Hours unavailable')
    })

    it('Open + openingHours: [] → "Hours unavailable"', () => {
      const result = smartStatus(true, [], dt(1, 12, 0))
      expect(result.pillState).toBe('open')
      expect(result.statusText).toBe('Hours unavailable')
    })

    it('Closed + entire week closed → "Hours unavailable"', () => {
      const hours: OpeningHourEntry[] = Array.from({ length: 7 }, (_, i) => ({
        dayOfWeek: i, openTime: null, closeTime: null, isClosed: true,
      }))
      const result = smartStatus(false, hours, dt(1, 12, 0))
      expect(result.statusText).toBe('Hours unavailable')
    })
  })
})

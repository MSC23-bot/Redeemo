import { smartStatus } from '@/features/merchant/utils/smartStatus'
import type { OpeningHourEntry } from '@/lib/api/merchant'

// 2026-05-05 QA fix: smartStatus must use Europe/London-local day/time, not
// device-local. These tests construct Dates as explicit UTC instants (via
// `Date.UTC(...)`) so they're timezone-independent — the test result is the
// same whether Jest runs on UTC, London, Qatar, or anywhere else.
//
// May 2026 falls in BST (Europe/London = UTC+1). To target London hh:mm on a
// given dayOfWeek, build a UTC instant 1 hour earlier on the same calendar
// date. 2026-05-03 = Sunday, so day index 0 = May 3, 1 = May 4, etc.
function london(dayOfWeek: number, hh: number, mm: number): Date {
  const day = 3 + dayOfWeek
  // UTC = London − 1h (BST). Date.UTC handles negative hours by rolling over.
  return new Date(Date.UTC(2026, 4, day, hh - 1, mm, 0, 0))
}

const open9to17: OpeningHourEntry = { dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isClosed: false }

describe('smartStatus', () => {
  describe('Open state (>60 min until close)', () => {
    it('returns "Closes at H:MMam/pm" when more than 60 min remain', () => {
      const hours: OpeningHourEntry[] = [{ ...open9to17, dayOfWeek: 1, openTime: '09:00', closeTime: '22:30' }]
      const result = smartStatus(true, hours, london(1, 18, 0))  // London Mon 18:00, closes 22:30
      expect(result.pillState).toBe('open')
      expect(result.pillLabel).toBe('Open')
      expect(result.statusText).toBe('Closes at 10:30pm')
    })
  })

  describe('Closing soon state (≤60 min until close)', () => {
    it('returns "Closes in N min" when 30 min remain', () => {
      const hours: OpeningHourEntry[] = [{ ...open9to17, dayOfWeek: 1, openTime: '09:00', closeTime: '22:30' }]
      const result = smartStatus(true, hours, london(1, 22, 0))  // London Mon 22:00, closes 22:30
      expect(result.pillState).toBe('closing-soon')
      expect(result.pillLabel).toBe('Closing soon')
      expect(result.statusText).toBe('Closes in 30 min')
    })

    it('uses singular "1 min" at 1 min remaining', () => {
      const hours: OpeningHourEntry[] = [{ ...open9to17, dayOfWeek: 1, closeTime: '22:30' }]
      const result = smartStatus(true, hours, london(1, 22, 29))
      expect(result.statusText).toBe('Closes in 1 min')
    })

    it('60 min boundary uses "Closes in 60 min" countdown (not "Closes at")', () => {
      const hours: OpeningHourEntry[] = [{ ...open9to17, dayOfWeek: 1, closeTime: '22:30' }]
      const result = smartStatus(true, hours, london(1, 21, 30))
      expect(result.pillState).toBe('closing-soon')
      expect(result.statusText).toBe('Closes in 60 min')
    })
  })

  describe('Closed — next open is later TODAY (split-hours mid-day gap)', () => {
    it('returns "Opens at H:MMam/pm" when later same-day open exists', () => {
      const hours: OpeningHourEntry[] = [{ dayOfWeek: 1, openTime: '17:00', closeTime: '22:30', isClosed: false }]
      const result = smartStatus(false, hours, london(1, 15, 0))
      expect(result.pillState).toBe('closed')
      expect(result.pillLabel).toBe('Closed')
      expect(result.statusText).toBe('Opens at 5:00pm')
    })
  })

  describe('Closed — next open is TOMORROW', () => {
    it('returns "Opens tomorrow at H:MMam/pm" when tomorrow opens', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 1, openTime: null, closeTime: null, isClosed: true },
        { dayOfWeek: 2, openTime: '09:00', closeTime: '17:00', isClosed: false },
      ]
      const result = smartStatus(false, hours, london(1, 15, 0))
      expect(result.pillState).toBe('closed')
      expect(result.statusText).toBe('Opens tomorrow at 9:00am')
    })
  })

  describe('Closed — next open is AFTER tomorrow (multi-day closed)', () => {
    it('returns "Opens at H:MMam/pm" with NO day reference when next open is later than tomorrow', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 1, openTime: null, closeTime: null, isClosed: true },
        { dayOfWeek: 2, openTime: null, closeTime: null, isClosed: true },
        { dayOfWeek: 3, openTime: '09:00', closeTime: '17:00', isClosed: false },
      ]
      const result = smartStatus(false, hours, london(1, 15, 0))
      expect(result.pillState).toBe('closed')
      expect(result.statusText).toBe('Opens at 9:00am')
    })
  })

  describe('Defensive rules (§9)', () => {
    it('Open + closeTime null → "Hours unavailable"', () => {
      const hours: OpeningHourEntry[] = [{ dayOfWeek: 1, openTime: '09:00', closeTime: null, isClosed: false }]
      const result = smartStatus(true, hours, london(1, 12, 0))
      expect(result.pillState).toBe('open')
      expect(result.pillLabel).toBe('Open')
      expect(result.statusText).toBe('Hours unavailable')
    })

    it('Closed + tomorrow openTime null → "Opens tomorrow" without time', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 1, openTime: null, closeTime: null, isClosed: true },
        { dayOfWeek: 2, openTime: null, closeTime: '17:00', isClosed: false },
      ]
      const result = smartStatus(false, hours, london(1, 12, 0))
      expect(result.statusText).toBe('Opens tomorrow')
    })

    it('Closed + openingHours: [] → "Hours unavailable"', () => {
      const result = smartStatus(false, [], london(1, 12, 0))
      expect(result.pillState).toBe('closed')
      expect(result.statusText).toBe('Hours unavailable')
    })

    it('Open + openingHours: [] → "Hours unavailable"', () => {
      const result = smartStatus(true, [], london(1, 12, 0))
      expect(result.pillState).toBe('open')
      expect(result.statusText).toBe('Hours unavailable')
    })

    it('Closed + entire week closed → "Hours unavailable"', () => {
      const hours: OpeningHourEntry[] = Array.from({ length: 7 }, (_, i) => ({
        dayOfWeek: i, openTime: null, closeTime: null, isClosed: true,
      }))
      const result = smartStatus(false, hours, london(1, 12, 0))
      expect(result.statusText).toBe('Hours unavailable')
    })
  })

  // 2026-05-05 QA regression: smartStatus must use Europe/London-local day &
  // time, not the device's local timezone. Pre-fix, smartStatus called
  // `now.getDay()` and `now.getHours() * 60 + now.getMinutes()` — those read
  // the host machine's wall-clock. On a Qatar device (UTC+3), the day and
  // minutes diverged from London, especially around midnight boundaries.
  //
  // These tests pin a Date to a UTC instant where Europe/London and a
  // non-London zone fall on different sides of a day boundary. The
  // expected behaviour is London's day; the alternative result that a
  // non-London read would produce is asserted to NOT appear.
  describe('Europe/London regression (TZ-boundary)', () => {
    it('uses London time when a UTC instant lands past midnight in London but not in UTC', () => {
      // 2026-05-04 23:30 UTC → London Tue 00:30 BST (May 5), UTC Mon 23:30.
      //
      // Hours config:
      //   Mon: closed, Tue: 09:00–17:00.
      //
      // Behaviour by interpretation:
      //   London (Tue 00:30): closed, today's offset 0 → 'Opens at 9:00am'.
      //   UTC    (Mon 23:30): closed, tomorrow → 'Opens tomorrow at 9:00am'.
      //
      // Asserting 'Opens at 9:00am' proves smartStatus reads London — a UTC
      // (or any-non-London) read would produce the 'tomorrow' variant.
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 1, openTime: null, closeTime: null, isClosed: true },
        { dayOfWeek: 2, openTime: '09:00', closeTime: '17:00', isClosed: false },
      ]
      const utcInstant = new Date(Date.UTC(2026, 4, 4, 23, 30))
      const result = smartStatus(false, hours, utcInstant)
      expect(result.statusText).toBe('Opens at 9:00am')
      expect(result.statusText).not.toBe('Opens tomorrow at 9:00am')
    })

    it('uses London time when a UTC instant lands before midnight in London but not in Qatar', () => {
      // 2026-05-04 22:00 UTC → London Mon 23:00 BST, Qatar Tue 01:00 (UTC+3).
      //
      // Hours config:
      //   Mon: 09:00–23:30 (still open until 23:30 London),
      //   Tue: 10:00–22:00.
      //
      // Behaviour by interpretation:
      //   London (Mon 23:00): open, 30 min until close → 'Closes in 30 min'.
      //   Qatar  (Tue 01:00): closed (before Tue 10:00 open).
      //
      // Asserting 'Closes in 30 min' proves London is used.
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 1, openTime: '09:00', closeTime: '23:30', isClosed: false },
        { dayOfWeek: 2, openTime: '10:00', closeTime: '22:00', isClosed: false },
      ]
      const utcInstant = new Date(Date.UTC(2026, 4, 4, 22, 0))
      const result = smartStatus(true, hours, utcInstant)
      expect(result.pillState).toBe('closing-soon')
      expect(result.statusText).toBe('Closes in 30 min')
    })

    it('selects the correct day-of-week entry from hours[] using London (not host) day', () => {
      // 2026-05-04 23:30 UTC → London Tue 00:30, UTC Mon 23:30.
      //
      // Two entries with different close times — proves which day is used:
      //   Mon: closes 22:00. Tue: closes 18:00.
      //
      // London (Tue 00:30): isOpen=true (passed in)
      //   → reads Tue entry → 'Closes at 6:00pm'.
      // Non-London read (Mon): would read Mon entry → 'Closes at 10:00pm'.
      //
      // Asserting 6:00pm proves Tuesday's entry is selected.
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 1, openTime: '09:00', closeTime: '22:00', isClosed: false },
        { dayOfWeek: 2, openTime: '00:00', closeTime: '18:00', isClosed: false },
      ]
      const utcInstant = new Date(Date.UTC(2026, 4, 4, 23, 30))
      const result = smartStatus(true, hours, utcInstant)
      expect(result.statusText).toBe('Closes at 6:00pm')
    })
  })
})

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

    // PR-8 (multi-row model): an open day is defined as N rows with BOTH
    // times present. A non-closed row with a null openTime is now malformed
    // and is dropped by the window grouping (it can't be presented as an
    // "Opens at"/"Opens tomorrow" anchor without an open time). With no
    // well-formed upcoming window anywhere in the week the honest fallback is
    // "Hours unavailable" rather than the prior time-less "Opens tomorrow"
    // guess. (Pre-PR-8 the single-row code surfaced "Opens tomorrow" with no
    // time; that path only ever arose from malformed data.)
    it('Closed + tomorrow openTime null (malformed open row) → "Hours unavailable"', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 1, openTime: null, closeTime: null, isClosed: true },
        { dayOfWeek: 2, openTime: null, closeTime: '17:00', isClosed: false },
      ]
      const result = smartStatus(false, hours, london(1, 12, 0))
      expect(result.statusText).toBe('Hours unavailable')
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

  // ── Branches PR-8 (umbrella D9): multi-window + cross-midnight ────────────
  // None of these existed pre-PR-8. smartStatus is now MULTI-WINDOW + CROSS-
  // MIDNIGHT aware in lockstep with the backend `isOpenNow` rewrite. The
  // `isOpenNow` boolean passed in mirrors what the server would return.
  describe('PR-8 — multiple windows in a day', () => {
    // Mon: 09:00-14:00 then 17:00-23:00 (a mid-day gap).
    const splitMon: OpeningHourEntry[] = [
      { dayOfWeek: 1, openTime: '09:00', closeTime: '14:00', isClosed: false },
      { dayOfWeek: 1, openTime: '17:00', closeTime: '23:00', isClosed: false },
    ]

    it('references the FIRST window close when open in the morning window', () => {
      // London Mon 11:00 → inside 09:00-14:00, closes 14:00.
      const result = smartStatus(true, splitMon, london(1, 11, 0))
      expect(result.pillState).toBe('open')
      expect(result.statusText).toBe('Closes at 2:00pm')
    })

    it('references the SECOND window close when open in the evening window', () => {
      // London Mon 18:00 → inside 17:00-23:00, closes 23:00.
      const result = smartStatus(true, splitMon, london(1, 18, 0))
      expect(result.pillState).toBe('open')
      expect(result.statusText).toBe('Closes at 11:00pm')
    })

    it('in the mid-day gap reports "Opens at" the SECOND window', () => {
      // London Mon 15:30 → between windows; isOpenNow=false.
      const result = smartStatus(false, splitMon, london(1, 15, 30))
      expect(result.pillState).toBe('closed')
      expect(result.statusText).toBe('Opens at 5:00pm')
    })

    it('"Closes in N min" references the ACTIVE (second) window', () => {
      // London Mon 22:30 → inside 17:00-23:00, 30 min until 23:00.
      const result = smartStatus(true, splitMon, london(1, 22, 30))
      expect(result.pillState).toBe('closing-soon')
      expect(result.statusText).toBe('Closes in 30 min')
    })
  })

  describe('PR-8 — overnight window (close < open) crosses midnight', () => {
    // Mon overnight: 18:00-02:00 (6pm to 2am Tue). Tue + Wed closed so the
    // "next open" search has a clean target.
    const overnightMon: OpeningHourEntry[] = [
      { dayOfWeek: 1, openTime: '18:00', closeTime: '02:00', isClosed: false },
      { dayOfWeek: 2, openTime: null, closeTime: null, isClosed: true },
      { dayOfWeek: 3, openTime: '10:00', closeTime: '16:00', isClosed: false },
    ]

    it('reads OPEN in the pre-midnight portion (today\'s overnight row)', () => {
      // London Mon 20:00 → inside the pre-midnight portion [18:00, 24:00).
      // Close lands at 02:00 NEXT day → (1440-1200)+120 = 360 min away → "Closes at".
      const result = smartStatus(true, overnightMon, london(1, 20, 0))
      expect(result.pillState).toBe('open')
      expect(result.statusText).toBe('Closes at 2:00am')
    })

    it('reads OPEN in the post-midnight tail (yesterday-spillover)', () => {
      // London Tue 01:00 → in the spilled tail [00:00, 02:00) from Monday's
      // overnight window. 60 min until 02:00 close.
      const result = smartStatus(true, overnightMon, london(2, 1, 0))
      expect(result.pillState).toBe('closing-soon')
      expect(result.statusText).toBe('Closes in 60 min')
    })

    it('post-midnight tail well before close reports "Closes at"', () => {
      // Re-shape so the tail is long: Mon 22:00-05:00 overnight. Tue 02:00 →
      // 180 min until 05:00 close.
      const longTail: OpeningHourEntry[] = [
        { dayOfWeek: 1, openTime: '22:00', closeTime: '05:00', isClosed: false },
        { dayOfWeek: 2, openTime: null, closeTime: null, isClosed: true },
      ]
      const result = smartStatus(true, longTail, london(2, 2, 0))
      expect(result.pillState).toBe('open')
      expect(result.statusText).toBe('Closes at 5:00am')
    })

    it('after the post-midnight tail ends, reports closed + next open', () => {
      // London Tue 03:00 → past the 02:00 tail close; Tue is closed; next open
      // is Wed 10:00. Tue is dayOffset 0 with no later window → Wed offset 1.
      const result = smartStatus(false, overnightMon, london(2, 3, 0))
      expect(result.pillState).toBe('closed')
      expect(result.statusText).toBe('Opens tomorrow at 10:00am')
    })
  })

  describe('PR-8 — 24:00 end-of-day close', () => {
    it('"Closes at midnight" for a 24:00 close', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 1, openTime: '09:00', closeTime: '24:00', isClosed: false },
      ]
      // London Mon 20:00 → open, closes 24:00 (end of day). > 60 min away.
      const result = smartStatus(true, hours, london(1, 20, 0))
      expect(result.pillState).toBe('open')
      expect(result.statusText).toBe('Closes at midnight')
    })

    it('"Closes in N min" near a 24:00 close', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 1, openTime: '09:00', closeTime: '24:00', isClosed: false },
      ]
      // London Mon 23:30 → 30 min until the 24:00 (1440) close.
      const result = smartStatus(true, hours, london(1, 23, 30))
      expect(result.pillState).toBe('closing-soon')
      expect(result.statusText).toBe('Closes in 30 min')
    })
  })

  describe('PR-8 — single-window regression (the common case is unchanged)', () => {
    // A plain single-window-per-day merchant must evaluate exactly as before.
    const single9to17: OpeningHourEntry[] = [
      { dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isClosed: false },
    ]
    it('open mid-window → "Closes at 5:00pm"', () => {
      const result = smartStatus(true, single9to17, london(1, 12, 0))
      expect(result.pillState).toBe('open')
      expect(result.statusText).toBe('Closes at 5:00pm')
    })
    it('before open → "Opens at 9:00am"', () => {
      const result = smartStatus(false, single9to17, london(1, 7, 0))
      expect(result.pillState).toBe('closed')
      expect(result.statusText).toBe('Opens at 9:00am')
    })
  })
})

import { getLondonClock } from '@/features/merchant/utils/londonNow'

// Direct unit tests for the Europe/London clock helper used by
// `useOpenStatus` and `smartStatus`. Tests use `Date.UTC(...)` so they
// stay timezone-independent — the assertion is the same whether Jest
// runs on UTC, London, Qatar, or any other host TZ.
describe('getLondonClock', () => {
  describe('Day-of-week (Europe/London) — known calendar dates', () => {
    // 2026-05-03 = Sunday (London)
    // 2026-05-04 = Monday (London)
    // 2026-05-05 = Tuesday (London)
    // 2026-05-06 = Wednesday (London)
    // 2026-05-07 = Thursday (London)
    // 2026-05-08 = Friday (London)
    // 2026-05-09 = Saturday (London)
    // All within BST (UTC+1).
    it.each([
      [0, '2026-05-03', 'Sunday'   ],
      [1, '2026-05-04', 'Monday'   ],
      [2, '2026-05-05', 'Tuesday'  ],
      [3, '2026-05-06', 'Wednesday'],
      [4, '2026-05-07', 'Thursday' ],
      [5, '2026-05-08', 'Friday'   ],
      [6, '2026-05-09', 'Saturday' ],
    ])('dow=%i for %s (%s) at London 12:00', (expectedDow, dateStr) => {
      // London 12:00 → UTC 11:00 (BST = UTC+1)
      const [yyyy, mm, dd] = dateStr.split('-').map(Number)
      const utc = new Date(Date.UTC(yyyy!, mm! - 1, dd!, 11, 0))
      expect(getLondonClock(utc).dow).toBe(expectedDow)
    })
  })

  describe('Minutes-since-midnight (Europe/London)', () => {
    it('returns 0 for London 00:00 (UTC 23:00 previous day during BST)', () => {
      // 2026-05-04 23:00 UTC = London 00:00 BST on May 5 (Tue)
      const utc = new Date(Date.UTC(2026, 4, 4, 23, 0))
      expect(getLondonClock(utc).minutes).toBe(0)
    })

    it('returns 720 (12:00) for London noon during BST', () => {
      const utc = new Date(Date.UTC(2026, 4, 5, 11, 0))   // 11:00 UTC = 12:00 London BST
      expect(getLondonClock(utc).minutes).toBe(720)
    })

    it('returns 1439 (23:59) for London late evening during BST', () => {
      const utc = new Date(Date.UTC(2026, 4, 5, 22, 59))
      expect(getLondonClock(utc).minutes).toBe(23 * 60 + 59)
    })
  })

  describe('Timezone-boundary regressions', () => {
    it('returns London Tuesday for Qatar Tuesday early-morning UTC instant', () => {
      // 2026-05-04 22:30 UTC = London Mon 23:30 BST = Qatar Tue 01:30 (UTC+3).
      // London is still on Monday at this UTC instant.
      const utc = new Date(Date.UTC(2026, 4, 4, 22, 30))
      const clock = getLondonClock(utc)
      expect(clock.dow).toBe(1)            // Monday in London
      expect(clock.minutes).toBe(23 * 60 + 30)  // 23:30 London
    })

    it('returns London Tuesday for an instant past London midnight on Tue 2026-05-05', () => {
      // 2026-05-04 23:30 UTC → London Tue 00:30 BST (May 5).
      // UTC is still Monday at this instant.
      // The reported on-device symptom: TODAY badge stuck on Sunday on
      // Tue 2026-05-05. After this fix the helper resolves to Tue (2)
      // regardless of what the host engine's CLDR data thinks of "Tue".
      const utc = new Date(Date.UTC(2026, 4, 4, 23, 30))
      const clock = getLondonClock(utc)
      expect(clock.dow).toBe(2)            // Tuesday in London
      expect(clock.minutes).toBe(30)       // 00:30 London
    })

    it('handles GMT (winter) — London = UTC offset 0', () => {
      // 2026-12-15 12:00 UTC = London 12:00 GMT (no DST in mid-Dec).
      // 2026-12-15 is a Tuesday.
      const utc = new Date(Date.UTC(2026, 11, 15, 12, 0))
      const clock = getLondonClock(utc)
      expect(clock.dow).toBe(2)            // Tuesday
      expect(clock.minutes).toBe(720)      // 12:00
    })
  })
})

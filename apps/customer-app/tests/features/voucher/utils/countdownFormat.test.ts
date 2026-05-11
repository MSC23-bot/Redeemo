import {
  formatDurationCompact,
  formatClockTime,
  formatClockHour12,
  formatDayName,
  formatPrimaryCountdown,
  formatPrimaryWhen,
  formatSupportingCountdown,
  formatUrgentCountdown,
  formatDuration,
  formatClosingCountdown,
  formatOpeningCountdown,
  formatAvailableAgainCountdown,
  formatClosingA11y,
  formatOpeningA11y,
  formatAvailableAgainA11y,
} from '@/features/voucher/utils/countdownFormat'

describe('formatDurationCompact', () => {
  it('< 1 hour: "Xm"', () => {
    expect(formatDurationCompact(18 * 60_000)).toBe('18m')
    expect(formatDurationCompact(1 * 60_000)).toBe('1m')
  })

  it('1-24 hours: "Xh Ym"', () => {
    expect(formatDurationCompact((2 * 60 + 14) * 60_000)).toBe('2h 14m')
    expect(formatDurationCompact(60 * 60_000)).toBe('1h 0m')
  })

  it('> 24 hours: "Xd Yh" (no minutes when ≥ 24h)', () => {
    expect(formatDurationCompact((2 * 24 * 60 + 4 * 60) * 60_000)).toBe('2d 4h')
    expect(formatDurationCompact((1 * 24 * 60 + 14 * 60 + 22) * 60_000)).toBe('1d 14h')
  })

  it('0 or negative: "0m" (boundary edge — never displays seconds)', () => {
    expect(formatDurationCompact(0)).toBe('0m')
    expect(formatDurationCompact(-5000)).toBe('0m')
  })
})

describe('formatClockTime', () => {
  it('formats Europe/London wall-clock as HH:MM (24h)', () => {
    // 2026-05-11 14:30 BST = 2026-05-11 13:30 UTC
    expect(formatClockTime(new Date('2026-05-11T13:30:00Z'))).toBe('14:30')
  })

  it('handles midnight as "00:00"', () => {
    expect(formatClockTime(new Date('2026-05-11T23:00:00Z'))).toBe('00:00')
  })
})

describe('formatDayName', () => {
  it('returns "Monday" / "Tuesday" / etc — full day names', () => {
    expect(formatDayName(new Date('2026-05-11T12:00:00Z'))).toBe('Monday')
    expect(formatDayName(new Date('2026-05-12T12:00:00Z'))).toBe('Tuesday')
    expect(formatDayName(new Date('2026-05-17T12:00:00Z'))).toBe('Sunday')
  })

  it('uses hardcoded English array (Hermes-robust pattern)', () => {
    // Sanity guard: ensure the helper does not use Intl with weekday: 'long'.
    const source = formatDayName.toString()
    expect(source).not.toMatch(/weekday:\s*['"]long['"]/)
    expect(source).not.toMatch(/weekday:\s*['"]short['"]/)
  })
})

describe('formatPrimaryCountdown', () => {
  const now = new Date('2026-05-11T12:00:00Z')

  it('active ≥60min: clock-time primary ("14:30")', () => {
    const result = formatPrimaryCountdown({
      state: 'active', now, boundaryAt: new Date('2026-05-11T13:30:00Z'),
    })
    expect(result).toBe('14:30')
  })

  it('urgent <60min: duration primary ("18m")', () => {
    const result = formatPrimaryCountdown({
      state: 'urgent', now, boundaryAt: new Date('2026-05-11T12:18:00Z'),
    })
    expect(result).toBe('18m')
  })

  it('unavailable-today: duration primary ("3h 12m")', () => {
    const result = formatPrimaryCountdown({
      state: 'unavailable-today', now, boundaryAt: new Date('2026-05-11T15:12:00Z'),
    })
    expect(result).toBe('3h 12m')
  })

  it('unavailable-future-day: duration primary ("2d 4h")', () => {
    const result = formatPrimaryCountdown({
      state: 'unavailable-future-day', now,
      boundaryAt: new Date('2026-05-13T16:00:00Z'),
    })
    expect(result).toBe('2d 4h')
  })

  it('redeemed-this-window: duration primary ("18h 24m")', () => {
    const result = formatPrimaryCountdown({
      state: 'redeemed-this-window', now,
      boundaryAt: new Date('2026-05-12T06:24:00Z'),
    })
    expect(result).toBe('18h 24m')
  })

  it('expired: returns "—" placeholder', () => {
    const result = formatPrimaryCountdown({
      state: 'expired', now, boundaryAt: null,
    })
    expect(result).toBe('—')
  })
})

describe('formatSupportingCountdown', () => {
  const now = new Date('2026-05-11T12:00:00Z')

  it('active ≥60min: "Ends in Xh Ym · <schedule>"', () => {
    const result = formatSupportingCountdown({
      state: 'active', now,
      boundaryAt: new Date('2026-05-11T13:30:00Z'),
      schedule: 'Mon-Fri, 11am-3pm',
    })
    expect(result).toBe('Ends in 1h 30m · Mon-Fri, 11am-3pm')
  })

  it('urgent <60min: "Ends at HH:MM · <schedule>"', () => {
    const result = formatSupportingCountdown({
      state: 'urgent', now,
      boundaryAt: new Date('2026-05-11T13:00:00Z'),
      schedule: 'Mon-Fri, 11am-3pm',
    })
    expect(result).toBe('Ends at 14:00 · Mon-Fri, 11am-3pm')
  })

  it('unavailable-today: "Starts at HH:MM · <schedule>"', () => {
    const result = formatSupportingCountdown({
      state: 'unavailable-today', now,
      boundaryAt: new Date('2026-05-11T15:00:00Z'),
      schedule: 'Mon-Fri, 5-7pm',
    })
    expect(result).toBe('Starts at 16:00 · Mon-Fri, 5-7pm')
  })

  it('unavailable-future-day: "Day HH:MM · <schedule>"', () => {
    const result = formatSupportingCountdown({
      state: 'unavailable-future-day', now,
      boundaryAt: new Date('2026-05-13T17:00:00Z'),
      schedule: 'Tuesdays, 6-10pm',
    })
    expect(result).toBe('Wednesday 18:00 · Tuesdays, 6-10pm')
  })

  it('redeemed-this-window: "Day HH:MM · <schedule>"', () => {
    const result = formatSupportingCountdown({
      state: 'redeemed-this-window', now,
      boundaryAt: new Date('2026-05-12T10:00:00Z'),
      schedule: 'Mon-Fri, 12-6pm',
    })
    expect(result).toBe('Tuesday 11:00 · Mon-Fri, 12-6pm')
  })

  it('expired: returns "<schedule>" only (no countdown line)', () => {
    const result = formatSupportingCountdown({
      state: 'expired', now, boundaryAt: null,
      schedule: 'Mon-Fri, 11am-3pm',
    })
    expect(result).toBe('Mon-Fri, 11am-3pm')
  })
})

// ── formatClockHour12 — M4c 12-hour clock-hour formatter ───────────────
//
// Used by the M4c merchant-card state pill for "Opens 5pm today" / "Tomorrow
// 12pm" / "Available now · ends 3pm today" copy. Pins the four boundary
// cases the pill exercises: noon/midnight edges + minute-zero/non-zero
// matrix. Without these, the minute-bearing branch ("9:30pm") only had
// end-to-end coverage via the pill tests — no direct unit pin.

describe('formatClockHour12', () => {
  it('12am: midnight London = "12am" (hour=0 → 12am edge case)', () => {
    // 2026-01-21 00:00 UTC = 00:00 GMT London (winter, no offset).
    expect(formatClockHour12(new Date('2026-01-21T00:00:00Z'))).toBe('12am')
  })

  it('12pm: noon London = "12pm" (hour=12 → 12pm edge case)', () => {
    // 2026-01-21 12:00 UTC = 12:00 GMT London.
    expect(formatClockHour12(new Date('2026-01-21T12:00:00Z'))).toBe('12pm')
  })

  it('5pm: 17:00 London = "5pm" (BST summer date)', () => {
    // 2026-05-13 16:00 UTC = 17:00 BST London (DST in effect).
    expect(formatClockHour12(new Date('2026-05-13T16:00:00Z'))).toBe('5pm')
  })

  it('9:30pm: 21:30 London = "9:30pm" (minute-bearing branch)', () => {
    // 2026-05-13 20:30 UTC = 21:30 BST London. Tests the minute != 0
    // path that produces "H:MMam/pm" with zero-padded minutes.
    expect(formatClockHour12(new Date('2026-05-13T20:30:00Z'))).toBe('9:30pm')
  })
})

// ── formatPrimaryWhen — M4d hero-status-block canonical primary line ────
//
// Spec D3 canonical primary format: "<When> at <H>am/pm" where <When> is
// "Today" / "Tomorrow" / full weekday name. Combines London-local day
// comparison with the existing formatClockHour12 helper.

describe('formatPrimaryWhen', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-05-11T12:00:00Z'))  // Monday 13:00 BST
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders "Today at 5pm" when boundary is later today (London local)', () => {
    const now = new Date('2026-05-11T12:00:00Z')                 // Mon 13:00 BST
    const boundary = new Date('2026-05-11T16:00:00Z')            // Mon 17:00 BST = 5pm
    expect(formatPrimaryWhen(boundary, now)).toBe('Today at 5pm')
  })

  it('renders "Today at 5:30pm" when boundary has minutes', () => {
    const now = new Date('2026-05-11T12:00:00Z')
    const boundary = new Date('2026-05-11T16:30:00Z')            // Mon 17:30 BST = 5:30pm
    expect(formatPrimaryWhen(boundary, now)).toBe('Today at 5:30pm')
  })

  it('renders "Tomorrow at 11am" when boundary is on the next London day', () => {
    const now = new Date('2026-05-11T12:00:00Z')                 // Mon 13:00 BST
    const boundary = new Date('2026-05-12T10:00:00Z')            // Tue 11:00 BST
    expect(formatPrimaryWhen(boundary, now)).toBe('Tomorrow at 11am')
  })

  it('renders "Saturday at 11am" when boundary is 5 days out', () => {
    const now = new Date('2026-05-11T12:00:00Z')                 // Monday
    const boundary = new Date('2026-05-16T10:00:00Z')            // Saturday 11:00 BST
    expect(formatPrimaryWhen(boundary, now)).toBe('Saturday at 11am')
  })

  it('renders "Wednesday at 12pm" using 12-hour noon convention', () => {
    const now = new Date('2026-05-11T12:00:00Z')                 // Monday
    const boundary = new Date('2026-05-13T11:00:00Z')            // Wednesday 12:00 BST
    expect(formatPrimaryWhen(boundary, now)).toBe('Wednesday at 12pm')
  })

  it('renders "Friday at 12am" using 12-hour midnight convention', () => {
    const now = new Date('2026-05-11T12:00:00Z')                 // Monday
    const boundary = new Date('2026-05-14T23:00:00Z')            // Friday 00:00 BST (next day)
    expect(formatPrimaryWhen(boundary, now)).toBe('Friday at 12am')
  })
})

// ── formatUrgentCountdown — M4d hero-status-block urgent-state primary ──
//
// Spec D10 final-60-seconds-only rule: seconds appear ONLY when msToClose
// ≤ 60_000. Above that, falls through to formatDurationCompact (minute
// granularity). At or past zero, returns "Closes now" until parent state
// flips outside the window.

describe('formatUrgentCountdown', () => {
  it('returns "Closes in 23m" when 23 minutes remain', () => {
    expect(formatUrgentCountdown(23 * 60_000)).toBe('Closes in 23m')
  })

  it('returns "Closes in 1m" when 90 seconds remain (rounds down to whole minutes above the 60s threshold)', () => {
    // Above 60s: minute granularity. 90s → 1 minute.
    expect(formatUrgentCountdown(90_000)).toBe('Closes in 1m')
  })

  it('returns "Closes in 47s" when 47 seconds remain', () => {
    expect(formatUrgentCountdown(47_000)).toBe('Closes in 47s')
  })

  it('returns "Closes in 60s" when exactly 60 seconds remain', () => {
    // Boundary: 60s → still seconds-mode (inclusive on the consumer side).
    expect(formatUrgentCountdown(60_000)).toBe('Closes in 60s')
  })

  it('returns "Closes in 1s" when 1 second remains', () => {
    expect(formatUrgentCountdown(1_000)).toBe('Closes in 1s')
  })

  it('returns "Closes now" when msToClose is 0', () => {
    expect(formatUrgentCountdown(0)).toBe('Closes now')
  })

  it('returns "Closes now" when msToClose is negative (boundary already passed)', () => {
    expect(formatUrgentCountdown(-500)).toBe('Closes now')
  })

  it('returns "Closes in 1h 0m" when 60 minutes remain (above urgency band but consumer-facing edge)', () => {
    // Formatter is total-agnostic — caller decides when to invoke. Test that
    // duration math works at the urgency band's upper edge.
    expect(formatUrgentCountdown(60 * 60_000)).toBe('Closes in 1h 0m')
  })
})

describe('formatDuration (M4d amended D3 precision)', () => {
  // ── ≥ 1 day → "<d>d <h>h"
  it('renders "2d 4h" for 2 days 4 hours', () => {
    expect(formatDuration(2 * 86_400_000 + 4 * 3_600_000)).toBe('2d 4h')
  })
  it('renders "1d 0h" for exactly 1 day', () => {
    expect(formatDuration(86_400_000)).toBe('1d 0h')
  })
  // ── < 1 day, ≥ 1 hour → "<h>h <m>m"
  it('renders "5h 12m" for 5h 12m', () => {
    expect(formatDuration(5 * 3_600_000 + 12 * 60_000)).toBe('5h 12m')
  })
  it('renders "1h 0m" for exactly 1 hour', () => {
    expect(formatDuration(3_600_000)).toBe('1h 0m')
  })
  it('renders "23h 59m" just under 1 day', () => {
    expect(formatDuration(23 * 3_600_000 + 59 * 60_000)).toBe('23h 59m')
  })
  // ── < 1 hour, ≥ 1 minute → "<m>m <s>s"
  it('renders "42m 15s" for 42 minutes 15 seconds', () => {
    expect(formatDuration(42 * 60_000 + 15_000)).toBe('42m 15s')
  })
  it('renders "1m 0s" for exactly 1 minute', () => {
    expect(formatDuration(60_000)).toBe('1m 0s')
  })
  it('renders "59m 59s" just under 1 hour', () => {
    expect(formatDuration(59 * 60_000 + 59_000)).toBe('59m 59s')
  })
  // ── < 1 minute, > 0 → "<s>s"
  it('renders "59s" just under 1 minute', () => {
    expect(formatDuration(59_000)).toBe('59s')
  })
  it('renders "1s" for 1 second', () => {
    expect(formatDuration(1_000)).toBe('1s')
  })
  // ── ≤ 0 → "0s" (caller routes to "<verb> now")
  it('renders "0s" for 0 ms', () => {
    expect(formatDuration(0)).toBe('0s')
  })
  it('renders "0s" for negative ms', () => {
    expect(formatDuration(-1000)).toBe('0s')
  })
})

describe('formatClosingCountdown', () => {
  it('returns "Closes in 42m 15s" for under-1h closing', () => {
    expect(formatClosingCountdown(42 * 60_000 + 15_000)).toBe('Closes in 42m 15s')
  })
  it('returns "Closes in 1h 0m" for exactly 1 hour', () => {
    expect(formatClosingCountdown(3_600_000)).toBe('Closes in 1h 0m')
  })
  it('returns "Closes in 47s" under 1 minute', () => {
    expect(formatClosingCountdown(47_000)).toBe('Closes in 47s')
  })
  it('returns "Closes now" at 0 ms', () => {
    expect(formatClosingCountdown(0)).toBe('Closes now')
  })
  it('returns "Closes now" for negative ms', () => {
    expect(formatClosingCountdown(-500)).toBe('Closes now')
  })
})

describe('formatOpeningCountdown', () => {
  it('returns "Opens in 42m 15s"', () => {
    expect(formatOpeningCountdown(42 * 60_000 + 15_000)).toBe('Opens in 42m 15s')
  })
  it('returns "Opens in 5h 12m"', () => {
    expect(formatOpeningCountdown(5 * 3_600_000 + 12 * 60_000)).toBe('Opens in 5h 12m')
  })
  it('returns "Opens in 2d 4h" for multi-day countdown', () => {
    expect(formatOpeningCountdown(2 * 86_400_000 + 4 * 3_600_000)).toBe('Opens in 2d 4h')
  })
  it('returns "Opens in 47s" under 1 minute', () => {
    expect(formatOpeningCountdown(47_000)).toBe('Opens in 47s')
  })
  it('returns "Opens now" at 0 ms', () => {
    expect(formatOpeningCountdown(0)).toBe('Opens now')
  })
})

describe('formatAvailableAgainCountdown', () => {
  it('returns "Available again in 42m 15s"', () => {
    expect(formatAvailableAgainCountdown(42 * 60_000 + 15_000)).toBe('Available again in 42m 15s')
  })
  it('returns "Available again in 2d 4h" for multi-day', () => {
    expect(formatAvailableAgainCountdown(2 * 86_400_000 + 4 * 3_600_000)).toBe('Available again in 2d 4h')
  })
  it('returns "Available now" at 0 ms', () => {
    expect(formatAvailableAgainCountdown(0)).toBe('Available now')
  })
})

describe('formatClosingA11y — coarse stable labels (spec D10 amendment)', () => {
  it('returns "Closes in under a minute" when ms < 60_000 and > 0', () => {
    expect(formatClosingA11y(47_000)).toBe('Closes in under a minute')
    expect(formatClosingA11y(1_000)).toBe('Closes in under a minute')
  })
  it('returns "Closes in about N minutes" when 60_000 ≤ ms < 3_600_000', () => {
    expect(formatClosingA11y(42 * 60_000 + 15_000)).toBe('Closes in about 42 minutes')
    expect(formatClosingA11y(60_000)).toBe('Closes in about 1 minutes')  // single-form ok for now
  })
  it('returns null when ms ≥ 1 hour (caller uses eyebrow-as-label instead)', () => {
    expect(formatClosingA11y(3_600_000)).toBeNull()
    expect(formatClosingA11y(5 * 3_600_000)).toBeNull()
  })
  it('returns null at ≤ 0 ms', () => {
    expect(formatClosingA11y(0)).toBeNull()
    expect(formatClosingA11y(-100)).toBeNull()
  })
})

describe('formatOpeningA11y', () => {
  it('returns "Opens in under a minute" when ms < 60_000 and > 0', () => {
    expect(formatOpeningA11y(47_000)).toBe('Opens in under a minute')
  })
  it('returns "Opens in about N minutes" when 60_000 ≤ ms < 3_600_000', () => {
    expect(formatOpeningA11y(42 * 60_000 + 15_000)).toBe('Opens in about 42 minutes')
  })
  it('returns null when ms ≥ 1 hour', () => {
    expect(formatOpeningA11y(3_600_000)).toBeNull()
  })
})

describe('formatAvailableAgainA11y', () => {
  it('returns "Available again in under a minute" under 1 minute', () => {
    expect(formatAvailableAgainA11y(47_000)).toBe('Available again in under a minute')
  })
  it('returns "Available again in about N minutes" under 1 hour', () => {
    expect(formatAvailableAgainA11y(42 * 60_000 + 15_000)).toBe('Available again in about 42 minutes')
  })
  it('returns null when ms ≥ 1 hour', () => {
    expect(formatAvailableAgainA11y(3_600_000)).toBeNull()
  })
})

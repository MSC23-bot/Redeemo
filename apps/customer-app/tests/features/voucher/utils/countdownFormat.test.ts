import {
  formatDurationCompact,
  formatClockTime,
  formatClockHour12,
  formatDayName,
  formatDuration,
  formatClosingA11y,
  formatOpeningA11y,
  formatAvailableAgainA11y,
  formatSupportingClock,
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

describe('formatClosingA11y — coarse stable labels (TL wording amendment 2026-05-11 D5)', () => {
  it('returns "Ending in under a minute" when ms < 60_000 and > 0', () => {
    expect(formatClosingA11y(47_000)).toBe('Ending in under a minute')
    expect(formatClosingA11y(1_000)).toBe('Ending in under a minute')
  })
  it('returns "Ending in about N minutes" when 60_000 ≤ ms < 3_600_000', () => {
    expect(formatClosingA11y(42 * 60_000 + 15_000)).toBe('Ending in about 42 minutes')
  })
  it('returns singular "Ending in about 1 minute" at exactly 60_000 ms', () => {
    expect(formatClosingA11y(60_000)).toBe('Ending in about 1 minute')
  })
  it('returns singular "Ending in about 1 minute" when Math.round rounds to 1', () => {
    expect(formatClosingA11y(89_999)).toBe('Ending in about 1 minute')   // rounds to 1 (1.499...)
  })
  it('returns plural "Ending in about 2 minutes" when Math.round rounds to 2', () => {
    expect(formatClosingA11y(90_000)).toBe('Ending in about 2 minutes')  // rounds to 2 (1.5 → 2)
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
  it('returns "Available in under a minute" when ms < 60_000 and > 0', () => {
    expect(formatOpeningA11y(47_000)).toBe('Available in under a minute')
  })
  it('returns "Available in about N minutes" when 60_000 ≤ ms < 3_600_000', () => {
    expect(formatOpeningA11y(42 * 60_000 + 15_000)).toBe('Available in about 42 minutes')
  })
  it('returns singular "Available in about 1 minute" at exactly 60_000 ms', () => {
    expect(formatOpeningA11y(60_000)).toBe('Available in about 1 minute')
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
  it('returns singular "Available again in about 1 minute" at exactly 60_000 ms (AO1)', () => {
    expect(formatAvailableAgainA11y(60_000)).toBe('Available again in about 1 minute')
  })
  it('returns null when ms ≥ 1 hour', () => {
    expect(formatAvailableAgainA11y(3_600_000)).toBeNull()
  })
})

describe('formatSupportingClock (TL wording amendment 2026-05-11 D3/D4)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-05-11T12:00:00Z'))  // Monday 13:00 BST
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  // ── Same-day → "<Verb> <Hour><am/pm> today" ─────────────────
  it('same-day "Window ends": "Window ends 5:30pm today"', () => {
    const now = new Date('2026-05-11T12:00:00Z')
    const boundary = new Date('2026-05-11T16:30:00Z')  // 17:30 BST = 5:30pm
    expect(formatSupportingClock(boundary, now, 'Window ends')).toBe('Window ends 5:30pm today')
  })

  it('same-day "Available from" whole hour: "Available from 5pm today"', () => {
    const now = new Date('2026-05-11T12:00:00Z')
    const boundary = new Date('2026-05-11T16:00:00Z')  // 17:00 BST = 5pm
    expect(formatSupportingClock(boundary, now, 'Available from')).toBe('Available from 5pm today')
  })

  it('same-day "Available again from": "Available again from 5pm today"', () => {
    const now = new Date('2026-05-11T12:00:00Z')
    const boundary = new Date('2026-05-11T16:00:00Z')  // 17:00 BST = 5pm
    expect(formatSupportingClock(boundary, now, 'Available again from')).toBe('Available again from 5pm today')
  })

  // ── Next-day → "<Verb> <Hour><am/pm> tomorrow" ──────────────
  it('next-day "Available from": "Available from 12pm tomorrow"', () => {
    const now = new Date('2026-05-11T12:00:00Z')
    const boundary = new Date('2026-05-12T11:00:00Z')  // Tue 12:00 BST = 12pm
    expect(formatSupportingClock(boundary, now, 'Available from')).toBe('Available from 12pm tomorrow')
  })

  it('next-day "Available again from": "Available again from 1pm tomorrow"', () => {
    const now = new Date('2026-05-11T12:00:00Z')
    const boundary = new Date('2026-05-12T12:00:00Z')  // Tue 13:00 BST = 1pm
    expect(formatSupportingClock(boundary, now, 'Available again from')).toBe('Available again from 1pm tomorrow')
  })

  it('midnight-cross "Available from 12:15am tomorrow"', () => {
    const now = new Date('2026-05-11T22:45:00Z')   // Mon 23:45 BST
    const boundary = new Date('2026-05-11T23:15:00Z')  // Tue 00:15 BST = 12:15am
    expect(formatSupportingClock(boundary, now, 'Available from')).toBe('Available from 12:15am tomorrow')
  })

  // ── Future-day (2+ days) → "<Verb> <Weekday> <Hour><am/pm>" (verb prefix NOW INCLUDED per D4) ──
  it('future-day "Available from": "Available from Saturday 11am"', () => {
    const now = new Date('2026-05-11T12:00:00Z')        // Monday
    const boundary = new Date('2026-05-16T10:00:00Z')   // Saturday 11:00 BST = 11am
    expect(formatSupportingClock(boundary, now, 'Available from')).toBe('Available from Saturday 11am')
  })

  it('future-day "Available again from": "Available again from Tuesday 12pm" (per owner D3 example)', () => {
    const now = new Date('2026-05-11T12:00:00Z')        // Monday
    const boundary = new Date('2026-05-19T11:00:00Z')   // Tuesday-week+1 12:00 BST = 12pm (8 days out)
    expect(formatSupportingClock(boundary, now, 'Available again from')).toBe('Available again from Tuesday 12pm')
  })

  it('future-day "Window ends": "Window ends Wednesday 12pm" (rare — multi-day active window edge case)', () => {
    const now = new Date('2026-05-11T12:00:00Z')        // Monday
    const boundary = new Date('2026-05-13T11:00:00Z')   // Wednesday 12:00 BST
    expect(formatSupportingClock(boundary, now, 'Window ends')).toBe('Window ends Wednesday 12pm')
  })

  // ── Midnight noon edge cases ────────────────────────────────
  it('same-day noon: "Window ends 12pm today"', () => {
    const now = new Date('2026-05-11T08:00:00Z')        // Mon 09:00 BST
    const boundary = new Date('2026-05-11T11:00:00Z')   // Mon 12:00 BST
    expect(formatSupportingClock(boundary, now, 'Window ends')).toBe('Window ends 12pm today')
  })

  it('cross-midnight: "Available from 12am tomorrow" (rare — late-night now, boundary just after midnight)', () => {
    const now = new Date('2026-05-11T22:30:00Z')        // Mon 23:30 BST
    const boundary = new Date('2026-05-11T23:00:00Z')   // Tue 00:00 BST — different London day → tomorrow not today
    expect(formatSupportingClock(boundary, now, 'Available from')).toBe('Available from 12am tomorrow')
  })
})

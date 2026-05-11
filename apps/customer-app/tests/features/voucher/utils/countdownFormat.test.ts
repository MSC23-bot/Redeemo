import {
  formatDurationCompact,
  formatClockTime,
  formatClockHour12,
  formatDayName,
  formatPrimaryCountdown,
  formatPrimaryWhen,
  formatSupportingCountdown,
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

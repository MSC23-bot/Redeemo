import { describe, it, expect } from 'vitest'
import {
  parseTimeString,
  getCurrentWindowOccurrence,
  getNextWindowOccurrence,
} from '../../../src/api/shared/voucherAvailability'

type Win = { dayOfWeek: number; openTime: string; closeTime: string }

const LUNCH_MON_FRI: Win[] = [1, 2, 3, 4, 5].map(d => ({
  dayOfWeek: d, openTime: '11:00', closeTime: '15:00',
}))

const FRIDAY_LATE_NIGHT: Win[] = [
  { dayOfWeek: 5, openTime: '22:00', closeTime: '24:00' },
  { dayOfWeek: 6, openTime: '00:00', closeTime: '02:00' },
]

describe('parseTimeString', () => {
  it('parses HH:mm into minutes since midnight', () => {
    expect(parseTimeString('00:00')).toBe(0)
    expect(parseTimeString('11:00')).toBe(660)
    expect(parseTimeString('15:00')).toBe(900)
    expect(parseTimeString('23:59')).toBe(23 * 60 + 59)
  })

  it('parses the special "24:00" sentinel as minute 1440 (end-of-day)', () => {
    expect(parseTimeString('24:00')).toBe(1440)
  })

  it('rejects malformed input', () => {
    expect(() => parseTimeString('25:00')).toThrow()
    expect(() => parseTimeString('11:60')).toThrow()
    expect(() => parseTimeString('xx')).toThrow()
  })
})

describe('getCurrentWindowOccurrence', () => {
  it('returns the open window when now is inside [openTime, closeTime)', () => {
    // Monday 2026-05-11 13:00 BST = 12:00 UTC
    const now = new Date('2026-05-11T12:00:00Z')
    const result = getCurrentWindowOccurrence(LUNCH_MON_FRI, now)
    expect(result).not.toBeNull()
    expect(result!.startsAt.toISOString()).toBe('2026-05-11T10:00:00.000Z') // 11:00 BST
    expect(result!.endsAt.toISOString()).toBe('2026-05-11T14:00:00.000Z')   // 15:00 BST
  })

  it('returns null at the close boundary (half-open range — 15:00 is no longer active)', () => {
    // Monday 2026-05-11 15:00 BST exactly
    const now = new Date('2026-05-11T14:00:00Z')
    expect(getCurrentWindowOccurrence(LUNCH_MON_FRI, now)).toBeNull()
  })

  it('returns the window at the open boundary (11:00 IS active)', () => {
    const now = new Date('2026-05-11T10:00:00Z')
    const result = getCurrentWindowOccurrence(LUNCH_MON_FRI, now)
    expect(result).not.toBeNull()
  })

  it('handles cross-midnight using the 24:00 sentinel — no gap, no overlap', () => {
    // Friday 23:59:59.999 BST → Saturday 00:00:00.000 BST is continuous
    const friLate = new Date('2026-05-15T22:59:59.999Z') // 23:59:59.999 BST Fri
    const satEarly = new Date('2026-05-15T23:00:00.000Z') // 00:00:00 BST Sat

    const friResult = getCurrentWindowOccurrence(FRIDAY_LATE_NIGHT, friLate)
    expect(friResult).not.toBeNull()
    expect(friResult!.startsAt.toISOString()).toBe('2026-05-15T21:00:00.000Z') // 22:00 BST Fri

    const satResult = getCurrentWindowOccurrence(FRIDAY_LATE_NIGHT, satEarly)
    expect(satResult).not.toBeNull()
    expect(satResult!.startsAt.toISOString()).toBe('2026-05-15T23:00:00.000Z') // 00:00 BST Sat
  })

  it('returns null for empty windows array', () => {
    expect(getCurrentWindowOccurrence([], new Date())).toBeNull()
  })
})

describe('getNextWindowOccurrence', () => {
  it('returns the next window-occurrence to open from now', () => {
    // Sunday 2026-05-10 13:00 BST — next is Monday 11:00
    const now = new Date('2026-05-10T12:00:00Z')
    const result = getNextWindowOccurrence(LUNCH_MON_FRI, now)
    expect(result).not.toBeNull()
    expect(result!.startsAt.toISOString()).toBe('2026-05-11T10:00:00.000Z')
  })

  it('returns later-today occurrence if a window opens later today', () => {
    // Monday 09:00 BST — next is Monday 11:00 BST (same day)
    const now = new Date('2026-05-11T08:00:00Z')
    const result = getNextWindowOccurrence(LUNCH_MON_FRI, now)
    expect(result!.startsAt.toISOString()).toBe('2026-05-11T10:00:00.000Z')
  })

  it('wraps to next week if no window opens this week', () => {
    // Saturday 13:00 BST, Mon-Fri windows only — next is next Monday
    const now = new Date('2026-05-16T12:00:00Z')
    const result = getNextWindowOccurrence(LUNCH_MON_FRI, now)
    expect(result!.startsAt.toISOString()).toBe('2026-05-18T10:00:00.000Z')
  })

  it('returns null for empty windows array', () => {
    expect(getNextWindowOccurrence([], new Date())).toBeNull()
  })
})

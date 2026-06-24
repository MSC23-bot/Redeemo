import {
  formatDayHours,
  formatTimeFriendly,
  hhmmToMinutes,
  windowsForDay,
} from '@/features/merchant/utils/branchHoursFormat'
import type { OpeningHourEntry } from '@/lib/api/merchant'

// Branches PR-8 (umbrella D9): the shared customer-app multi-window
// branch-hours formatter. Pins the locked display semantics:
//  - N windows per day, comma-joined, openTime ascending
//  - closed day → "Closed"
//  - full 00:00→24:00 → "Open 24 hours"
//  - 24:00 close → "to midnight"
//  - overnight (close < open) rendered honestly

describe('branchHoursFormat', () => {
  describe('hhmmToMinutes', () => {
    it('parses HH:MM into minutes-since-midnight', () => {
      expect(hhmmToMinutes('00:00')).toBe(0)
      expect(hhmmToMinutes('09:30')).toBe(570)
      expect(hhmmToMinutes('23:59')).toBe(1439)
    })
    it('treats 24:00 as the 1440 end-of-day sentinel', () => {
      expect(hhmmToMinutes('24:00')).toBe(1440)
    })
    it('returns null for null/malformed input', () => {
      expect(hhmmToMinutes(null)).toBeNull()
      expect(hhmmToMinutes(undefined)).toBeNull()
      expect(hhmmToMinutes('not-a-time')).toBeNull()
    })
  })

  describe('formatTimeFriendly', () => {
    it('renders am/pm with a space and 12h clock', () => {
      expect(formatTimeFriendly('09:00')).toBe('9:00 am')
      expect(formatTimeFriendly('14:00')).toBe('2:00 pm')
      expect(formatTimeFriendly('00:00')).toBe('12:00 am')
      expect(formatTimeFriendly('00:30')).toBe('12:30 am')
      expect(formatTimeFriendly('12:00')).toBe('12:00 pm')
      expect(formatTimeFriendly('23:00')).toBe('11:00 pm')
    })
  })

  describe('windowsForDay', () => {
    it('collects only the requested day, sorted by openTime ascending', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 1, openTime: '17:00', closeTime: '23:00', isClosed: false },
        { dayOfWeek: 1, openTime: '09:00', closeTime: '14:00', isClosed: false },
        { dayOfWeek: 2, openTime: '10:00', closeTime: '18:00', isClosed: false }, // other day
      ]
      expect(windowsForDay(hours, 1)).toEqual([
        { openTime: '09:00', closeTime: '14:00' },
        { openTime: '17:00', closeTime: '23:00' },
      ])
    })
    it('drops closed / null-time / zero-length rows', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 3, openTime: null, closeTime: null, isClosed: true },
        { dayOfWeek: 3, openTime: '09:00', closeTime: null, isClosed: false }, // malformed
        { dayOfWeek: 3, openTime: '12:00', closeTime: '12:00', isClosed: false }, // zero-length
        { dayOfWeek: 3, openTime: '13:00', closeTime: '17:00', isClosed: false }, // valid
      ]
      expect(windowsForDay(hours, 3)).toEqual([{ openTime: '13:00', closeTime: '17:00' }])
    })
  })

  describe('formatDayHours', () => {
    it('renders a single same-day window', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isClosed: false },
      ]
      expect(formatDayHours(hours, 1)).toBe('9:00 am to 5:00 pm')
    })

    it('renders N windows comma-joined, ordered by openTime', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 1, openTime: '17:00', closeTime: '23:00', isClosed: false },
        { dayOfWeek: 1, openTime: '09:00', closeTime: '14:00', isClosed: false },
      ]
      expect(formatDayHours(hours, 1)).toBe('9:00 am to 2:00 pm, 5:00 pm to 11:00 pm')
    })

    it('renders a closed day as "Closed"', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 0, openTime: null, closeTime: null, isClosed: true },
      ]
      expect(formatDayHours(hours, 0)).toBe('Closed')
    })

    it('renders a day with no rows as "Closed"', () => {
      expect(formatDayHours([], 4)).toBe('Closed')
    })

    it('renders a 24:00 close as "to midnight"', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 5, openTime: '09:00', closeTime: '24:00', isClosed: false },
      ]
      expect(formatDayHours(hours, 5)).toBe('9:00 am to midnight')
    })

    it('renders a full 00:00 → 24:00 window as "Open 24 hours"', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 6, openTime: '00:00', closeTime: '24:00', isClosed: false },
      ]
      expect(formatDayHours(hours, 6)).toBe('Open 24 hours')
    })

    it('renders an overnight window (close < open) honestly', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 5, openTime: '18:00', closeTime: '02:00', isClosed: false },
      ]
      expect(formatDayHours(hours, 5)).toBe('6:00 pm to 2:00 am')
    })

    it('renders a same-day morning window + an overnight evening window', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 5, openTime: '09:00', closeTime: '14:00', isClosed: false },
        { dayOfWeek: 5, openTime: '20:00', closeTime: '03:00', isClosed: false }, // overnight
      ]
      expect(formatDayHours(hours, 5)).toBe('9:00 am to 2:00 pm, 8:00 pm to 3:00 am')
    })
  })
})

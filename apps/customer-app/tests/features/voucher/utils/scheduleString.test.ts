import { formatScheduleString } from '@/features/voucher/utils/scheduleString'
import type { AvailabilityWindow } from '@/features/voucher/utils/timeLimitedWindow'

describe('formatScheduleString', () => {
  it('contiguous Mon-Fri same hours → "Mon-Fri, 11am-3pm"', () => {
    const windows: AvailabilityWindow[] = [1, 2, 3, 4, 5].map(d => ({
      dayOfWeek: d, openTime: '11:00', closeTime: '15:00',
    }))
    expect(formatScheduleString(windows)).toBe('Mon-Fri, 11am-3pm')
  })

  it('single day only → "Tuesdays, 6-10pm" (plural -s)', () => {
    const windows: AvailabilityWindow[] = [
      { dayOfWeek: 2, openTime: '18:00', closeTime: '22:00' },
    ]
    expect(formatScheduleString(windows)).toBe('Tuesdays, 6-10pm')
  })

  it('Sat+Sun same hours → "Sat-Sun, 10am-2pm"', () => {
    const windows: AvailabilityWindow[] = [
      { dayOfWeek: 6, openTime: '10:00', closeTime: '14:00' },
      { dayOfWeek: 0, openTime: '10:00', closeTime: '14:00' },
    ]
    expect(formatScheduleString(windows)).toBe('Sat-Sun, 10am-2pm')
  })

  it('split-day Monday lunch + dinner → "Mondays, 11am-3pm and 6pm-10pm"', () => {
    const windows: AvailabilityWindow[] = [
      { dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' },
      { dayOfWeek: 1, openTime: '18:00', closeTime: '22:00' },
    ]
    expect(formatScheduleString(windows)).toBe('Mondays, 11am-3pm and 6pm-10pm')
  })

  it('cross-midnight Friday 22:00-24:00 + Saturday 00:00-02:00 → "Fridays, 10pm-2am"', () => {
    const windows: AvailabilityWindow[] = [
      { dayOfWeek: 5, openTime: '22:00', closeTime: '24:00' },
      { dayOfWeek: 6, openTime: '00:00', closeTime: '02:00' },
    ]
    expect(formatScheduleString(windows)).toBe('Fridays, 10pm-2am')
  })

  it('multiple disjoint day ranges → "Mon-Fri, 11am-3pm and Sat-Sun, 12pm-4pm"', () => {
    const windows: AvailabilityWindow[] = [
      { dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' },
      { dayOfWeek: 2, openTime: '11:00', closeTime: '15:00' },
      { dayOfWeek: 3, openTime: '11:00', closeTime: '15:00' },
      { dayOfWeek: 4, openTime: '11:00', closeTime: '15:00' },
      { dayOfWeek: 5, openTime: '11:00', closeTime: '15:00' },
      { dayOfWeek: 6, openTime: '12:00', closeTime: '16:00' },
      { dayOfWeek: 0, openTime: '12:00', closeTime: '16:00' },
    ]
    expect(formatScheduleString(windows)).toBe('Mon-Fri, 11am-3pm and Sat-Sun, 12pm-4pm')
  })

  it('formats noon as "12pm" and midnight close as "2am"', () => {
    const windows: AvailabilityWindow[] = [
      { dayOfWeek: 1, openTime: '12:00', closeTime: '14:00' },
    ]
    expect(formatScheduleString(windows)).toBe('Mondays, 12pm-2pm')
  })

  it('empty windows array → ""', () => {
    expect(formatScheduleString([])).toBe('')
  })
})

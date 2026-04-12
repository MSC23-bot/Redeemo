import { describe, it, expect } from 'vitest'
import { isOpenNow, type Hours } from '../../../src/api/shared/isOpenNow'

describe('isOpenNow', () => {
  // Wednesday 15 April 2026 13:00:00 UTC = 14:00 BST (UTC+1)
  const WED_2PM_BST = new Date('2026-04-15T13:00:00Z')

  const makeHours = (overrides: Partial<Hours>[]): Hours[] =>
    [0,1,2,3,4,5,6].map(day => ({
      dayOfWeek: day,
      openTime: '09:00',
      closeTime: '22:00',
      isClosed: false,
      ...overrides.find(o => o.dayOfWeek === day),
    }))

  it('returns true when within opening hours on current day', () => {
    const hours = makeHours([])
    expect(isOpenNow(hours, WED_2PM_BST)).toBe(true)
  })

  it('returns false when day is marked isClosed', () => {
    // Wednesday = dayOfWeek 3
    const hours = makeHours([{ dayOfWeek: 3, isClosed: true, openTime: null, closeTime: null }])
    expect(isOpenNow(hours, WED_2PM_BST)).toBe(false)
  })

  it('returns false when current time is before openTime', () => {
    // Now is 14:00 BST, open at 15:00
    const hours = makeHours([{ dayOfWeek: 3, openTime: '15:00', closeTime: '22:00', isClosed: false }])
    expect(isOpenNow(hours, WED_2PM_BST)).toBe(false)
  })

  it('returns false when current time is after closeTime', () => {
    // Now is 14:00 BST, closes at 13:00
    const hours = makeHours([{ dayOfWeek: 3, openTime: '09:00', closeTime: '13:00', isClosed: false }])
    expect(isOpenNow(hours, WED_2PM_BST)).toBe(false)
  })

  it('returns false when hours array is empty', () => {
    expect(isOpenNow([], WED_2PM_BST)).toBe(false)
  })

  it('returns false when openTime or closeTime is null and isClosed is false', () => {
    const hours = makeHours([{ dayOfWeek: 3, openTime: null, closeTime: null, isClosed: false }])
    expect(isOpenNow(hours, WED_2PM_BST)).toBe(false)
  })
})

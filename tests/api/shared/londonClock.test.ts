import { describe, it, expect } from 'vitest'
import { getLondonClock } from '../../../src/api/shared/londonClock'

describe('getLondonClock', () => {
  it('returns dayOfWeek 1 (Monday) and minutes 660 (11:00) for a Monday 11:00 BST instant', () => {
    // 2026-05-11 11:00 BST = 2026-05-11 10:00 UTC
    const result = getLondonClock(new Date('2026-05-11T10:00:00Z'))
    expect(result.dayOfWeek).toBe(1)
    expect(result.minutes).toBe(11 * 60)
  })

  it('returns dayOfWeek 1 (Monday) and minutes 0 (midnight) for a Monday 00:00 BST instant', () => {
    // 2026-05-11 00:00 BST = 2026-05-10 23:00 UTC (BST is UTC+1 in May)
    const result = getLondonClock(new Date('2026-05-10T23:00:00Z'))
    expect(result.dayOfWeek).toBe(1)
    expect(result.minutes).toBe(0)
  })

  it('returns dayOfWeek 0 (Sunday) and minutes 1439 (23:59) for a Sunday 23:59 BST', () => {
    const result = getLondonClock(new Date('2026-05-10T22:59:00Z'))
    expect(result.dayOfWeek).toBe(0)
    expect(result.minutes).toBe(23 * 60 + 59)
  })

  it('correctly handles GMT (winter) — Monday 11:00 GMT in January', () => {
    // 2026-01-12 11:00 GMT = 2026-01-12 11:00 UTC (no offset in winter)
    const result = getLondonClock(new Date('2026-01-12T11:00:00Z'))
    expect(result.dayOfWeek).toBe(1)
    expect(result.minutes).toBe(11 * 60)
  })

  it('does not use Intl weekday: short pattern (Hermes-fragility avoidance)', () => {
    // Sanity: confirm the helper extracts day-of-week from a numeric source,
    // not the locale's weekday name.
    const source = (getLondonClock as any).toString()
    expect(source).not.toMatch(/weekday:\s*['"]short['"]/)
    expect(source).not.toMatch(/weekday:\s*['"]long['"]/)
    expect(source).not.toMatch(/toLocaleTimeString/)
  })
})

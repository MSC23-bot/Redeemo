import { describe, it, expect } from 'vitest'
import {
  ROLLING_POPULARITY_WINDOW_DAYS,
  startOfRollingPopularityWindow,
} from '../../../../src/api/customer/discovery/popularityWindow'

// §DG v1.1 spec — rolling 30-day popularity window.  Used by both
// buildPopularRail (computePopularityScores) and buildTrendingRail
// inclusion query.  Pure function — takes `now` as Date, returns the
// window start (30 days × 24h × 60m × 60s × 1000ms before `now`).
// Deterministic for testing.

describe('startOfRollingPopularityWindow (§DG v1.1)', () => {
  it('exposes ROLLING_POPULARITY_WINDOW_DAYS = 30', () => {
    expect(ROLLING_POPULARITY_WINDOW_DAYS).toBe(30)
  })

  it('returns exactly 30 days before `now`', () => {
    const now = new Date('2026-05-23T12:00:00.000Z')
    const expected = new Date('2026-04-23T12:00:00.000Z')
    expect(startOfRollingPopularityWindow(now).toISOString()).toBe(expected.toISOString())
  })

  it('preserves sub-day precision (rolling, not anchored to midnight)', () => {
    const now = new Date('2026-05-23T17:45:12.123Z')
    const expected = new Date('2026-04-23T17:45:12.123Z')
    expect(startOfRollingPopularityWindow(now).toISOString()).toBe(expected.toISOString())
  })

  it('handles month boundary without calendar-month cliff', () => {
    // The pre-v1.1 calendar-month implementation would have anchored to
    // start-of-Apr (2026-04-01T00:00:00Z) for any `now` in May.  The
    // rolling implementation returns now - 30 days regardless of month.
    const may1 = new Date('2026-05-01T00:00:00.000Z')
    const expected = new Date('2026-04-01T00:00:00.000Z')
    expect(startOfRollingPopularityWindow(may1).toISOString()).toBe(expected.toISOString())

    // On May 15, calendar-month would still anchor to Apr 1.  Rolling
    // anchors to Apr 15 — 30 days before.
    const may15 = new Date('2026-05-15T00:00:00.000Z')
    const rollingMay15 = startOfRollingPopularityWindow(may15)
    expect(rollingMay15.toISOString()).toBe('2026-04-15T00:00:00.000Z')
    expect(rollingMay15.toISOString()).not.toBe('2026-04-01T00:00:00.000Z')
  })

  it('handles year boundary cleanly', () => {
    const jan5 = new Date('2027-01-05T00:00:00.000Z')
    const expected = new Date('2026-12-06T00:00:00.000Z')
    expect(startOfRollingPopularityWindow(jan5).toISOString()).toBe(expected.toISOString())
  })
})

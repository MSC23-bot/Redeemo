/**
 * urgency.ts — pure helper unit tests (B1: hoursWaiting + combined d/h format).
 *
 * All tests pass an explicit `now` to keep them deterministic.
 */
import { hoursWaiting, formatWaiting } from '../urgency'

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

function daysAgo(n: number, now: number) {
  return new Date(now - n * DAY_MS).toISOString()
}

function hoursAgo(n: number, now: number) {
  return new Date(now - n * HOUR_MS).toISOString()
}

function minutesAgo(n: number, now: number) {
  return new Date(now - n * 60_000).toISOString()
}

// Fixed "now" for all tests.
const NOW = new Date('2026-06-14T12:00:00.000Z').getTime()

// ── hoursWaiting ────────────────────────────────────────────────────────────

describe('hoursWaiting', () => {
  it('floors partial hours', () => {
    expect(hoursWaiting(minutesAgo(90, NOW), NOW)).toBe(1)
  })

  it('returns 0 for a submission under an hour ago', () => {
    expect(hoursWaiting(minutesAgo(45, NOW), NOW)).toBe(0)
    expect(hoursWaiting(minutesAgo(0, NOW), NOW)).toBe(0)
  })

  it('returns 24 for exactly 1 day', () => {
    expect(hoursWaiting(daysAgo(1, NOW), NOW)).toBe(24)
  })

  it('returns 168 for exactly 7 days', () => {
    expect(hoursWaiting(daysAgo(7, NOW), NOW)).toBe(168)
  })
})

// ── formatWaiting ─────────────────────────────────────────────────────────────

describe('formatWaiting', () => {
  it('returns "<1h" for less than 60 minutes', () => {
    expect(formatWaiting(minutesAgo(45, NOW), NOW)).toBe('<1h')
    expect(formatWaiting(minutesAgo(0, NOW), NOW)).toBe('<1h')
  })

  it('returns "{h}h" for 1-23 hours', () => {
    expect(formatWaiting(hoursAgo(1, NOW), NOW)).toBe('1h')
    expect(formatWaiting(hoursAgo(5, NOW), NOW)).toBe('5h')
    expect(formatWaiting(hoursAgo(23, NOW), NOW)).toBe('23h')
  })

  it('returns "{d}d {h}h" for exactly 1 day (0 remainder hours shown)', () => {
    expect(formatWaiting(daysAgo(1, NOW), NOW)).toBe('1d 0h')
  })

  it('returns "{d}d {h}h" combining full days and a hour remainder', () => {
    // 2 days + 14 hours ago.
    const iso = new Date(NOW - 2 * DAY_MS - 14 * HOUR_MS).toISOString()
    expect(formatWaiting(iso, NOW)).toBe('2d 14h')
  })

  it('returns "{d}d {h}h" for multiple whole days', () => {
    expect(formatWaiting(daysAgo(3, NOW), NOW)).toBe('3d 0h')
    expect(formatWaiting(daysAgo(7, NOW), NOW)).toBe('7d 0h')
  })
})

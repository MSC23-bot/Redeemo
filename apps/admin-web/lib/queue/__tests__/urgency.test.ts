/**
 * urgency.ts — pure helper unit tests.
 *
 * All tests pass an explicit `now` to keep them deterministic.
 */
import { urgencyForAge, formatWaiting } from '../urgency'

// Helper: build a submittedAt ISO string that is `daysAgo` days before `now`.
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

// ── urgencyForAge ─────────────────────────────────────────────────────────────

describe('urgencyForAge', () => {
  it('returns neutral for 2.9 days', () => {
    const iso = new Date(NOW - 2.9 * DAY_MS).toISOString()
    expect(urgencyForAge(iso, NOW)).toBe('neutral')
  })

  it('returns amber for exactly 3 days', () => {
    expect(urgencyForAge(daysAgo(3, NOW), NOW)).toBe('amber')
  })

  it('returns amber for 4 days', () => {
    expect(urgencyForAge(daysAgo(4, NOW), NOW)).toBe('amber')
  })

  it('returns red for exactly 5 days', () => {
    expect(urgencyForAge(daysAgo(5, NOW), NOW)).toBe('red')
  })

  it('returns red for 7 days', () => {
    expect(urgencyForAge(daysAgo(7, NOW), NOW)).toBe('red')
  })

  it('returns neutral for same-day submission (0 days)', () => {
    expect(urgencyForAge(minutesAgo(30, NOW), NOW)).toBe('neutral')
  })
})

// ── formatWaiting ─────────────────────────────────────────────────────────────

describe('formatWaiting', () => {
  it('returns "1 day" for exactly 1 day', () => {
    expect(formatWaiting(daysAgo(1, NOW), NOW)).toBe('1 day')
  })

  it('returns "N days" for multiple days', () => {
    expect(formatWaiting(daysAgo(3, NOW), NOW)).toBe('3 days')
    expect(formatWaiting(daysAgo(7, NOW), NOW)).toBe('7 days')
  })

  it('returns "1 hour" for exactly 1 hour', () => {
    expect(formatWaiting(hoursAgo(1, NOW), NOW)).toBe('1 hour')
  })

  it('returns "N hours" for multiple hours', () => {
    expect(formatWaiting(hoursAgo(5, NOW), NOW)).toBe('5 hours')
    expect(formatWaiting(hoursAgo(23, NOW), NOW)).toBe('23 hours')
  })

  it('returns "under an hour" for less than 60 minutes', () => {
    expect(formatWaiting(minutesAgo(45, NOW), NOW)).toBe('under an hour')
    expect(formatWaiting(minutesAgo(0, NOW), NOW)).toBe('under an hour')
  })
})

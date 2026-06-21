/**
 * F1 relative-time tests for lib/notifications/relativeTime.ts.
 *
 * formatRelativeTime(iso, now) is pure: a fixed `now` is injected so the buckets
 * (just now / Nm ago / Nh ago / Nd ago / short date) are deterministic.
 */
import { formatRelativeTime } from '../relativeTime'

const NOW = new Date('2026-06-21T12:00:00.000Z')

describe('formatRelativeTime', () => {
  it('returns "just now" under 60 seconds', () => {
    expect(formatRelativeTime('2026-06-21T11:59:30.000Z', NOW)).toBe('just now')
    expect(formatRelativeTime('2026-06-21T12:00:00.000Z', NOW)).toBe('just now')
  })

  it('returns minutes for under an hour', () => {
    expect(formatRelativeTime('2026-06-21T11:55:00.000Z', NOW)).toBe('5m ago')
    expect(formatRelativeTime('2026-06-21T11:01:00.000Z', NOW)).toBe('59m ago')
  })

  it('returns hours for under a day', () => {
    expect(formatRelativeTime('2026-06-21T09:00:00.000Z', NOW)).toBe('3h ago')
    expect(formatRelativeTime('2026-06-20T13:00:00.000Z', NOW)).toBe('23h ago')
  })

  it('returns days for under a week', () => {
    expect(formatRelativeTime('2026-06-19T12:00:00.000Z', NOW)).toBe('2d ago')
    expect(formatRelativeTime('2026-06-15T12:00:00.000Z', NOW)).toBe('6d ago')
  })

  it('returns a short date for a week or older', () => {
    // 8 days earlier -> a formatted short date, not "Nd ago".
    const out = formatRelativeTime('2026-06-13T12:00:00.000Z', NOW)
    expect(out).not.toMatch(/ago/)
    expect(out).toMatch(/Jun/)
  })

  it('returns a short date for a future-ish or unparseable edge gracefully', () => {
    // A clamp at the boundary: exactly 7 days is "a week", so short date.
    const out = formatRelativeTime('2026-06-14T12:00:00.000Z', NOW)
    expect(out).not.toMatch(/ago/)
  })

  it('returns an empty string for an unparseable date (safe fallback, never throws)', () => {
    expect(() => formatRelativeTime('not-a-date', NOW)).not.toThrow()
    expect(formatRelativeTime('not-a-date', NOW)).toBe('')
  })
})

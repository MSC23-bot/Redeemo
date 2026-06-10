import { describe, it, expect, beforeEach } from 'vitest'
import { shouldLog, resetLogThrottle } from '../../../src/api/queues/logThrottle'

// Phase 0 PR-0.4: the worker error-log throttle (a persistent Redis/email fault
// must not spam the logs). `now` is injected so the window is deterministic.

beforeEach(() => resetLogThrottle())

describe('shouldLog', () => {
  it('allows the first log for a key, then suppresses within the window', () => {
    expect(shouldLog('k', 30_000, 1_000)).toBe(true)
    expect(shouldLog('k', 30_000, 1_500)).toBe(false) // 0.5s later — suppressed
    expect(shouldLog('k', 30_000, 20_000)).toBe(false) // 19s later — still within 30s
  })

  it('allows again once the window has elapsed', () => {
    expect(shouldLog('k', 30_000, 1_000)).toBe(true)
    expect(shouldLog('k', 30_000, 31_001)).toBe(true) // > 30s later — allowed again
  })

  it('throttles each key independently', () => {
    expect(shouldLog('a', 30_000, 1_000)).toBe(true)
    expect(shouldLog('b', 30_000, 1_000)).toBe(true) // different key — not affected by 'a'
    expect(shouldLog('a', 30_000, 1_000)).toBe(false)
  })
})

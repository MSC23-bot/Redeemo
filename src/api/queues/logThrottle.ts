// src/api/queues/logThrottle.ts
//
// Phase 0 PR-0.4 carry-over: a persistent fault (Redis down, a worker repeatedly
// erroring) must not spam the logs endlessly. `shouldLog(key)` returns true at
// most once per `intervalMs` per key, so a tight error loop logs once a window
// instead of thousands of lines. `now` is injectable for tests.

const lastLoggedAt = new Map<string, number>()

export function shouldLog(key: string, intervalMs = 30_000, now: number = Date.now()): boolean {
  const prev = lastLoggedAt.get(key)
  // First log for a key always fires; afterwards, at most once per window.
  if (prev !== undefined && now - prev < intervalMs) return false
  lastLoggedAt.set(key, now)
  return true
}

/** Test helper — clears the throttle state. */
export function resetLogThrottle(): void {
  lastLoggedAt.clear()
}

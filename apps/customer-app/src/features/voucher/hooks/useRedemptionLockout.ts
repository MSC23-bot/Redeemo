import { useEffect, useRef, useState } from 'react'

/**
 * Lockout countdown driven by an absolute deadline computed from the
 * server's `retryAfter` (seconds). Using an absolute deadline (vs
 * decrementing a counter on a tick) means the timer stays accurate
 * across app-background / app-foreground transitions and JS-thread
 * pauses — when the user comes back, the displayed remaining time
 * reflects real elapsed wall-clock time.
 *
 * Pass `null` (or `0` or negative) when not locked. The hook returns:
 *   - secondsRemaining: integer count, clamped to ≥ 0
 *   - isLocked: true while secondsRemaining > 0
 *   - mmss: zero-padded "MM:SS" for display
 *
 * Re-key behaviour: the deadline is set the FIRST time a positive
 * retryAfter arrives, and re-set whenever retryAfter transitions from
 * null/0 → positive. Bumping retryAfter while already locked is
 * ignored — caller must let the lock expire (or remount) before a new
 * retryAfter takes effect. This protects against accidental countdown
 * resets while a single lockout window is active.
 */
export function useRedemptionLockout(retryAfterSeconds: number | null) {
  const [now, setNow] = useState(() => Date.now())
  const [deadline, setDeadline] = useState<number | null>(() => {
    return retryAfterSeconds != null && retryAfterSeconds > 0
      ? Date.now() + retryAfterSeconds * 1000
      : null
  })

  // Tracks whether retryAfter was last seen as null/0 — the "armed"
  // state. Only when armed does a positive retryAfter set a NEW deadline.
  const armed = useRef<boolean>(retryAfterSeconds == null || retryAfterSeconds <= 0)

  useEffect(() => {
    const positive = retryAfterSeconds != null && retryAfterSeconds > 0
    if (!positive) {
      // retryAfter cleared → re-arm so the next positive value sets a
      // fresh deadline.
      armed.current = true
      setDeadline(null)
      return
    }
    if (armed.current) {
      armed.current = false
      setDeadline(Date.now() + retryAfterSeconds * 1000)
    }
    // While not armed (i.e. lockout already in flight), bumps to
    // retryAfter are intentionally ignored — countdown continues from
    // the original deadline.
  }, [retryAfterSeconds])

  useEffect(() => {
    if (deadline == null) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [deadline])

  const secondsRemaining =
    deadline == null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000))
  const isLocked = secondsRemaining > 0
  const mm = Math.floor(secondsRemaining / 60).toString().padStart(2, '0')
  const ss = (secondsRemaining % 60).toString().padStart(2, '0')

  return { secondsRemaining, isLocked, mmss: `${mm}:${ss}` }
}

import { useEffect, useState } from 'react'

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
 * Caller should re-key (e.g. via a `key` prop or by remounting) when
 * receiving a NEW retryAfter from the backend; the hook treats the
 * deadline as immutable for its lifetime.
 */
export function useRedemptionLockout(retryAfterSeconds: number | null) {
  const [now, setNow] = useState(() => Date.now())
  const isActive = retryAfterSeconds != null && retryAfterSeconds > 0
  // Compute deadline once on mount when active. Subsequent renders use
  // the same deadline; setNow() ticks forward against it.
  const [deadline] = useState<number | null>(() =>
    isActive ? Date.now() + retryAfterSeconds * 1000 : null,
  )

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

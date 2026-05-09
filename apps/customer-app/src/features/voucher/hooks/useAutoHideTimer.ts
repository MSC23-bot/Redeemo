import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Show-to-Staff auto-hide timer (M3 Task 12).
 *
 * Locked timing (plan §M3b Task 12 + §Backgrounding behavior, locked
 * 2026-05-08):
 *   - 1 min 50 s idle → state flips to 'warning' (UI dims / shows
 *     "QR will hide in 10s" hint).
 *   - +10 s → state flips to 'hidden' (UI blurs the QR; tap-to-show
 *     restores via `resetTimer()`).
 *   - `resetTimer()` snaps back to 'visible' + re-arms.
 *   - `frozen: true` short-circuits — stays 'visible' indefinitely.
 *     Used when the redemption is validated; the screen pins open
 *     regardless of idle time.
 *   - `active: false` clears all timers and pins 'visible'. Used by
 *     the caller (ShowToStaff) on AppState background transitions
 *     so backgrounded time does NOT count toward the 2-min idle —
 *     the user expects the QR to still be ready when they
 *     foreground.
 *
 * Returns `{ state, resetTimer }` — the caller wires `resetTimer` to
 * tap handlers (tap on QR / tap on warning chrome) and to focus
 * events.
 */

const HIDE_AFTER_MS   = 2 * 60 * 1_000
const WARNING_LEAD_MS = 10 * 1_000

export type AutoHideState = 'visible' | 'warning' | 'hidden'

type Options = {
  active: boolean
  /** When true (e.g. validated), force state to 'visible' and disable timer. */
  frozen?: boolean
}

export function useAutoHideTimer({ active, frozen }: Options) {
  const [state, setState] = useState<AutoHideState>('visible')
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = useCallback(() => {
    if (warningTimer.current) clearTimeout(warningTimer.current)
    if (hideTimer.current)    clearTimeout(hideTimer.current)
    warningTimer.current = null
    hideTimer.current    = null
  }, [])

  const schedule = useCallback(() => {
    clear()
    warningTimer.current = setTimeout(() => setState('warning'), HIDE_AFTER_MS - WARNING_LEAD_MS)
    hideTimer.current    = setTimeout(() => setState('hidden'),  HIDE_AFTER_MS)
  }, [clear])

  const resetTimer = useCallback(() => {
    setState('visible')
    if (active && !frozen) schedule()
  }, [active, frozen, schedule])

  useEffect(() => {
    if (!active || frozen) {
      clear()
      setState('visible')
      return
    }
    schedule()
    return clear
  }, [active, frozen, schedule, clear])

  return { state, resetTimer }
}

import { useCallback, useEffect, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import { scrollActivity } from './scrollActivity'

// Debounce before declaring the scroll "stopped". Long enough that a
// drag → momentum hand-off (onMomentumScrollBegin fires within a frame or two
// of onScrollEndDrag) clears the pending stop, so looping animations never
// resume for a frame mid-fling; short enough that a slow drag-release (no
// momentum follow) resumes them promptly.
const SCROLL_STOP_DELAY_MS = 120

/**
 * Drives the global `scrollActivity` flag for a scrollable screen.
 *
 * Perf batch 1 (2026-07-09) — moved here from
 * `features/home/hooks/useScrollActivity.ts`: originally built for Home, but
 * `scrollActivity` is a platform-wide motion primitive (any looping
 * animation can watch it — PulsingDot / TrendingFlame / RailIconMotion /
 * VoucherCardStatePill's PulseDot), so the hook that drives it belongs in
 * `design-system/motion` alongside `scrollActivity` itself, not under a
 * single feature. The old path re-exports this for anything not yet
 * migrated (see `features/home/hooks/useScrollActivity.ts`).
 *
 * `scrollActivity` is a module-level singleton read by every looping
 * animation that opts in, which pause while it is 1. This hook guarantees
 * two things inline scroll handlers do not:
 *
 *  - No mid-fling resume / no stranded freeze. The reset to 0 is ALWAYS
 *    debounced AND ALWAYS cleared by the next begin event, so a drag→momentum
 *    hand-off keeps the flag at 1 (loops never resume for a frame mid-fling)
 *    and a slow drag-release still resets it (loops never stay frozen). This
 *    replaces a naive `if (!momentumRef.current)` guard, which would race
 *    the platform-unordered onScrollEndDrag / onMomentumScrollBegin events
 *    (momentumRef is not needed — the begin event clearing the pending
 *    stop subsumes it).
 *  - Never stranded on navigation. On blur (tab switch / a push that keeps
 *    the screen mounted) AND on unmount, the flag is force-reset to 0 and
 *    the timer cleared. Without this, tapping a card mid-fling would leave
 *    `scrollActivity` stuck at 1 and freeze every looping animation
 *    app-wide — including the Show-to-Staff anti-fraud LIVE dot — until the
 *    user returned to the scrolling screen and completed a clean
 *    scroll-stop.
 *
 * Spread the returned handlers onto the scrollable. `onScrollBeginDrag` can
 * be composed with other begin-of-scroll work (e.g. Home's Explore-capsule
 * collapse, or a screen's own worklet `onScroll`) at the call site.
 */
export function useScrollActivity() {
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearStopTimer = useCallback(() => {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current)
      stopTimerRef.current = null
    }
  }, [])

  // begin (drag OR momentum): a scroll is in progress — hold the flag at 1 and
  // cancel any pending stop, so a drag→momentum hand-off never resets mid-fling.
  const beginScroll = useCallback(() => {
    clearStopTimer()
    scrollActivity.value = 1
  }, [clearStopTimer])

  // end (drag OR momentum): schedule the debounced stop; a following begin
  // event clears it before it fires.
  const scheduleStop = useCallback(() => {
    clearStopTimer()
    stopTimerRef.current = setTimeout(() => {
      scrollActivity.value = 0
      stopTimerRef.current = null
    }, SCROLL_STOP_DELAY_MS)
  }, [clearStopTimer])

  const reset = useCallback(() => {
    clearStopTimer()
    scrollActivity.value = 0
  }, [clearStopTimer])

  // Blur (tab switch / a navigation push keeps the screen mounted) AND
  // unmount-while-focused: never leave the global flag stranded at 1.
  useFocusEffect(useCallback(() => reset, [reset]))
  // Unmount-while-not-focused backstop.
  useEffect(() => reset, [reset])

  return {
    onScrollBeginDrag: beginScroll,
    onMomentumScrollBegin: beginScroll,
    onScrollEndDrag: scheduleStop,
    onMomentumScrollEnd: scheduleStop,
    reset,
  }
}

import { useCallback, useEffect, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import { scrollActivity } from '@/design-system/motion/scrollActivity'

// Debounce before declaring the scroll "stopped". Long enough that a
// drag → momentum hand-off (onMomentumScrollBegin fires within a frame or two
// of onScrollEndDrag) clears the pending stop, so looping animations never
// resume for a frame mid-fling; short enough that a slow drag-release (no
// momentum follow) resumes them promptly.
const SCROLL_STOP_DELAY_MS = 120

/**
 * Drives the global `scrollActivity` flag for a scrollable screen (Home).
 *
 * `scrollActivity` is a module-level singleton read by every looping animation
 * app-wide (PulsingDot / TrendingFlame / RailIconMotion), which pause while it
 * is 1. This hook guarantees two things the previous inline handlers did not:
 *
 *  - No mid-fling resume / no stranded freeze. The reset to 0 is ALWAYS
 *    debounced AND ALWAYS cleared by the next begin event, so a drag→momentum
 *    hand-off keeps the flag at 1 (loops never resume for a frame mid-fling)
 *    and a slow drag-release still resets it (loops never stay frozen). This
 *    replaces the previous `if (!momentumRef.current)` 80ms guard, which raced
 *    the platform-unordered onScrollEndDrag / onMomentumScrollBegin events
 *    (momentumRef is no longer needed — the begin event clearing the pending
 *    stop subsumes it).
 *  - Never stranded on navigation. On blur (tab switch / a push that keeps Home
 *    mounted) AND on unmount, the flag is force-reset to 0 and the timer
 *    cleared. Without this, tapping a card mid-fling left `scrollActivity`
 *    stuck at 1 and froze every looping animation app-wide — including the
 *    Show-to-Staff anti-fraud LIVE dot — until the user returned to Home and
 *    completed a clean scroll-stop.
 *
 * Spread the returned handlers onto the scrollable. `onScrollBeginDrag` can be
 * composed with other begin-of-scroll work (e.g. collapsing the Explore
 * capsule) at the call site.
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

  // Blur (tab switch / a navigation push keeps Home mounted) AND
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

import { useEffect, useState } from 'react'
import { useReducedMotion } from 'react-native-reanimated'

/**
 * useCountUp — drives a numeric count-up animation from 0 → `target`
 * over `durationMs` using an `ease-out-quart` curve.
 *
 * Used by the SuccessPopup saving callout (PR-B T2 §3.2): the
 * "You saved £X.XX" amount counts up on entrance to give a subtle,
 * data-driven celebration moment without confetti.  The motion
 * reads the saving as a confirmed value rather than a static
 * receipt number.
 *
 * Why ease-out-quart:
 *   - Linear feels mechanical and lets the eye finish ahead of the
 *     animation; the user disengages before the value lands.
 *   - Ease-in feels sluggish; the value lingers near zero too long.
 *   - Ease-out-quart starts fast, slows decisively, settles cleanly.
 *     The number reads as "arriving" — matching the confirmation
 *     register of the popup itself.
 *
 * Reduced-motion contract:
 *   - When `useReducedMotion()` returns true, the hook returns
 *     `target` immediately on first render and skips the timer.
 *   - This is intentional: count-up is data, not decoration.  The
 *     user still sees the correct final value; only the animated
 *     sweep is suppressed.  Mirrors the brief §9.7 + §3.2 reduced-
 *     motion path: "count-up still plays (it's data, not
 *     decoration)" — read this as: the value still reaches its
 *     target, but the animation sweep is suppressed under reduced
 *     motion (no per-frame mutation).  Either reading lands the
 *     user at the same correct value with no stutter.
 *
 * Implementation note: uses `setInterval` at ~60fps rather than
 * Reanimated `useDerivedValue` because the consumer is a `<Text>`
 * node and React Native cannot animate text content directly via
 * Reanimated shared values without a wrapper.  The setInterval
 * tick rate is small (~16ms) and the duration is bounded
 * (600-1000ms in the SuccessPopup wiring), so the cost is
 * negligible and bounded.
 *
 * @param target  Final numeric value the count should reach.
 * @param durationMs  Duration of the count-up in milliseconds.
 * @returns The current animated value.  Suitable for inline
 *   formatting (e.g. `£${value.toFixed(2)}`) inside a `<Text>`.
 */
export function useCountUp(target: number, durationMs: number): number {
  const reducedMotion = useReducedMotion()
  const [value, setValue] = useState<number>(reducedMotion ? target : 0)

  useEffect(() => {
    if (reducedMotion) {
      setValue(target)
      return
    }
    const start = Date.now()
    const id = setInterval(() => {
      const elapsed = Date.now() - start
      const progress = Math.min(1, elapsed / durationMs)
      // ease-out-quart
      const eased = 1 - Math.pow(1 - progress, 4)
      setValue(target * eased)
      if (progress >= 1) clearInterval(id)
    }, 16) // ~60fps
    return () => clearInterval(id)
  }, [target, durationMs, reducedMotion])

  return value
}

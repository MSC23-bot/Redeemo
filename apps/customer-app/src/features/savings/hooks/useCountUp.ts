import { useEffect, useRef } from 'react'
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated'
import { useMotionScale } from '@/design-system/useMotionScale'

// Drives the brand-red ease-out count-up on the populated hero
// (lifetime / this-month / redemption count).  First mount uses the
// full `durationMs`; subsequent updates use 60% of it so a
// post-refresh value change feels lively but not laggy.  Reduce-
// motion (useMotionScale === 0) snaps to target immediately — the
// value is still read by callers, just without the animation.
export function useCountUp(target: number, durationMs: number) {
  const value = useSharedValue(0)
  const scale = useMotionScale()
  const hasMounted = useRef(false)

  useEffect(() => {
    if (scale === 0) { value.value = target; return }
    const dur = hasMounted.current ? Math.round(durationMs * 0.6) : durationMs
    value.value = withTiming(target, {
      duration: dur,
      easing: Easing.out(Easing.bezier(0.16, 1, 0.3, 1)),
    })
    hasMounted.current = true
  }, [target, durationMs, scale, value])

  return value
}

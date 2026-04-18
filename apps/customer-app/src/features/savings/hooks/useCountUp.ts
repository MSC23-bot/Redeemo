import { useEffect, useRef } from 'react'
import { useSharedValue, withTiming, Easing } from 'react-native-reanimated'
import { useMotionScale } from '@/design-system/useMotionScale'

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

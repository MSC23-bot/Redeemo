import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'
import { useAuthStore } from '@/stores/auth'

export function useReduceMotion(): boolean {
  const motionScale = useAuthStore((s) => s.motionScale)
  const [osReduceMotion, setOsReduceMotion] = useState(false)

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setOsReduceMotion)
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOsReduceMotion)
    return () => sub.remove()
  }, [])

  return motionScale === 0 || osReduceMotion
}

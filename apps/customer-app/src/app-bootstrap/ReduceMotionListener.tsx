import { useEffect } from 'react'
import { AccessibilityInfo } from 'react-native'
import { useAuthStore } from '@/stores/auth'

export function ReduceMotionListener() {
  const setMotionScale = useAuthStore((s) => s.setMotionScale)
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => setMotionScale(enabled ? 0 : 1))
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => setMotionScale(enabled ? 0 : 1))
    return () => sub.remove()
  }, [setMotionScale])
  return null
}

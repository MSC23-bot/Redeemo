import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

export function useMotionScale(): 0 | 1 {
  const [scale, setScale] = useState<0 | 1>(1)
  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (mounted) setScale(v ? 0 : 1) })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', v => setScale(v ? 0 : 1))
    return () => { mounted = false; sub?.remove?.() }
  }, [])
  return scale
}

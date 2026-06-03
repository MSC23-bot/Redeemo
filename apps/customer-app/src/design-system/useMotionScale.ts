import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

export function useMotionScale(): 0 | 1 {
  const [scale, setScale] = useState<0 | 1>(1)
  useEffect(() => {
    let mounted = true
    // §RM (deferred-followups, 2026-06-03): on the owner's dev device this
    // returned false even with iOS Reduce Motion ON, so reduce-motion never
    // disabled the animations. Likely simulator / Expo Go; confirm on a real
    // build. The looping components' cancellation half is fixed; this detection
    // half is the open follow-up.
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (mounted) setScale(v ? 0 : 1) })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', v => setScale(v ? 0 : 1))
    return () => { mounted = false; sub?.remove?.() }
  }, [])
  return scale
}

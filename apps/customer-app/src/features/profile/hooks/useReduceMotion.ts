import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'
import { useAuthStore } from '@/stores/auth'

// OS-only reduce-motion signal. Subscribes to AccessibilityInfo so it
// stays live across OS-setting changes. Returns the raw OS bit — does
// NOT mix in the in-app motionScale preference. Used by surfaces that
// need to distinguish "OS is forcing reduce motion" from "the user
// turned it on in-app" — most importantly AppSettingsSection, whose
// lock for the in-app toggle must engage ONLY when the OS is forcing
// reduce motion, not when the in-app toggle is the one driving it.
export function useOsReduceMotion(): boolean {
  const [osReduceMotion, setOsReduceMotion] = useState(false)

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setOsReduceMotion)
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOsReduceMotion)
    return () => sub.remove()
  }, [])

  return osReduceMotion
}

// Effective reduce-motion signal (combined). Returns true if EITHER the
// OS has reduce motion enabled OR the user's in-app motionScale is 0.
// Animation primitives gate motion off this combined signal.
export function useReduceMotion(): boolean {
  const motionScale = useAuthStore((s) => s.motionScale)
  const osReduceMotion = useOsReduceMotion()
  return motionScale === 0 || osReduceMotion
}

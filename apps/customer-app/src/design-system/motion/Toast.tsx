import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { Text } from '../Text'
import { color, layer, radius, spacing } from '../tokens'
import { useMotionScale } from '../useMotionScale'

type Tone = 'neutral' | 'success' | 'danger' | 'warning'
type Toast = { id: number; message: string; tone: Tone }
type Ctx = { show: (m: string, tone?: Tone) => void }

const ToastCtx = createContext<Ctx>({ show: () => {} })
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const ms = useMotionScale()
  const opacity = useSharedValue(0)
  const ty = useSharedValue(20)
  const show = useCallback<Ctx['show']>((message, tone = 'neutral') => {
    setToast({ id: Date.now(), message, tone })
    opacity.value = withTiming(1, { duration: ms === 0 ? 0 : 180 })
    ty.value = withTiming(0, { duration: ms === 0 ? 0 : 180 })
  }, [ms, opacity, ty])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => {
      opacity.value = withTiming(0, { duration: ms === 0 ? 0 : 180 })
      ty.value = withTiming(20, { duration: ms === 0 ? 0 : 180 })
      setTimeout(() => setToast(null), ms === 0 ? 0 : 200)
    }, 3500)
    return () => clearTimeout(t)
  }, [toast, ms, opacity, ty])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: ty.value }] }))
  const bg = toast?.tone === 'danger' ? color.danger : toast?.tone === 'success' ? color.success : color.navy
  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      {toast && (
        <Animated.View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[{ position: 'absolute', left: spacing[5], right: spacing[5], bottom: spacing[7], zIndex: layer.toast, backgroundColor: bg, padding: spacing[4], borderRadius: radius.md }, style]}
        >
          <Text color="inverse" variant="body.md">{toast.message}</Text>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  )
}

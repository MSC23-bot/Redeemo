import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Animated } from 'react-native'
import { Text } from '../Text'
import { color, layer, radius, spacing } from '../tokens'

type Tone = 'neutral' | 'success' | 'danger' | 'warning'
type Toast = { id: number; message: string; tone: Tone }
type Ctx = { show: (m: string, tone?: Tone) => void }

const ToastCtx = createContext<Ctx>({ show: () => {} })
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const opacityRef = useRef(new Animated.Value(0)).current
  const tyRef = useRef(new Animated.Value(20)).current

  const show = useCallback<Ctx['show']>((message, tone = 'neutral') => {
    setToast({ id: Date.now(), message, tone })
    Animated.parallel([
      Animated.timing(opacityRef, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(tyRef, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start()
  }, [opacityRef, tyRef])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacityRef, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(tyRef, { toValue: 20, duration: 180, useNativeDriver: true }),
      ]).start(() => setToast(null))
    }, 3500)
    return () => clearTimeout(t)
  }, [toast, opacityRef, tyRef])

  const bg = toast?.tone === 'danger' ? color.danger : toast?.tone === 'success' ? color.success : color.navy

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      {toast && (
        <Animated.View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[{ position: 'absolute', left: spacing[5], right: spacing[5], bottom: spacing[7], zIndex: layer.toast, backgroundColor: bg, padding: spacing[4], borderRadius: radius.md }, { opacity: opacityRef, transform: [{ translateY: tyRef }] }]}
        >
          <Text color="inverse" variant="body.md">{toast.message}</Text>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  )
}

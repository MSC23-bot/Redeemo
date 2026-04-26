import React, { useEffect, useMemo, useState } from 'react'
import { Keyboard, Modal, PanResponder, Platform, Pressable, View } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated'
import { color, layer, motion, opacity, radius, spacing } from '../tokens'
import { useMotionScale } from '../useMotionScale'

type Props = { visible: boolean; onDismiss: () => void; children: React.ReactNode; accessibilityLabel?: string }

const DISMISS_THRESHOLD = 120 // px dragged down from resting
const DISMISS_VELOCITY = 0.9 // flick speed threshold

export function BottomSheet({ visible, onDismiss, children, accessibilityLabel }: Props) {
  const ty = useSharedValue(500)
  const scrim = useSharedValue(0)
  const scale = useMotionScale()
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  // Delay unmounting after close so the exit animation can finish before the
  // Modal disappears. Without this, iOS leaves a transparent Modal in the
  // native hierarchy that intercepts ALL touches on the screen below.
  const [shouldRender, setShouldRender] = useState(visible)

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates.height))
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0))
    return () => { showSub.remove(); hideSub.remove() }
  }, [])

  useEffect(() => {
    if (visible) {
      setShouldRender(true)
    } else {
      const t = setTimeout(() => setShouldRender(false), 250)
      return () => clearTimeout(t)
    }
  }, [visible])

  useEffect(() => {
    const ms = scale === 0 ? 0 : motion.duration.base
    ty.value = withTiming(visible ? 0 : 500, { duration: scale === 0 ? 0 : 220 })
    scrim.value = withTiming(visible ? opacity.overlay : 0, { duration: ms })
  }, [visible, ty, scrim, scale])

  // Drag-to-dismiss: attached to the grabber area only so inner scroll / inputs still work.
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_evt, g) => Math.abs(g.dy) > 4,
    onPanResponderGrant: () => {
      ty.value = 0 // cancel any in-flight animation
    },
    onPanResponderMove: (_evt, g) => {
      if (g.dy > 0) ty.value = g.dy // downward only; ignore upward drag
    },
    onPanResponderRelease: (_evt, g) => {
      const shouldDismiss = g.dy > DISMISS_THRESHOLD || g.vy > DISMISS_VELOCITY
      if (shouldDismiss) {
        ty.value = withTiming(600, { duration: 180 })
        onDismiss()
      } else {
        ty.value = withSpring(0, motion.spring.gentle)
      }
    },
    onPanResponderTerminate: () => {
      ty.value = withSpring(0, motion.spring.gentle)
    },
  }), [onDismiss, ty])

  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }))
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }))
  if (!shouldRender) return null
  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onDismiss}>
      <Animated.View style={[{ position: 'absolute', inset: 0, backgroundColor: '#000', zIndex: layer.overlay }, scrimStyle]}>
        <Pressable onPress={onDismiss} accessibilityLabel="Dismiss sheet" style={{ flex: 1 }} />
      </Animated.View>
      {/* iOS keyboard has slight rounded top corners — without this overlap
          the scrim shows through the triangular gap on each side. We shift the
          sheet down 16px (hidden behind the keyboard) and add matching
          paddingBottom so visible content stays in place. */}
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
        style={[{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: keyboardHeight > 0 && Platform.OS === 'ios' ? keyboardHeight - 16 : keyboardHeight,
          backgroundColor: color.surface.raised,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          paddingTop: spacing[5],
          paddingHorizontal: spacing[5],
          paddingBottom: spacing[5] + (keyboardHeight > 0 && Platform.OS === 'ios' ? 16 : 0),
          zIndex: layer.overlay + 1,
        }, sheet]}
      >
        <View
          {...panResponder.panHandlers}
          style={{ alignItems: 'center', paddingVertical: spacing[2], marginTop: -spacing[2], marginHorizontal: -spacing[5], marginBottom: spacing[2] }}
          accessibilityRole="adjustable"
          accessibilityLabel="Drag down to dismiss"
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: color.border.default }} />
        </View>
        {children}
      </Animated.View>
    </Modal>
  )
}

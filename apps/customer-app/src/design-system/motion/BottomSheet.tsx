import React, { useEffect, useState } from 'react'
import { Keyboard, Modal, Platform, Pressable, View } from 'react-native'
import Animated, { Easing, useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { color, layer, motion, opacity, radius, spacing } from '../tokens'
import { useMotionScale } from '../useMotionScale'

type Props = { visible: boolean; onDismiss: () => void; children: React.ReactNode; accessibilityLabel?: string }

export function BottomSheet({ visible, onDismiss, children, accessibilityLabel }: Props) {
  const ty = useSharedValue(500)
  const scrim = useSharedValue(0)
  const scale = useMotionScale()
  // Keyboard-aware lift: when the user taps a TextInput inside the sheet
  // (e.g. the country-picker search field), the on-screen keyboard would
  // otherwise cover the bottom of the sheet. Listening to keyboard events
  // and offsetting the sheet's `bottom` keeps the content above it.
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height))
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0))
    return () => { showSub.remove(); hideSub.remove() }
  }, [])
  useEffect(() => {
    const ms = scale === 0 ? 0 : motion.duration.base
    // Smooth, controlled timing animation — no spring overshoot. Open and close
    // both ease in/out so the sheet glides into rest rather than bouncing.
    ty.value = withTiming(visible ? 0 : 500, { duration: ms, easing: Easing.bezier(0.2, 0.8, 0.2, 1) })
    scrim.value = withTiming(visible ? opacity.overlay : 0, { duration: ms })
  }, [visible, ty, scrim, scale])
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }))
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }))
  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onDismiss}>
      {/* Scrim — visual backdrop only (`pointerEvents: none`). Tap-out dismiss
          is handled by the sibling backdrop Pressable below at z=raised,
          which sits BELOW the sheet (z=sheet) so taps on sheet content reach
          the sheet rather than getting swallowed by the scrim. */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', inset: 0, backgroundColor: '#000', zIndex: layer.base }, scrimStyle]} />
      <Pressable
        accessibilityLabel="Dismiss sheet"
        onPress={onDismiss}
        style={{ position: 'absolute', inset: 0, zIndex: layer.raised }}
      />
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
        style={[{ position: 'absolute', left: 0, right: 0, bottom: keyboardHeight, backgroundColor: color.surface.raised, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing[5], zIndex: layer.sheet }, sheet]}
      >
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: color.border.default, marginBottom: spacing[3] }} />
        {children}
      </Animated.View>
    </Modal>
  )
}

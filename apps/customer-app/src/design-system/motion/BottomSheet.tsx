import React, { useEffect, useState } from 'react'
import { Keyboard, Modal, Platform, Pressable, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { Easing, runOnJS, useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { color, layer, motion, opacity, radius, spacing } from '../tokens'
import { useMotionScale } from '../useMotionScale'

type Props = { visible: boolean; onDismiss: () => void; children: React.ReactNode; accessibilityLabel?: string }

// Swipe-down-to-dismiss thresholds. Either passing the distance OR the
// flick velocity dismisses; both checked at gesture-end.
const DISMISS_DISTANCE = 100   // px dragged down from rest
const DISMISS_VELOCITY = 600   // px/s downward flick speed

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

  // Drag-to-dismiss — bound to the grabber bar only so inner scrolling
  // (FlatList of countries, ScrollView in FilterSheet) keeps working.
  // Downward drag follows the finger; release past threshold dismisses,
  // otherwise springs back to rest.
  const dragGesture = Gesture.Pan()
    .onChange((e) => {
      'worklet'
      // Only follow downward motion. Upward drags clamp at 0 to prevent
      // the sheet pulling above the screen.
      ty.value = e.translationY > 0 ? e.translationY : 0
    })
    .onEnd((e) => {
      'worklet'
      const shouldDismiss = e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY
      if (shouldDismiss) {
        runOnJS(onDismiss)()
      } else {
        ty.value = withTiming(0, { duration: 200, easing: Easing.bezier(0.2, 0.8, 0.2, 1) })
      }
    })

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
        // Sheet is anchored to the bottom edge of the screen and content is
        // inset by `keyboardHeight`. Anchoring at `bottom: 0` (rather than
        // `bottom: keyboardHeight`) lets the white background extend BEHIND
        // the keyboard so iOS's keyboard rounded-corner gaps don't leak the
        // dark scrim through. `paddingBottom` keeps the visible content above
        // the keyboard.
        style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: color.surface.raised, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing[5], paddingBottom: spacing[5] + keyboardHeight, zIndex: layer.sheet }, sheet]}
      >
        {/* Grabber bar — owns the drag-to-dismiss gesture. Inner content
            (FlatLists, ScrollViews) is unaffected and scrolls normally. */}
        <GestureDetector gesture={dragGesture}>
          <Animated.View style={{ paddingVertical: spacing[2], alignItems: 'center', marginBottom: spacing[1] }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: color.border.default }} />
          </Animated.View>
        </GestureDetector>
        {children}
      </Animated.View>
    </Modal>
  )
}

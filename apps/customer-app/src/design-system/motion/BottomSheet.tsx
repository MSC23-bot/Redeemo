import React, { useEffect } from 'react'
import { Modal, Pressable, View } from 'react-native'
import Animated, { Easing, useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { color, layer, motion, opacity, radius, spacing } from '../tokens'
import { useMotionScale } from '../useMotionScale'

type Props = { visible: boolean; onDismiss: () => void; children: React.ReactNode; accessibilityLabel?: string }

export function BottomSheet({ visible, onDismiss, children, accessibilityLabel }: Props) {
  const ty = useSharedValue(500)
  const scrim = useSharedValue(0)
  const scale = useMotionScale()
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
      {/* Scrim — visual backdrop only. Drop the inner full-flex Pressable that
          was catching ALL taps (including taps over the sheet) because the
          scrim's zIndex was set higher than the sheet's. The sibling sheet
          below now owns input; tap-out dismissal is handled by the small
          backdrop Pressable rendered as a second sibling, which sits BELOW
          the sheet by zIndex. */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', inset: 0, backgroundColor: '#000', zIndex: layer.base }, scrimStyle]} />
      <Pressable
        accessibilityLabel="Dismiss sheet"
        onPress={onDismiss}
        style={{ position: 'absolute', inset: 0, zIndex: layer.raised }}
      />
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
        style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: color.surface.raised, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing[5], zIndex: layer.sheet }, sheet]}
      >
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: color.border.default, marginBottom: spacing[3] }} />
        {children}
      </Animated.View>
    </Modal>
  )
}

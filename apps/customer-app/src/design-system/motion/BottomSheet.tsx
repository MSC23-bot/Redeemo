import React, { useEffect } from 'react'
import { Modal, Pressable, View } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated'
import { color, layer, motion, opacity, radius, spacing } from '../tokens'
import { useMotionScale } from '../useMotionScale'

type Props = { visible: boolean; onDismiss: () => void; children: React.ReactNode; accessibilityLabel?: string }

export function BottomSheet({ visible, onDismiss, children, accessibilityLabel }: Props) {
  const ty = useSharedValue(500)
  const scrim = useSharedValue(0)
  const scale = useMotionScale()
  useEffect(() => {
    const ms = scale === 0 ? 0 : motion.duration.base
    ty.value = withSpring(visible ? 0 : 500, visible ? motion.spring.gentle : { damping: 22, stiffness: 220 })
    scrim.value = withTiming(visible ? opacity.overlay : 0, { duration: ms })
  }, [visible, ty, scrim, scale])
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }))
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }))
  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onDismiss}>
      <Animated.View style={[{ position: 'absolute', inset: 0, backgroundColor: '#000', zIndex: layer.overlay }, scrimStyle]}>
        <Pressable onPress={onDismiss} accessibilityLabel="Dismiss sheet" style={{ flex: 1 }} />
      </Animated.View>
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

import React, { useEffect, useRef } from 'react'
import { Animated, Modal, Pressable, View } from 'react-native'
import { color, layer, opacity, radius, spacing } from '../tokens'

type Props = { visible: boolean; onDismiss: () => void; children: React.ReactNode; accessibilityLabel?: string }

export function BottomSheet({ visible, onDismiss, children, accessibilityLabel }: Props) {
  const ty = useRef(new Animated.Value(500)).current
  const scrim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(ty, { toValue: visible ? 0 : 500, useNativeDriver: true }),
      Animated.timing(scrim, { toValue: visible ? opacity.overlay : 0, duration: 240, useNativeDriver: true }),
    ]).start()
  }, [visible, ty, scrim])

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onDismiss}>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: layer.overlay }, { opacity: scrim }]}>
        <Pressable onPress={onDismiss} accessibilityLabel="Dismiss sheet" style={{ flex: 1 }} />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
        style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: color.surface.raised, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing[5], zIndex: layer.sheet }, { transform: [{ translateY: ty }] }]}
      >
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: color.border.default, marginBottom: spacing[3] }} />
        {children}
      </Animated.View>
    </Modal>
  )
}

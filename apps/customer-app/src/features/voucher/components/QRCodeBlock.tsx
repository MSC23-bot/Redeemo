import React from 'react'
import { View, StyleSheet } from 'react-native'
import { BlurView } from 'expo-blur'
import QRCode from 'react-native-qrcode-svg'
import { color, radius } from '@/design-system/tokens'
import { codeAccessibilityLabel } from '../utils/formatCode'

const MIN_HERO_SIZE = 200

type Props = {
  value: string
  size: number
  /** Enforces MIN_HERO_SIZE floor. Use on Show to Staff hero. */
  hero?: boolean
  /** Overlays a blur and swaps accessibility label. */
  blurred?: boolean
}

export function QRCodeBlock({ value, size, hero, blurred }: Props) {
  const effectiveSize = hero ? Math.max(size, MIN_HERO_SIZE) : size
  const logoSize = Math.round(effectiveSize * 0.18)

  if (blurred) {
    return (
      <View
        style={[styles.wrapper, { width: effectiveSize, height: effectiveSize }]}
        accessibilityRole="button"
        accessibilityLabel="Code hidden. Tap to show again."
      >
        <BlurView intensity={32} style={StyleSheet.absoluteFill} />
      </View>
    )
  }

  return (
    <View
      style={[styles.wrapper, { width: effectiveSize, height: effectiveSize }]}
      accessibilityRole="image"
      accessibilityLabel={codeAccessibilityLabel(value)}
    >
      <QRCode
        value={value}
        size={effectiveSize}
        color={color.navy}
        backgroundColor="#FFFFFF"
        ecl="H"
        logo={require('../../../../assets/icon.png')}
        logoSize={logoSize}
        logoBackgroundColor="#FFFFFF"
        logoMargin={2}
        logoBorderRadius={4}
        quietZone={4}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
})

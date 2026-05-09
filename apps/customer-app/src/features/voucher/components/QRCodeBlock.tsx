import React from 'react'
import { Pressable, View, StyleSheet } from 'react-native'
import { BlurView } from 'expo-blur'
import QRCode from 'react-native-qrcode-svg'
import { color, radius } from '@/design-system/tokens'
import { codeAccessibilityLabel } from '../utils/formatRedemptionCode'

/**
 * Show-to-Staff QR code block (M3 Task 9).
 *
 * Renders the 8-character redemption code as a QR with a Redeemo "R"
 * mark overlay. Adapted from the `feature/customer-app` reference
 * implementation, fitted to current main:
 *   - 8-char code format (A7K2P9X4) with the spoken-friendly
 *     accessibility label from `codeAccessibilityLabel`.
 *   - `redeemo-r-mark.png` asset (matches the v6 mockup's "R" centre).
 *   - Project tokens (`color.navy`, `radius.md`).
 *
 * QR payload contract (locked at M3 plan-time, decision D5): the QR
 * carries the OPAQUE 8-char code only — no URL, no scheme. Generic
 * scanners read it as plain text. Self-validation is impossible
 * because the customer-side `me/:code` endpoint is read-only and the
 * staff `verify` route requires merchant/branch auth — see
 * `src/api/redemption/routes.ts` + plan §Security model.
 *
 * Anti-fraud `blurred` state: when `true`, the QR component is NOT
 * rendered. The wrapper shows only a BlurView overlay over a white
 * placeholder. A screenshot taken while blurred captures the blur,
 * NOT the underlying code. The blurred state is a Pressable so the
 * caller can wire `onShow` for tap-to-show recovery (ShowToStaff
 * Task 15 sets `blurred=false` on press).
 */

const MIN_HERO_SIZE = 200

type Props = {
  /** 8-character redemption code (canonical uppercase form). */
  value: string
  /** Pixel size of the QR + container square. */
  size: number
  /** Enforces a 200px floor. Use on Show-to-Staff hero so the QR is
   *  scannable across the room even when the available space shrinks. */
  hero?: boolean
  /** When true, hide the QR behind a BlurView and switch the
   *  accessibility surface to a tap-to-show button. */
  blurred?: boolean
  /** Tap handler for the blurred state. Only fires when `blurred`. */
  onShow?: () => void
  testID?: string
}

export function QRCodeBlock({ value, size, hero, blurred, onShow, testID }: Props) {
  const effectiveSize = hero ? Math.max(size, MIN_HERO_SIZE) : size
  const logoSize = Math.round(effectiveSize * 0.18)
  const sizeStyle = { width: effectiveSize, height: effectiveSize }

  if (blurred) {
    return (
      <Pressable
        testID={testID}
        style={[styles.wrapper, sizeStyle]}
        accessibilityRole="button"
        accessibilityLabel="Code hidden. Tap to show again."
        onPress={onShow}
      >
        <BlurView intensity={32} style={StyleSheet.absoluteFill} />
      </Pressable>
    )
  }

  return (
    <View
      testID={testID}
      style={[styles.wrapper, sizeStyle]}
      accessibilityRole="image"
      accessibilityLabel={codeAccessibilityLabel(value)}
    >
      <QRCode
        value={value}
        size={effectiveSize}
        color={color.navy}
        backgroundColor="#FFFFFF"
        ecl="H"
        logo={require('../../../../assets/redeemo-r-mark.png')}
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

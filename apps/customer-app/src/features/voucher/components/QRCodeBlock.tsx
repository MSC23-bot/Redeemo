import React from 'react'
import { Pressable, View, StyleSheet } from 'react-native'
import { BlurView } from 'expo-blur'
import QRCode from 'react-native-qrcode-svg'
import { color, radius } from '@/design-system/tokens'
import { codeAccessibilityLabel } from '../utils/formatRedemptionCode'
import { RedeemoLogo } from '@/features/auth/components/RedeemoLogo'

/**
 * Show-to-Staff QR code block (M3 Task 9).
 *
 * Renders the 8-character redemption code as a QR with a Redeemo "R"
 * mark overlay.
 *
 * **PR-B T8q (impeccable pass) logo-overlay fix:** the previous
 * `redeemo-r-mark.png` asset was a near-white R on transparent — it
 * disappeared against the white QR background.  Owner direction:
 * "the Redeemo logo in the center of the QR code is white, we can't
 * see it.  Make sure it goes well with the QR code."
 *
 * Replaced the PNG `logo` prop with an absolute-positioned overlay
 * that hosts:
 *   1. A white "anchor" square (the QR-error-correction mask) that
 *      visually erases the modules underneath so the brand mark
 *      sits on a clean canvas.
 *   2. The canonical `<RedeemoLogo>` SVG component — brand-rose
 *      `#E20C04` + brand-coral `#E84A00` paths.  Same brand mark
 *      already used on Show-to-Staff identity zone, auth chrome,
 *      etc.  No new asset to manage.
 *
 * QR scannability: H-level error correction (30% module recovery)
 * tolerates the centre mask.  Logo size is 18% of the QR diameter,
 * well within the recovery budget.
 *
 * QR payload contract (locked at M3 plan-time, decision D5): the QR
 * carries the OPAQUE 8-char code only — no URL, no scheme. Generic
 * scanners read it as plain text.
 *
 * Anti-fraud `blurred` state: when `true`, the QR component is NOT
 * rendered. The wrapper shows only a BlurView overlay over a white
 * placeholder. A screenshot taken while blurred captures the blur,
 * NOT the underlying code. The blurred state is a Pressable so the
 * caller can wire `onShow` for tap-to-show recovery.
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
  // White anchor square sits behind the SVG R — slightly bigger than
  // the logo so brand-rose strokes have breathing room on cream and
  // the QR modules are visually masked.  Matches the previous PNG
  // logoBackgroundColor + logoMargin combination at ~1.4× the logo.
  const logoAnchorSize = Math.round(logoSize * 1.4)
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
        quietZone={4}
      />
      {/* Brand R overlay — white anchor square + canonical RedeemoLogo
          SVG (brand-rose / brand-coral / maroon paths).  Sits absolute
          in the centre of the QR; pointerEvents none so taps reach
          the wrapper / blurred Pressable.  H-level error correction
          tolerates ~30% module obscurity; this overlay covers ~25%
          of the QR area and stays well within tolerance. */}
      <View
        pointerEvents="none"
        testID="qrcode-redeemo-overlay"
        style={[
          styles.logoAnchor,
          {
            top: (effectiveSize - logoAnchorSize) / 2,
            left: (effectiveSize - logoAnchorSize) / 2,
            width: logoAnchorSize,
            height: logoAnchorSize,
          },
        ]}
      >
        <RedeemoLogo size={logoSize} />
      </View>
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
  // PR-B T8q: white anchor square hosting the brand SVG.  Lives as
  // an absolute child of the QR wrapper so the QR modules render
  // beneath; the white square visually masks them in the centre.
  logoAnchor: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

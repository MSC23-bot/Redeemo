import React, { useCallback } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { SvgXml } from 'react-native-svg'
import { Heart, ArrowRight } from 'lucide-react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { lightHaptic } from '@/design-system/haptics'
import { useMotionScale } from '@/design-system/useMotionScale'
import type { VoucherType } from '@/lib/api/redemption'
import type { MerchantVoucher } from '@/lib/api/merchant'

// Round 5 §32: dial colour back up. The owner shared a §22-era
// screenshot as the colour reference and wanted the energy
// back — §31 had drifted too pastel. Goal for this round:
// pastel-start / VIVID-deep so the gradient reads alive at
// the bottom-right corner, the way the reference shows it.
//
//   1. Vivid-deep palette. Each pair: clearly pastel light
//      start (top-left), vivid (but not neon) deep stop
//      (bottom-right). Mint → emerald, lavender → violet,
//      coral → bright red. The deep stop is where the card
//      reads as "alive"; the pastel start gives it warmth.
//
//      Sits between §22 (neon) and §31 (pastel-muted) —
//      lights from §31, deeps closer to §22 but a touch less
//      aggressive.
//
//   2. Active vs redeemed contrast preserved. The owner
//      flagged that washed-out cards confuse "redeemable"
//      with "redeemed". Active state is now visibly more
//      vivid; cardRedeemed style still drops opacity to 0.6
//      so the redeemed state reads clearly washed by
//      comparison.
//
//   3. Decorative blobs DIAGONALLY spread across the card.
//      §32 had three blobs all clustered on the LEFT (top,
//      mid, bottom) — the owner flagged that as cluttered on
//      the left and asked for true spread. §33 keeps two on
//      the left and moves the third to the BOTTOM-RIGHT so
//      the shapes anchor three corners diagonally:
//        shapeA: top-LEFT corner bleed (140pt @ 0.11)
//        shapeB: bottom-LEFT corner bleed (180pt @ 0.09)
//        shapeC: BOTTOM-RIGHT corner bleed (130pt @ 0.06)
//      Top-right corner stays empty (reserved for heart + R
//      top). shapeC opacity (0.06) is below the R (0.12) so
//      the R reads cleanly through shapeC's soft glow.
//
//   4. Brand R unchanged from §31: 130×130, slight bleed off
//      the right edge, OFFICIAL Iconic Version 3 paths in
//      <SvgXml>, white fills, wrapper opacity 0.12.
//
//   5. Card minHeight 150 → 144 (slight slim-down). The
//      owner asked for the card to feel a bit smaller; 6pt
//      tighter without sacrificing readability.
//
// Behaviour preserved across §22 → §32:
//   • side cutouts at mid-height (coupon silhouette)
//   • per-type 3-stop gradient with brand-red drop shadow
//   • horizontal text only
//   • dark-translucent type chip
//   • hero stacked (eyebrow + £hero on separate lines)
//   • description 12pt + lineHeight 16
//   • clean three-zone right column: heart top / R middle /
//     CTA bottom
//   • smart £ formatting (£5 vs £5.50)
//   • a11y label format
//   • press scale + heart spring with motion-scale gating
//
// Behaviour preserved across §22 → §30:
//   • side cutouts at mid-height (coupon silhouette)
//   • per-type 3-stop gradient with brand-red drop shadow
//   • horizontal text only
//   • dark-translucent type chip
//   • hero stacked (eyebrow + £hero on separate lines)
//   • description 12pt + lineHeight 16
//   • subtle decorative blobs on the LEFT side only
//   • clean three-zone right column: heart / R / CTA
//   • smart £ formatting (£5 vs £5.50)
//   • a11y label format
//   • press scale + heart spring with motion-scale gating

// §32 pastel-start / vivid-deep palette. Owner reference
// (a §22-era screenshot) shows clearly-pastel light stops
// fading into vivid (but not neon) deep stops at the
// bottom-right of each card. Lights are pastel; deeps are
// noticeably more saturated than §31's muted pairs but a
// touch less aggressive than §22's neon. The visible
// gradient lives in the deep stop — that's where the card
// reads as "alive".
const TYPE_GRADIENTS: Record<VoucherType, readonly [string, string]> = {
  BOGO:             ['#B7A4F2', '#6E3DD3'],   // soft lavender → vivid violet
  DISCOUNT_FIXED:   ['#FB8896', '#D8302A'],   // soft coral → bright red
  DISCOUNT_PERCENT: ['#FB8896', '#D8302A'],
  FREEBIE:          ['#A0E5BA', '#208E50'],   // soft mint → vivid emerald
  SPEND_AND_SAVE:   ['#FAB78E', '#D6531B'],   // soft peach → bright orange
  PACKAGE_DEAL:     ['#9CC0F5', '#2D5BCC'],   // soft sky → vivid blue
  TIME_LIMITED:     ['#F4D072', '#BC6D1C'],   // honey → vivid amber
  REUSABLE:         ['#84DCC2', '#198375'],   // mint-teal → rich teal
} as const

const TYPE_LABELS: Record<VoucherType, string> = {
  BOGO:             'Buy one, get one free',
  DISCOUNT_FIXED:   'Discount',
  DISCOUNT_PERCENT: 'Discount',
  FREEBIE:          'Freebie',
  SPEND_AND_SAVE:   'Spend & save',
  PACKAGE_DEAL:     'Package deal',
  TIME_LIMITED:     'Time limited',
  REUSABLE:         'Reusable',
}

const BRAND_RED = '#E20C04'

type Props = {
  voucher: MerchantVoucher
  isRedeemed: boolean
  isFavourited: boolean
  onPress: () => void
  onToggleFavourite: () => void
}

const PRESS_IN_MS  = 100
const PRESS_OUT_MS = 160
const HEART_UP_MS  = 120
const HEART_DN_MS  = 200

// Smart £ formatting:
//   Whole pounds → "£5"     (no decimals)
//   Pennies      → "£5.50"  (always 2 decimals)
function formatPounds(value: number): string {
  if (Number.isInteger(value)) return `£${value}`
  return `£${value.toFixed(2)}`
}

// §30 brand R watermark — SVG paths COPIED VERBATIM from the
// official docs/branding/Logos/Iconic Version 3.svg. Same four
// shapes, same coordinates. Only the fill is overridden to a
// uniform white so the watermark reads as a clean faint white
// silhouette regardless of the voucher gradient sitting behind
// it. NO manual reconstruction.
const REDEEMO_R_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
  <path fill="#FFFFFF" d="M802.45,452.5c-.44,93.28-48.92,182.68-129,232.74L654.74,674.6c.7-2.78,1.36-5.56,2-8.39a273.15,273.15,0,0,0,6.45-59.33c0-2.21,0-4.41-.09-6.58-1.59-39.37-10.33-77.34-28.7-112.39-18-34.48-43.61-62.42-73.1-87.85a528.72,528.72,0,0,0-63.44-46.67c-5.43-3.48-10.9-6.88-16.47-10.15q-23.1-13.71-47.1-25.91L273.09,226l-11.47-6.84L244.4,208.91l46.75-44A51.25,51.25,0,0,0,336.75,182c27.73-3.62,47.46-28.08,44-54.7a47.11,47.11,0,0,0-17.13-30.59l30.9-29.09,21.68,9.22,8.3,3.54h0c44,21.72,106.7,50.28,142.15,71.12,52.54,30.85,104.41,60.74,149.7,102.63,6.89,6.41,13.51,13.12,19.74,20.14C770.66,313.44,793,363.06,800,414.8A270.54,270.54,0,0,1,802.45,452.5Z"/>
  <polygon fill="#FFFFFF" points="273.09 225.99 261.39 219.37 261.62 219.15 273.09 225.99"/>
  <path fill="#FFFFFF" d="M784.92,888.09a50.58,50.58,0,0,0,50.68,50.59v73.68L531.17,841.69,440.8,791.1,245.06,681.4V441.33l9,5.12L627.45,659l25.39,14.48,1.9,1.1,18.67,10.64L835.6,777.55v60A50.63,50.63,0,0,0,784.92,888.09Z"/>
  <polygon fill="#FFFFFF" points="487.2 818.12 244.4 994.7 245.05 681.39 487.2 818.12"/>
</svg>`

export function VoucherCard({ voucher, isRedeemed, isFavourited, onPress, onToggleFavourite }: Props) {
  const motionScale = useMotionScale()
  const typeKey   = voucher.type as VoucherType
  const gradient  = TYPE_GRADIENTS[typeKey] ?? TYPE_GRADIENTS.DISCOUNT_FIXED
  const typeLabel = TYPE_LABELS[typeKey] ?? 'Voucher'
  const accent    = gradient[1]

  const cardScale  = useSharedValue(1)
  const heartScale = useSharedValue(1)

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }))
  const heartAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }))

  const handlePressIn = useCallback(() => {
    if (motionScale === 0) return
    cardScale.value = withTiming(0.97, {
      duration: PRESS_IN_MS,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    })
  }, [cardScale, motionScale])

  const handlePressOut = useCallback(() => {
    if (motionScale === 0) return
    cardScale.value = withTiming(1, {
      duration: PRESS_OUT_MS,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    })
  }, [cardScale, motionScale])

  const handlePress = useCallback(() => {
    lightHaptic()
    onPress()
  }, [onPress])

  const handleFav = useCallback(() => {
    lightHaptic()
    if (motionScale !== 0) {
      heartScale.value = withSequence(
        withTiming(1.25, { duration: HEART_UP_MS, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
        withTiming(1.0,  { duration: HEART_DN_MS, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
      )
    }
    onToggleFavourite()
  }, [heartScale, motionScale, onToggleFavourite])

  const expiryLabel = voucher.expiryDate
    ? `Expires ${new Date(voucher.expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    : null

  const a11yLabel =
    `${typeLabel} voucher: ${voucher.title}. Save up to ${formatPounds(voucher.estimatedSaving)}` +
    (isRedeemed ? '. Already redeemed this cycle' : '')

  return (
    <Animated.View style={[cardAnimatedStyle, styles.cardShadow]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        style={[styles.card, isRedeemed && styles.cardRedeemed]}
      >
        {/* Per-type 3-stop gradient — deep accent holds from 30%
            so white text reads across the whole card. */}
        <LinearGradient
          colors={[gradient[0], gradient[1], gradient[1]]}
          locations={[0, 0.30, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Top-half gloss — faint white reflection 0→30%. */}
        <LinearGradient
          colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']}
          locations={[0, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.30 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        {/* §33 subtle background shapes — diagonally spread
            across three corners (TL, BL, BR). Top-right
            reserved for heart + R top so the brand mark stays
            visually clear. shapeC's lowest opacity (0.06)
            keeps the R as the dominant element on the right. */}
        <View style={styles.shapeA} pointerEvents="none" />
        <View style={styles.shapeB} pointerEvents="none" />
        <View style={styles.shapeC} pointerEvents="none" />

        {/* §31 brand R watermark — bigger (130×130) with a slight
            bleed off the right edge so the R reads as a designed
            graphic of the voucher rather than a dropped-in icon.
            Still the OFFICIAL Iconic Version 3 paths in <SvgXml>,
            white fills, wrapper opacity 0.12 → faint clean white
            silhouette regardless of voucher gradient. The notches
            render LAST so the coupon silhouette stays intact even
            where the R bleeds toward the right edge. */}
        <View style={styles.watermarkWrap} pointerEvents="none">
          <SvgXml xml={REDEEMO_R_SVG} width="100%" height="100%" />
        </View>

        {/* 1px white-tinted lip at the very top edge — glassy. */}
        <View style={styles.topHighlight} pointerEvents="none" />

        <View style={styles.content}>
          {/* Row 1: type chip (left) + heart (right). */}
          <View style={styles.topRow}>
            <View style={styles.typeChip}>
              <Text style={styles.typeChipText} numberOfLines={1}>
                {typeLabel}
              </Text>
            </View>
            <Animated.View style={heartAnimatedStyle}>
              <Pressable
                onPress={handleFav}
                style={styles.favBtn}
                accessibilityLabel={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
                hitSlop={10}
              >
                <Heart
                  size={16}
                  color={isFavourited ? '#FFFFFF' : 'rgba(255,255,255,0.75)'}
                  fill={isFavourited ? '#FFF' : 'none'}
                  strokeWidth={2.2}
                />
              </Pressable>
            </Animated.View>
          </View>

          {/* Hero — STACKED. "Save up to" eyebrow above £hero. */}
          <View style={styles.heroBlock}>
            <Text style={styles.heroLabel}>Save up to</Text>
            <Text style={styles.heroAmount}>{formatPounds(voucher.estimatedSaving)}</Text>
          </View>

          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
            {voucher.title}
          </Text>

          {voucher.description ? (
            <Text style={styles.description} numberOfLines={2} ellipsizeMode="tail">
              {voucher.description}
            </Text>
          ) : null}

          {/* §28 bottom row: expiry on LEFT, Redeem CTA on RIGHT.
              The R sits at right-CENTER above this row, so the
              bottom-right CTA placement no longer overlaps the
              brand mark. Standard "tap to act" placement
              restored. */}
          <View style={styles.bottomRow}>
            <Text style={styles.metaText} numberOfLines={1} ellipsizeMode="tail">
              {isRedeemed ? 'Redeemed this cycle' : (expiryLabel ?? 'No expiry')}
            </Text>
            {isRedeemed ? (
              <View style={styles.redeemedStamp}>
                <Text style={styles.redeemedStampText}>REDEEMED</Text>
              </View>
            ) : (
              <View style={styles.redeemBtn}>
                <Text style={[styles.redeemBtnText, { color: accent }]}>Redeem</Text>
                <ArrowRight size={13} color={accent} strokeWidth={2.8} />
              </View>
            )}
          </View>
        </View>

        {/* Side cutouts at mid-height — coupon silhouette. */}
        <View style={[styles.notch, styles.notchLeft]} pointerEvents="none" />
        <View style={[styles.notch, styles.notchRight]} pointerEvents="none" />
      </Pressable>
    </Animated.View>
  )
}

const NOTCH_SIZE = 14
const NOTCH_HALF = NOTCH_SIZE / 2
const PAGE_BG = '#FFF9F5'

const styles = StyleSheet.create({
  cardShadow: {
    shadowColor: BRAND_RED,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    borderRadius: 20,
  },
  card: {
    position: 'relative',
    minHeight: 144,   // §32: 150 → 144, slight slim-down per owner ask
    borderRadius: 20,
    overflow: 'hidden',
  },
  cardRedeemed: {
    opacity: 0.6,
  },

  // §33 decorative blobs — diagonally spread across the card,
  // not clustered. Three corners get a soft circle bleed; the
  // top-right corner is reserved for heart + R and stays
  // visually empty:
  //
  //         ┌── shapeA (TL) ──── (heart + R top) ──┐
  //         │                                       │
  //         │                                       │
  //         └── shapeB (BL) ──── shapeC (BR) ─────┘
  //
  // shapeC is the LOWEST opacity (0.06) of the three so it
  // never out-shines the R sitting in the right column. The
  // R reads cleanly through the soft glow of shapeC's edge.
  shapeA: {
    position: 'absolute',
    left: -35,
    top: -35,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.11)',
  },
  shapeB: {
    position: 'absolute',
    left: -55,
    bottom: -45,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  shapeC: {
    position: 'absolute',
    right: -35,
    bottom: -55,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  // §31 brand watermark — bumped 110 → 130 size with a 12pt
  // bleed off the right edge so the R reads as an intentional
  // graphic crop, not a dropped-in icon. Wrapper opacity 0.12
  // → faint clean white silhouette regardless of voucher type.
  // Still the OFFICIAL Iconic Version 3 paths in <SvgXml>.
  watermarkWrap: {
    position: 'absolute',
    right: -12,
    top: 22,
    width: 130,
    height: 130,
    opacity: 0.12,
  },

  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },

  content: {
    padding: 14,
    flex: 1,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  typeChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.28)',
    flexShrink: 1,
    alignSelf: 'flex-start',
  },
  typeChipText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.15,
    textShadowColor: 'rgba(0,0,0,0.20)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  favBtn: {
    padding: 3,
  },

  // Hero stacked: eyebrow above £hero.
  heroBlock: {
    marginTop: 8,
    marginBottom: 6,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.90)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginBottom: 1,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  heroAmount: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.6,
    lineHeight: 30,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  title: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.15,
    lineHeight: 18,
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // §28 description bumped 11 → 12pt with lineHeight 15 → 16.
  // Body text on mobile should be ≥12pt; the QA flagged the
  // §27 description as too small for normal users.
  description: {
    color: 'rgba(255,255,255,0.90)',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: -0.05,
    lineHeight: 16,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // §28 bottom row: expiry-LEFT, CTA-RIGHT (back to the
  // standard layout from before §26). Possible because the R
  // is now at right-center above this row, not bottom-right.
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 12,
  },
  metaText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
    flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  redeemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  redeemBtnText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  redeemedStamp: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.30)',
  },
  redeemedStampText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  notch: {
    position: 'absolute',
    top: '50%',
    marginTop: -NOTCH_HALF,
    width: NOTCH_SIZE,
    height: NOTCH_SIZE,
    borderRadius: NOTCH_HALF,
    backgroundColor: PAGE_BG,
  },
  notchLeft:  { left:  -NOTCH_HALF },
  notchRight: { right: -NOTCH_HALF },
})

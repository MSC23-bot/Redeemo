import React, { useCallback } from 'react'
import { View, Pressable, StyleSheet, Image } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
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

// Round 5 §25: refinements on §24 against the on-device QA pass.
//
//   1. CTA / watermark conflict resolved. In §24 the brand R sat
//      directly under the white Redeem pill — the pill read as
//      "stuck on top of a busy shape". Three changes together:
//        a) watermark shrunk 130 → 110 and pushed further off
//           the corner (right -10 → -28, bottom -22 → -38) so
//           only the upper-left curl of the R is visible inside
//           the card, not the busy ribbon-cross
//        b) opacity 0.12 → 0.10 — recedes further into the
//           gradient texture
//        c) the "background illustration" glow swapped: was a
//           same-colour LIGHT halo (which lifted the watermark
//           but also lifted the area under the CTA, washing
//           the pill out). Replaced with a subtle DARK soft
//           vignette in the same corner — the white CTA pill
//           now sits on a slightly darker stage and reads as a
//           clean action button, not as a label glued onto a
//           busy texture
//
//   2. Type pill ↔ Redeem pill differentiated. In §24 both were
//      solid white pills with accent text — they read as the
//      same kind of control even though one is a label and one
//      is an action. Now:
//        - Type pill = translucent (rgba 0.18) with thin white
//          stroke, white text. Reads as a chip/label.
//        - Redeem pill = solid white + accent text + arrow +
//          shadow. Reads as the primary action.
//      Different surface treatment, different weight.
//
//   3. Text readability safety net. Subtle text shadow
//      (rgba(0,0,0,0.18), 0/1, blur 2) on the eyebrow, title,
//      and description so white text holds on the lighter
//      gradient regions even at the upper-left corner.
//      Gradient locations also tightened [0, 0.45, 1] →
//      [0, 0.30, 1] so the deep accent takes over earlier.
//
//   4. Card height stays 150pt minHeight — no growth.
//
//   5. Heart further reduced — 17 → 16pt, stroke opacity
//      0.85 → 0.70 unfavourited. Accessible but secondary.
//
// Behaviour preserved across §22 → §25:
//   • side cutouts at mid-height
//   • per-type gradient with brand-red shadow underneath
//   • horizontal text only (no rotated labels)
//   • "Save up to" + £hero hierarchy
//   • Smart £ formatting (£5 vs £5.50)
//   • a11y label format
//   • Animation timings (press, heart spring) and motion-scale
//     gating

const TYPE_GRADIENTS: Record<VoucherType, readonly [string, string]> = {
  BOGO:             ['#A78BFA', '#7C3AED'],
  DISCOUNT_FIXED:   ['#FB7185', '#E20C04'],
  DISCOUNT_PERCENT: ['#FB7185', '#E20C04'],
  // §24 contrast: FREEBIE start deepened (#9DE5B6 was too light
  // for white text). REUSABLE + TIME_LIMITED similarly nudged.
  FREEBIE:          ['#7DD9A1', '#15803D'],
  SPEND_AND_SAVE:   ['#FDBA74', '#D9530E'],
  PACKAGE_DEAL:     ['#93C5FD', '#1D4ED8'],
  TIME_LIMITED:     ['#F5C842', '#B45309'],
  REUSABLE:         ['#4DD8C0', '#0F766E'],
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

export function VoucherCard({ voucher, isRedeemed, isFavourited, onPress, onToggleFavourite }: Props) {
  const motionScale = useMotionScale()
  const typeKey   = voucher.type as VoucherType
  const gradient  = TYPE_GRADIENTS[typeKey] ?? TYPE_GRADIENTS.DISCOUNT_FIXED
  const typeLabel = TYPE_LABELS[typeKey] ?? 'Voucher'
  const accent    = gradient[1]   // deep stop — pill text colour

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
        {/* §25 contrast: 3-stop gradient — deep accent now takes
            over by 30% (was 45%) so the upper-left quadrant
            (where the type pill + heart + eyebrow live) sits
            on the deeper colour, lifting white text contrast. */}
        <LinearGradient
          colors={[gradient[0], gradient[1], gradient[1]]}
          locations={[0, 0.30, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* §25 CTA stage: subtle dark vignette in the bottom-
            right corner. Replaces §24's same-colour LIGHT halo,
            which was lifting the area under the Redeem pill and
            washing the white CTA out. A darker tone here gives
            the white CTA pill a clean stage so it reads as a
            confident action button, not as something stuck on
            top of busy texture. */}
        <View style={styles.ctaShade} pointerEvents="none" />

        {/* §25 R watermark: shrunk 130 → 110 and pushed further
            off the corner. Only the upper-left curl of the R is
            visible inside the card now — the busy ribbon-cross
            stays off-screen. Opacity 0.12 → 0.10 so it recedes
            further into the gradient texture. The CTA pill is
            no longer fighting it for space. */}
        <View style={styles.watermarkWrap} pointerEvents="none">
          <Image
            source={require('../../../../assets/redeemo-r-mark.png')}
            style={styles.watermark}
            resizeMode="contain"
            accessible={false}
          />
        </View>

        {/* §24 subtle depth: 1px white-tinted lip at the top edge
            so the card reads as a glassy tile rather than a flat
            rectangle. Bottom edge is held by the brand-red
            shadow underneath. */}
        <View style={styles.topHighlight} pointerEvents="none" />

        {/* Content — natural vertical flow, no `space-between`
            so the bottom row sits on the grid under description
            instead of floating at the card edge. */}
        <View style={styles.content}>
          {/* Row 1: voucher type chip (left) + heart (right).
              §25 differentiation: chip is now translucent with
              a thin white stroke + white text. Reads as a
              label, not as the same kind of pill as the Redeem
              CTA. Heart shrunk and dimmed further so it stays
              accessible but clearly secondary. */}
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
                  color={isFavourited ? '#FFFFFF' : 'rgba(255,255,255,0.70)'}
                  fill={isFavourited ? '#FFF' : 'none'}
                  strokeWidth={2.2}
                />
              </Pressable>
            </Animated.View>
          </View>

          {/* Row 2: hero block — "Save up to" eyebrow + £ amount
              on the same baseline. Saves a row of vertical space
              vs §23's stacked layout. */}
          <View style={styles.heroRow}>
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

          {/* Row last: expiry meta (sentence-case) + Redeem CTA.
              Sits naturally under description, not pushed to the
              card edge — feels like the next line of the grid. */}
          <View style={styles.bottomRow}>
            {isRedeemed ? (
              <Text style={styles.metaText} numberOfLines={1}>
                Redeemed this cycle
              </Text>
            ) : (
              <Text style={styles.metaText} numberOfLines={1} ellipsizeMode="tail">
                {expiryLabel ?? 'No expiry'}
              </Text>
            )}
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

        {/* Side cutouts at mid-height — coupon/ticket silhouette */}
        <View style={[styles.notch, styles.notchLeft]} pointerEvents="none" />
        <View style={[styles.notch, styles.notchRight]} pointerEvents="none" />
      </Pressable>
    </Animated.View>
  )
}

const NOTCH_SIZE = 14
const NOTCH_HALF = NOTCH_SIZE / 2
const PAGE_BG = '#FFF9F5'  // round 5 §15 — body matches identity zone top

const styles = StyleSheet.create({
  // Brand-red shadow + tighter dark shadow for grounding (§24
  // depth refinement #9). Two-shadow stacking isn't supported
  // directly in RN — we keep the brand-red glow and trust the
  // top highlight + gradient depth for the rest.
  cardShadow: {
    shadowColor: BRAND_RED,
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    borderRadius: 20,
  },
  // §24: 168 → 150 minHeight (~11% slimmer). Description gets
  // 2 lines now so the natural flow lands a bit higher than
  // minHeight on average — content drives the height.
  card: {
    position: 'relative',
    minHeight: 150,
    borderRadius: 20,
    overflow: 'hidden',  // clips the watermark off the corner
  },
  cardRedeemed: {
    opacity: 0.6,
  },

  // §25 CTA stage: subtle dark vignette in the bottom-right
  // corner. Soft elliptical shape (large border-radius on a
  // wider-than-tall view) so it reads as a tonal corner rather
  // than a hard circle. Provides the white Redeem pill a clean
  // stage to sit on, addresses the §24 problem where the CTA
  // pill looked stuck on top of the watermark.
  ctaShade: {
    position: 'absolute',
    right: -40,
    bottom: -40,
    width: 220,
    height: 130,
    borderRadius: 110,
    backgroundColor: 'rgba(0,0,0,0.10)',
  },

  // §25 brand watermark: 130 → 110 size, pushed further off the
  // corner (right -10 → -28, bottom -22 → -38) so only the
  // upper-left curl of the R is visible inside the card. The
  // busy ribbon-cross stays off-screen. Opacity 0.12 → 0.10
  // so it recedes further into the gradient texture. Source
  // PNG is 1081×1080 — RN scales down cleanly.
  watermarkWrap: {
    position: 'absolute',
    right: -28,
    bottom: -38,
    width: 110,
    height: 110,
  },
  watermark: {
    width: '100%',
    height: '100%',
    tintColor: '#FFFFFF',
    opacity: 0.10,
  },

  // §24 depth: 1px subtle highlight at the very top edge — gives
  // the card a glassy lip without committing to a full stroke
  // around the perimeter (would fight the cutouts).
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },

  // §24: content uses natural flow (no space-between). Bottom
  // row sits under description on the grid, not pushed to the
  // card edge.
  content: {
    padding: 14,
    flex: 1,
  },

  // Row 1: type pill (left, flex-shrink) + heart (right, fixed).
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  // §25 type CHIP (was pill): translucent backdrop + thin white
  // stroke + white text. Differentiates from the Redeem CTA
  // pill (which stays solid white + accent text). The chip
  // reads as a label/tag, the CTA reads as an action button —
  // different surface treatment for different jobs.
  typeChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    flexShrink: 1,
    alignSelf: 'flex-start',
  },
  typeChipText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.15,
    // Subtle text shadow safety net for the lighter gradient
    // regions (especially FREEBIE start).
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  favBtn: {
    padding: 3,
  },

  // §24 hero row: "Save up to" eyebrow + £hero on the same
  // baseline. Eyebrow is small/quiet, £ is dominant.
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 10,
    marginBottom: 4,
    gap: 8,
  },
  // §25 contrast safety: subtle text shadow on the eyebrow,
  // title, and description. Black at 0.18 opacity, 1px down,
  // 2px blur. Imperceptible as a "shadow" — just lifts white
  // text off the gradient where the upper-left quadrant is
  // lightest (FREEBIE / TIME_LIMITED / REUSABLE).
  heroLabel: {
    color: 'rgba(255,255,255,0.90)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
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
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // Description gets 2 lines — fixes the earlier `coff…`
  // truncation. Tight line-height keeps two lines compact.
  description: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: -0.05,
    lineHeight: 15,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // §24 bottom row sits in natural flow under description.
  // marginTop pulls it down just enough to feel like a footer
  // line of the grid, not a floating CTA.
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 12,
  },
  // §24: drop uppercase. Sentence-case meta text — "Expires 28
  // Dec", "No expiry", "Redeemed this cycle".
  metaText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
    flexShrink: 1,
  },

  // §24 Redeem CTA: white pill + accent (deep gradient stop) text
  // and arrow — colour-codes the CTA per voucher type while
  // staying premium and high-contrast on the gradient.
  redeemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
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

  // Side cutouts at mid-height — coupon silhouette. Slightly
  // smaller (16 → 14) to match the slimmer card.
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

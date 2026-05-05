import React, { useCallback } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Path } from 'react-native-svg'
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

// Round 5 §27: refinements on §26 against the on-device QA.
//
//   1. Brand R watermark now shows the ribbon/voucher structure.
//      §26 used the brand PNG with a flat white tint — the
//      logo's two overlapping ribbon pieces blurred together
//      and the inner structure was unreadable. Switched to
//      react-native-svg with three layered paths approximating
//      the brand mark:
//        a) the C-loop (the upper portion of the R) at white
//           0.09 opacity
//        b) the diagonal ribbon (cutting across the loop) at
//           white 0.14 opacity — slightly brighter, so where
//           it crosses the loop the area reads as a distinct
//           band, the way the brand mark's ribbon stands out
//           against the C
//        c) the bottom-left leg at white 0.10 opacity
//      Result: the R reads as ribbon-on-loop, one colour
//      family (white tint), no heavy outer drop shadow, no
//      foreign colours. The internal depth is achieved by
//      opacity layering — exactly the brief.
//
//   2. Hero block stacks vertically. §22→§26 had "Save up to"
//      and £hero baseline-aligned on a single row to save
//      vertical space — but the user said it reads cluttered
//      that way. Now stacked: small "Save up to" eyebrow on
//      one line, large £hero on the line below. The hierarchy
//      reads more intentionally.
//
//   3. Background shape character restored. §22-era subtle
//      circle blobs were stripped in §23 cleanup and never
//      came back — the user noted the card felt like a flat
//      block of colour. Two soft white blobs added: a small
//      one in the upper-right (decorative, around the R area)
//      and a larger one bottom-left (gives depth to the hero
//      column). Both at 0.05–0.06 opacity — subtle, never
//      compete with text or the R.
//
//   4. Layout rebalanced. §26 felt left-heavy because chip +
//      hero (stacked now) + title + description + CTA all
//      stacked left while the right was just R + heart. The
//      bottom row keeps CTA on the LEFT and expiry to its
//      right — same as §26 — so the right side stays the R's
//      domain. The new background shapes plus the more
//      detailed R fill out the right column visually.
//
//   5. Typography rhythm tightened. heroLabel 11→10pt with
//      letterSpacing 0.4, marginBottom 1pt before £hero;
//      title 14pt 700 lineHeight 18 (kept); description 11pt
//      lineHeight 16 (was 15) — slightly looser line-height
//      gives the 2-line description more breathing room.
//
//   6. Type chip — kept §26's dark-translucent style
//      (rgba(0,0,0,0.28) bg + opaque white 700 text + subtle
//      text shadow). Strong contrast on every gradient
//      including FREEBIE; clearly different surface from the
//      white CTA pill.
//
// Behaviour preserved:
//   • side cutouts at mid-height (coupon silhouette)
//   • per-type 3-stop gradient with brand-red drop shadow
//   • horizontal text only (no rotated labels)
//   • smart £ formatting (£5 vs £5.50)
//   • a11y label format
//   • press scale + heart spring with motion-scale gating

const TYPE_GRADIENTS: Record<VoucherType, readonly [string, string]> = {
  BOGO:             ['#A78BFA', '#7C3AED'],
  DISCOUNT_FIXED:   ['#FB7185', '#E20C04'],
  DISCOUNT_PERCENT: ['#FB7185', '#E20C04'],
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

// §27 SVG R — three layered paths approximating the brand mark.
// Path order matters: loop drawn first (back), leg next, then
// ribbon last (front) so it visually cuts across the loop.
// All three fill with white at slightly different opacities so
// the overlap regions read as the ribbon's distinct band.
function BrandRWatermark() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 105">
      {/* C-loop — upper portion of the R */}
      <Path
        d="M 22 6 L 56 6 C 70 6 76 14 76 26 C 76 38 68 48 54 48 L 38 48 L 38 38 L 52 38 C 60 38 64 32 64 26 C 64 20 60 16 54 16 L 22 16 Z"
        fill="rgba(255,255,255,0.09)"
      />
      {/* Leg — bottom-left triangle */}
      <Path
        d="M 22 60 L 36 60 L 30 100 L 14 100 Z"
        fill="rgba(255,255,255,0.10)"
      />
      {/* Diagonal ribbon — overlaps the loop, brighter so the
          overlap reads as a distinct band */}
      <Path
        d="M 4 54 L 92 62 L 90 80 L 2 72 Z"
        fill="rgba(255,255,255,0.14)"
      />
    </Svg>
  )
}

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

        {/* §27 background shape character: two faint white blobs
            for premium gradient depth. Bleed off corners so they
            read as ambient texture, not deliberate decoration. */}
        <View style={styles.shapeA} pointerEvents="none" />
        <View style={styles.shapeB} pointerEvents="none" />

        {/* §27 brand R watermark — react-native-svg with three
            layered paths (loop, leg, ribbon). Internal structure
            is visible without heavy drop shadow or foreign
            colours. */}
        <View style={styles.watermarkWrap} pointerEvents="none">
          <BrandRWatermark />
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

          {/* §27 hero block — STACKED. "Save up to" eyebrow on
              its own line, £hero below. Reads more intentionally
              than the §22→§26 baseline-aligned single row. */}
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

          {/* Bottom row: CTA on LEFT, expiry to its right. The
              right side of this row stays empty so the R's
              lower portion has space. */}
          <View style={styles.bottomRow}>
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
            <Text style={styles.metaText} numberOfLines={1} ellipsizeMode="tail">
              {isRedeemed ? 'Redeemed this cycle' : (expiryLabel ?? 'No expiry')}
            </Text>
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
    minHeight: 150,
    borderRadius: 20,
    overflow: 'hidden',
  },
  cardRedeemed: {
    opacity: 0.6,
  },

  // §27 background shapes — restore some of the §22-era
  // premium gradient character. Two soft white blobs that
  // bleed off corners.
  shapeA: {
    position: 'absolute',
    right: -30,
    top: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  shapeB: {
    position: 'absolute',
    left: -50,
    bottom: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },

  // §27 brand R watermark — sized and positioned so the FULL R
  // sits in the right-center column. Heart sits cleanly above,
  // CTA bottom-row sits cleanly below.
  watermarkWrap: {
    position: 'absolute',
    right: 14,
    top: 36,
    width: 80,
    height: 84,  // 80 × (105/100) viewBox aspect
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
  // §26 type chip — kept. Dark translucent + opaque white text.
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

  // §27 hero — STACKED (was baseline-aligned). Eyebrow on its
  // own line, £hero below.
  heroBlock: {
    marginTop: 8,
    marginBottom: 6,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.90)',
    fontSize: 10,
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
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // §27 description lineHeight 15 → 16, slightly more breathing
  // room so 2 lines feel less cramped.
  description: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: -0.05,
    lineHeight: 16,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
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

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

// Round 5 §26: refinements on §25 against the on-device QA pass.
//
//   The core fix: stop the brand R from being hidden by the white
//   Redeem CTA. Earlier rounds layered them in the same bottom-
//   right zone — the opaque CTA always covered the faint R.
//   Spatial separation is the only honest fix for an opaque
//   element on a translucent one. So:
//
//     • R relocated to the right-CENTER of the card, vertically
//       between the heart and the bottom row, FULLY visible
//       inside the card (no negative offsets — the whole R shape
//       is in frame, including the curl, ribbon and leg). 85×85,
//       opacity 0.10. Sits on its own dedicated zone.
//
//     • Redeem CTA moved from bottom-right to bottom-LEFT. The
//       expiry meta sits directly to the right of the CTA in
//       the same row, both left-anchored (justifyContent
//       flex-start with a gap). The bottom-right is now a clean
//       reserved area where the R's lower portion can breathe.
//
//     • The §25 dark CTA-stage vignette is gone — no longer
//       needed because the CTA isn't sharing space with the R.
//
//   Type chip readability fix:
//     • §25 used translucent white (rgba 0.18) which washed out
//       on the lighter green start of FREEBIE. Switched to a
//       dark-translucent chip (rgba(0,0,0,0.28)) + opaque white
//       700-weight text. Strong contrast on every gradient,
//       including the lighter starts. No border — keeps the
//       chip flat / label-like vs the CTA pill (white + arrow
//       + shadow / button-like). Different surface, different
//       job.
//
//   Depth + tactility:
//     • Added a soft top-half gloss gradient (white at the very
//       top, fading to transparent ~25% down) — gives the card
//       a faint glassy reflection.
//     • Brand-red drop shadow strengthened (0.22 → 0.28
//       opacity, 16 → 18 radius, 0/6 → 0/8 offset) — card lifts
//       off the page more confidently.
//     • The 1px white-tinted top-edge highlight stays.
//
// Behaviour preserved across §22 → §26:
//   • side cutouts at mid-height (coupon silhouette)
//   • per-type gradient with brand-red drop shadow
//   • horizontal text only (no rotated labels)
//   • "Save up to" + £hero hierarchy, baseline-aligned
//   • description 2 lines (fixes the §23 `coff…` truncation)
//   • smart £ formatting (£5 vs £5.50)
//   • a11y label format
//   • press scale, heart spring with motion-scale gating

const TYPE_GRADIENTS: Record<VoucherType, readonly [string, string]> = {
  BOGO:             ['#A78BFA', '#7C3AED'],
  DISCOUNT_FIXED:   ['#FB7185', '#E20C04'],
  DISCOUNT_PERCENT: ['#FB7185', '#E20C04'],
  // §24 contrast: lighter starts deepened so the upper-left
  // gradient region holds white text. Combined with the
  // §25 location shift to [0, 0.30, 1] the deep accent
  // dominates the whole card.
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
  const accent    = gradient[1]   // deep stop — Redeem CTA text colour

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
        {/* Per-type gradient base. 3-stop with deep accent
            holding from 30% so white text reads across the
            whole card on every type. */}
        <LinearGradient
          colors={[gradient[0], gradient[1], gradient[1]]}
          locations={[0, 0.30, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* §26 top-half gloss: faint white highlight that fades
            from ~10% opacity at the top to transparent by 25%
            of the card height. Adds a subtle glassy reflection
            without adding noise. */}
        <LinearGradient
          colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']}
          locations={[0, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.30 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        {/* §26 brand R watermark: relocated to right-center of
            the card, fully visible (no negative offsets). The
            curl, ribbon and leg are all in frame so the R reads
            as a designed background motif rather than a cropped
            decoration. Heart sits cleanly above it; the bottom
            row's CTA is now on the LEFT, so the R's lower
            portion has clear space on the right. */}
        <View style={styles.watermarkWrap} pointerEvents="none">
          <Image
            source={require('../../../../assets/redeemo-r-mark.png')}
            style={styles.watermark}
            resizeMode="contain"
            accessible={false}
          />
        </View>

        {/* 1px white-tinted highlight along the very top edge —
            glassy lip, kept from §24. */}
        <View style={styles.topHighlight} pointerEvents="none" />

        {/* Content — natural vertical flow. */}
        <View style={styles.content}>
          {/* Row 1: type chip (left) + heart (right). Chip is a
              dark translucent tag — clearly different from the
              white Redeem CTA below. Heart is whisper-quiet. */}
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

          {/* Row 2: hero block — "Save up to" eyebrow + £hero on
              the same baseline. */}
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

          {/* §26 bottom row: CTA on LEFT, expiry to its right.
              Inverted vs §25 (was: expiry-left, CTA-right). The
              right side of bottomRow is now a clear reserved
              area where the R's bottom curl can breathe — the
              white CTA pill no longer covers the watermark. */}
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

        {/* Side cutouts at mid-height — coupon silhouette */}
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
  // §26 stronger brand-red drop shadow — the card lifts off
  // the page more confidently. Tactility / depth refinement
  // per the QA brief #4.
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
    overflow: 'hidden',  // clips top-gloss + watermark
  },
  cardRedeemed: {
    opacity: 0.6,
  },

  // §26 brand watermark: 85×85 inside the card, no negative
  // offsets — the FULL R is in frame. Positioned in the right-
  // center vertical so the heart sits cleanly above and the
  // bottom row's CTA (now on the left) sits cleanly to the
  // left. Tinted white at 0.10 opacity — recedes into the
  // gradient texture but the brand silhouette is recognisable.
  watermarkWrap: {
    position: 'absolute',
    right: 14,
    top: 36,
    width: 85,
    height: 85,
  },
  watermark: {
    width: '100%',
    height: '100%',
    tintColor: '#FFFFFF',
    opacity: 0.10,
  },

  // 1px white-tinted lip at the very top edge — glassy.
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

  // Row 1: chip on the left, heart on the right.
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  // §26 type chip: dark translucent (rgba(0,0,0,0.28)) + opaque
  // white 700-weight text. Strong contrast on every gradient,
  // including the lighter starts (FREEBIE / TIME_LIMITED).
  // No border — chip stays flat / label-like, clearly
  // different surface from the white CTA pill.
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
    // Subtle text shadow for an extra-safety layer of contrast.
    textShadowColor: 'rgba(0,0,0,0.20)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  favBtn: {
    padding: 3,
  },

  // Hero row: "Save up to" eyebrow + £hero on the same baseline.
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 10,
    marginBottom: 4,
    gap: 8,
  },
  // Subtle text shadow on every white-text element — safety
  // net for the lightest gradient regions.
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

  // §26 bottom row: CTA on LEFT (justifyContent flex-start).
  // Expiry meta sits to the right of the CTA in the same row.
  // The right side of this row is left visually empty so the
  // R's bottom curl reads through clearly.
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

  // Redeem CTA — solid white pill + accent text + arrow +
  // shadow. Visually loud / button-like, contrasts cleanly
  // with the dark-translucent type chip.
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

  // Side cutouts at mid-height — coupon silhouette.
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

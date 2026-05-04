import React, { useCallback } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
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

// Round 5 §1 (post-PR-#35 QA round 4 §8): voucher card rebuilt as a
// premium gradient ticket per user direction "I want it to use
// gradient, the vouchers needs to stand out — voucher shape, all
// the details, spacing, shadow, looks 3D, with animation".
//
// This OVERRIDES round 3 §B3's "single category-colour element per
// card, no rainbow when stacked" rule. The user explicitly asked
// for full vibrant gradient cards modelled on the reference image
// they shared.
//
// Visual anatomy:
//   • Per-type horizontal LinearGradient (light start → deep end)
//     spans the whole card.
//   • Left ~22% gets a white-wash overlay → reads as a lighter
//     "sidebar" tone within the same card.
//   • A 1px white divider at the 22% boundary defines the sidebar
//     edge.
//   • Vertical SHORT type label (BOGO / FREE / SAVE / DEAL / % OFF
//     / £ OFF / LIMITED / REUSE) rotated -90deg in the sidebar.
//   • Two semicircular cutouts (24pt) at the card's vertical
//     midpoint (left + right) — half-outside the card, the
//     inside-half "punches" through the gradient with the page
//     bg colour (#FFFFFF) creating the perforated ticket shape.
//   • Main area: heart top-right, hero £value, title (1–2 lines),
//     description (1 line), bottom row with expiry + Redeem CTA.
//   • Substantial drop shadow (opacity 0.18, radius 16, offset 6)
//     gives the card the "3D" presence the user asked for.
//
// Interaction (per /interaction-design):
//   • Press feedback — scale 0.97 on pressIn (100ms ease-out),
//     restore 1.0 on pressOut (160ms ease-out). Skipped under
//     reduced motion.
//   • Heart toggle — scale 1 → 1.25 → 1 sequence (120ms + 200ms
//     custom ease-out) with overshoot. Skipped under reduced motion.
const TYPE_GRADIENTS: Record<VoucherType, readonly [string, string]> = {
  BOGO:             ['#A78BFA', '#7C3AED'],   // purple
  DISCOUNT_FIXED:   ['#FB7185', '#E20C04'],   // red
  DISCOUNT_PERCENT: ['#FB7185', '#E20C04'],   // red
  FREEBIE:          ['#86EFAC', '#16A34A'],   // green
  SPEND_AND_SAVE:   ['#FDBA74', '#E84A00'],   // orange
  PACKAGE_DEAL:     ['#93C5FD', '#2563EB'],   // blue
  TIME_LIMITED:     ['#FCD34D', '#D97706'],   // amber
  REUSABLE:         ['#5EEAD4', '#0D9488'],   // teal
} as const

const SHORT_LABELS: Record<VoucherType, string> = {
  BOGO:             'BOGO',
  DISCOUNT_FIXED:   '£ OFF',
  DISCOUNT_PERCENT: '% OFF',
  FREEBIE:          'FREE',
  SPEND_AND_SAVE:   'SAVE',
  PACKAGE_DEAL:     'DEAL',
  TIME_LIMITED:     'LIMITED',
  REUSABLE:         'REUSE',
}

const TYPE_LABELS: Record<VoucherType, string> = {
  BOGO:             'BUY ONE, GET ONE FREE',
  DISCOUNT_FIXED:   'MONEY OFF',
  DISCOUNT_PERCENT: 'PERCENTAGE OFF',
  FREEBIE:          'FREE ITEM',
  SPEND_AND_SAVE:   'SPEND & SAVE',
  PACKAGE_DEAL:     'PACKAGE DEAL',
  TIME_LIMITED:     'TIME-LIMITED',
  REUSABLE:         'REUSABLE',
}

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

export function VoucherCard({ voucher, isRedeemed, isFavourited, onPress, onToggleFavourite }: Props) {
  const motionScale = useMotionScale()
  const typeKey = voucher.type as VoucherType
  const gradient = TYPE_GRADIENTS[typeKey] ?? TYPE_GRADIENTS.DISCOUNT_FIXED
  const shortLabel = SHORT_LABELS[typeKey] ?? 'OFFER'
  const typeLabel  = TYPE_LABELS[typeKey] ?? 'OFFER'

  // Press scale + heart scale shared values. Both default to 1.0;
  // motion gates each transition under useMotionScale === 0.
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

  // a11y label uses the FULL descriptive type ("BUY ONE, GET ONE FREE")
  // for screen readers — the visible vertical sidebar is shorthand
  // for sighted users only.
  const a11yLabel =
    `${typeLabel} voucher: ${voucher.title}. Save £${voucher.estimatedSaving}` +
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
        {/* Full-card gradient base */}
        <LinearGradient
          colors={[gradient[0], gradient[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.6 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* White-wash on left 22% — lightens the sidebar tone within
            the same gradient. Sits above the gradient. */}
        <View style={styles.sidebarWash} pointerEvents="none" />

        {/* 1pt white divider at the sidebar/main boundary. Subtle
            but defines the sidebar's right edge. */}
        <View style={styles.sidebarDivider} pointerEvents="none" />

        {/* Vertical short-label, rotated -90deg, centred in the
            sidebar area. */}
        <View style={styles.verticalLabelWrap} pointerEvents="none">
          <Text
            style={styles.verticalLabel}
            numberOfLines={1}
            ellipsizeMode="clip"
          >
            {shortLabel}
          </Text>
        </View>

        {/* Main content area — sits to the right of the sidebar. */}
        <View style={styles.content}>
          {/* Top row: heart top-right. Heart sits in a soft white-
              wash circle so it stays readable on any gradient. */}
          <View style={styles.topRow}>
            <View style={styles.titleWrap}>
              <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
                {voucher.title}
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
                  size={20}
                  color="#FFF"
                  fill={isFavourited ? '#FFF' : 'none'}
                  strokeWidth={2.4}
                />
              </Pressable>
            </Animated.View>
          </View>

          {/* Hero value: £X.XX with OFF suffix. Big white type. */}
          <View style={styles.heroRow}>
            <Text style={styles.heroValue}>£{voucher.estimatedSaving}</Text>
            <Text style={styles.heroSuffix}>OFF</Text>
          </View>

          {/* Optional description — single line. */}
          {voucher.description ? (
            <Text style={styles.description} numberOfLines={1} ellipsizeMode="tail">
              {voucher.description}
            </Text>
          ) : null}

          {/* Bottom row: expiry left, CTA right. */}
          <View style={styles.bottomRow}>
            <Text style={styles.expiry}>
              {isRedeemed ? 'Redeemed this cycle' : (expiryLabel ?? 'No expiry')}
            </Text>
            {isRedeemed ? (
              <Text style={styles.redeemedStamp}>REDEEMED</Text>
            ) : (
              <View style={styles.ctaRow}>
                <Text style={styles.ctaText}>Redeem</Text>
                <ArrowRight size={14} color="#FFF" strokeWidth={2.6} />
              </View>
            )}
          </View>
        </View>

        {/* Side cutouts at vertical midpoint — half-outside, half-on
            the card. The half-on portion paints page bg over the
            gradient, simulating a punched-through hole. Page bg is
            white (round 4 §8 set body to #FFFFFF). */}
        <View style={[styles.notch, styles.notchLeft]} pointerEvents="none" />
        <View style={[styles.notch, styles.notchRight]} pointerEvents="none" />
      </Pressable>
    </Animated.View>
  )
}

// Sidebar width fraction. With cards typically ~335pt wide on a
// 375pt screen with 20pt padding each side, 22% = ~74pt — enough
// for "LIMITED" or "% OFF" rotated text without crowding.
const SIDEBAR_FRACTION = 0.22
const SIDEBAR_WIDTH_PCT = `${SIDEBAR_FRACTION * 100}%`

const NOTCH_SIZE = 24
const NOTCH_HALF = NOTCH_SIZE / 2
const PAGE_BG = '#FFFFFF'

const styles = StyleSheet.create({
  // Shadow lives on a wrapper Animated.View so the card's
  // overflow:hidden (used to clip the gradient corners) doesn't
  // also clip the shadow. iOS shadow rendering needs an unclipped
  // ancestor; this split is the standard fix.
  cardShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    borderRadius: 16,
  },
  card: {
    position: 'relative',
    minHeight: 156,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardRedeemed: {
    opacity: 0.6,
  },
  // Sidebar white-wash overlay. 18% white on top of the gradient
  // lightens the left portion enough to read as a separate tone.
  sidebarWash: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SIDEBAR_WIDTH_PCT,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  sidebarDivider: {
    position: 'absolute',
    top: 12,
    bottom: 12,
    left: SIDEBAR_WIDTH_PCT,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.30)',
  },
  // Vertical label wrap is the size of the sidebar; the inner
  // Text element is rotated -90deg and overflows horizontally
  // (which becomes vertical post-rotation) to render the label
  // running bottom-to-top.
  verticalLabelWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SIDEBAR_WIDTH_PCT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verticalLabel: {
    width: 200,
    textAlign: 'center',
    transform: [{ rotate: '-90deg' }],
    color: '#FFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 4,
  },
  // Content area — sits to the right of the sidebar.
  content: {
    paddingLeft: `${SIDEBAR_FRACTION * 100 + 4}%`,  // sidebar + 4% gap
    paddingRight: 18,
    paddingTop: 16,
    paddingBottom: 14,
    flex: 1,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
    lineHeight: 18,
  },
  favBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 8,
    marginBottom: 6,
  },
  heroValue: {
    color: '#FFF',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 40,
  },
  heroSuffix: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  description: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 10,
  },
  expiry: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.20)',
  },
  ctaText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  redeemedStamp: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.30)',
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

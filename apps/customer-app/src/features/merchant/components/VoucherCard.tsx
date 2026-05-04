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

// Round 5 §2 (post-PR-#35 QA round 5 §1): voucher card rebuilt
// against the customer-web brand palette per user direction "use
// pastel colors, label voucher types properly, refer to our
// website's voucher card. Still want gradient. Make sure things
// are readable."
//
// Source of truth: apps/customer-web/components/merchant-profile/
// VoucherCard.tsx — pastel TYPE_STYLES + sentence-case TYPE_LABELS
// already locked into the brand. This component mirrors those
// tokens, then layers them onto a gradient ticket shape adapted
// for the mobile detail surface.
//
// Per type, three colour roles:
//   • bg     — palest pastel (gradient light end, sidebar surface)
//   • border — slightly deeper pastel (gradient deep end)
//   • stripe — saturated brand colour (text accents, hero value,
//              vertical label, heart fill, CTA)
//
// Readability is now carried by dark text (navy / gray) on the
// pastel gradient — high contrast, no fighting the bright
// gradients-with-white-text pattern from round 5 §1.
type TypeStyle = {
  bg: string
  border: string
  stripe: string
  stripeText: string  // slightly deeper than `stripe` for the
                      // vertical label + hero value, gives more
                      // weight against the pastel surface
}

const TYPE_STYLES: Record<VoucherType, TypeStyle> = {
  BOGO:             { bg: '#F5F3FF', border: '#DDD6FE', stripe: '#7C3AED', stripeText: '#6D28D9' },
  DISCOUNT_FIXED:   { bg: '#FEF2F2', border: '#FECACA', stripe: '#E20C04', stripeText: '#B91C1C' },
  DISCOUNT_PERCENT: { bg: '#FEF2F2', border: '#FECACA', stripe: '#E20C04', stripeText: '#B91C1C' },
  FREEBIE:          { bg: '#F0FDF4', border: '#BBF7D0', stripe: '#16A34A', stripeText: '#15803D' },
  SPEND_AND_SAVE:   { bg: '#FFF7ED', border: '#FED7AA', stripe: '#EA580C', stripeText: '#9A3412' },
  PACKAGE_DEAL:     { bg: '#EFF6FF', border: '#BFDBFE', stripe: '#0284C7', stripeText: '#0369A1' },
  TIME_LIMITED:     { bg: '#FFFBEB', border: '#FDE68A', stripe: '#D97706', stripeText: '#B45309' },
  REUSABLE:         { bg: '#F0FDFA', border: '#99F6E4', stripe: '#0D9488', stripeText: '#0F766E' },
}

const TYPE_LABELS: Record<VoucherType, string> = {
  BOGO:             'Buy One Get One',
  DISCOUNT_FIXED:   'Discount',
  DISCOUNT_PERCENT: 'Discount',
  FREEBIE:          'Freebie',
  SPEND_AND_SAVE:   'Spend & Save',
  PACKAGE_DEAL:     'Package Deal',
  TIME_LIMITED:     'Time Limited',
  REUSABLE:         'Reusable',
}

const FALLBACK_STYLE: TypeStyle = { bg: '#F8F9FA', border: '#E5E7EB', stripe: '#9CA3AF', stripeText: '#4B5563' }

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

// Smart £ formatting per user direction:
//   • Whole pounds → "£5"        (no decimals)
//   • Pennies      → "£5.50"     (always 2 decimals)
// `Number.isInteger` catches the whole-pound case; `toFixed(2)`
// guarantees two decimals for anything else (so 2.5 → "2.50",
// 2.555 → "2.56").
function formatPounds(value: number): string {
  if (Number.isInteger(value)) return `£${value}`
  return `£${value.toFixed(2)}`
}

export function VoucherCard({ voucher, isRedeemed, isFavourited, onPress, onToggleFavourite }: Props) {
  const motionScale = useMotionScale()
  const typeKey = voucher.type as VoucherType
  const style = TYPE_STYLES[typeKey] ?? FALLBACK_STYLE
  const typeLabel = TYPE_LABELS[typeKey] ?? 'Voucher'

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
    `${typeLabel} voucher: ${voucher.title}. Save ${formatPounds(voucher.estimatedSaving)}` +
    (isRedeemed ? '. Already redeemed this cycle' : '')

  return (
    <Animated.View
      style={[
        cardAnimatedStyle,
        styles.cardShadow,
        // Colored shadow tinted toward the type's stripe colour
        // gives each card a subtle "glow" matching the type
        // identity. shadowColor is iOS-only; Android falls back to
        // a neutral elevation shadow.
        { shadowColor: style.stripe },
      ]}
    >
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        style={[styles.card, isRedeemed && styles.cardRedeemed]}
      >
        {/* Pastel gradient base — bg (light) → border (slightly
            deeper). Both within the per-type pastel range, so the
            card stays readable with dark text. */}
        <LinearGradient
          colors={[style.bg, style.border]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.6 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Sidebar tone — slightly deeper pastel, sits over the
            gradient. Reads as a distinct "ticket stub" tone within
            the same card. */}
        <View
          style={[styles.sidebarOverlay, { backgroundColor: style.border }]}
          pointerEvents="none"
        />

        {/* Sidebar/main divider — uses the stripe colour at low
            opacity so the boundary reads on any type's palette. */}
        <View
          style={[styles.sidebarDivider, { backgroundColor: style.stripe + '33' }]}
          pointerEvents="none"
        />

        {/* Vertical sentence-case type label, rotated -90deg.
            stripeText for solid weight against the pastel sidebar. */}
        <View style={styles.verticalLabelWrap} pointerEvents="none">
          <Text
            style={[styles.verticalLabel, { color: style.stripeText }]}
            numberOfLines={1}
            ellipsizeMode="clip"
          >
            {typeLabel}
          </Text>
        </View>

        {/* Main content area — sits to the right of the sidebar. */}
        <View style={styles.content}>
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
                  color={style.stripe}
                  fill={isFavourited ? style.stripe : 'none'}
                  strokeWidth={2.2}
                />
              </Pressable>
            </Animated.View>
          </View>

          {/* Hero value: smart £ formatting, stripeText colour. */}
          <View style={styles.heroRow}>
            <Text style={[styles.heroValue, { color: style.stripeText }]}>
              {formatPounds(voucher.estimatedSaving)}
            </Text>
            <Text style={[styles.heroSuffix, { color: style.stripeText }]}>OFF</Text>
          </View>

          {voucher.description ? (
            <Text style={styles.description} numberOfLines={1} ellipsizeMode="tail">
              {voucher.description}
            </Text>
          ) : null}

          <View style={styles.bottomRow}>
            <Text style={styles.expiry}>
              {isRedeemed ? 'Redeemed this cycle' : (expiryLabel ?? 'No expiry')}
            </Text>
            {isRedeemed ? (
              <Text style={[styles.redeemedStamp, { color: style.stripeText, backgroundColor: style.bg, borderColor: style.border }]}>
                REDEEMED
              </Text>
            ) : (
              <View style={styles.ctaRow}>
                <Text style={[styles.ctaText, { color: style.stripe }]}>Redeem</Text>
                <ArrowRight size={14} color={style.stripe} strokeWidth={2.6} />
              </View>
            )}
          </View>
        </View>

        {/* Side cutouts at the vertical midpoint — half-outside,
            half-on. The on-card half paints the page bg over the
            gradient, simulating a punched-through hole. Page bg is
            white from round 4 §8. */}
        <View style={[styles.notch, styles.notchLeft]} pointerEvents="none" />
        <View style={[styles.notch, styles.notchRight]} pointerEvents="none" />
      </Pressable>
    </Animated.View>
  )
}

const SIDEBAR_FRACTION = 0.22
const SIDEBAR_WIDTH_PCT = `${SIDEBAR_FRACTION * 100}%`

const NOTCH_SIZE = 24
const NOTCH_HALF = NOTCH_SIZE / 2
const PAGE_BG = '#FFFFFF'

const styles = StyleSheet.create({
  // Wrapper for shadow — split from the inner card so the card's
  // overflow:hidden (used to clip gradient corners) doesn't also
  // clip the iOS layer shadow. shadowColor set inline per type.
  cardShadow: {
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
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
    opacity: 0.65,
  },
  sidebarOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SIDEBAR_WIDTH_PCT,
  },
  sidebarDivider: {
    position: 'absolute',
    top: 12,
    bottom: 12,
    left: SIDEBAR_WIDTH_PCT,
    width: 1,
  },
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
    width: 220,
    textAlign: 'center',
    transform: [{ rotate: '-90deg' }],
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  content: {
    paddingLeft: `${SIDEBAR_FRACTION * 100 + 4}%`,
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
    color: '#010C35',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.1,
    lineHeight: 19,
  },
  favBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 8,
    marginBottom: 6,
  },
  heroValue: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 40,
  },
  heroSuffix: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
    opacity: 0.85,
  },
  description: {
    color: '#4B5563',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 17,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 10,
  },
  expiry: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  ctaText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  redeemedStamp: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
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

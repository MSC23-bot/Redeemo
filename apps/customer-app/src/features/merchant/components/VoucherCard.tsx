import React, { useCallback, type ComponentType } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import {
  Heart,
  ArrowRight,
  Gift,
  Tag,
  Percent,
  Sparkles,
  PiggyBank,
  Package,
  Clock,
  RefreshCw,
  type LucideProps,
} from 'lucide-react-native'
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

// Round 5 §21: voucher card visual restored to the §4-era vibrant
// gradient ticket per user direction "I want to change the design
// back to before — the coloring and grading. The only thing I
// didn't want was vertical text. I want all text horizontal".
//
// Restored from §4:
//   • Vibrant per-type LinearGradient (light → deep)
//   • Brand-red corner glow overlay (transparent → 22% red,
//     bottom-right anchored)
//   • Per-type icon watermark (rotated -15deg stamp, 16% white)
//   • White text on saturated gradient
//   • Brand-red tinted shadow
//   • Side cutouts at mid-height (top: 50%)
//
// Kept from §20 (intentional improvements the user asked for):
//   • Horizontal type pill at the top (replaces the vertical
//     rotated sidebar — no more vertical text)
//   • "Save up to" qualifier above the £ hero (honest about
//     max savings)
//   • Prominent Redeem CTA button (white pill on the gradient
//     for max contrast on any colour, brand-red text + arrow)
const TYPE_GRADIENTS: Record<VoucherType, readonly [string, string]> = {
  BOGO:             ['#A78BFA', '#7C3AED'],
  DISCOUNT_FIXED:   ['#FB7185', '#E20C04'],
  DISCOUNT_PERCENT: ['#FB7185', '#E20C04'],
  FREEBIE:          ['#9DE5B6', '#16A34A'],
  SPEND_AND_SAVE:   ['#FDBA74', '#E84A00'],
  PACKAGE_DEAL:     ['#93C5FD', '#2563EB'],
  TIME_LIMITED:     ['#FCDD7A', '#D97706'],
  REUSABLE:         ['#5EEAD4', '#0D9488'],
} as const

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

// Per-type stripe text colour for the type-pill text on white bg.
// Pulled from the customer-web TYPE_STYLES (deeper hue for label
// weight against white surface).
const TYPE_PILL_TEXT: Record<VoucherType, string> = {
  BOGO:             '#6D28D9',
  DISCOUNT_FIXED:   '#B91C1C',
  DISCOUNT_PERCENT: '#B91C1C',
  FREEBIE:          '#15803D',
  SPEND_AND_SAVE:   '#9A3412',
  PACKAGE_DEAL:     '#0369A1',
  TIME_LIMITED:     '#B45309',
  REUSABLE:         '#0F766E',
}

const TYPE_ICONS: Record<VoucherType, ComponentType<LucideProps>> = {
  BOGO:             Gift,
  DISCOUNT_FIXED:   Tag,
  DISCOUNT_PERCENT: Percent,
  FREEBIE:          Sparkles,
  SPEND_AND_SAVE:   PiggyBank,
  PACKAGE_DEAL:     Package,
  TIME_LIMITED:     Clock,
  REUSABLE:         RefreshCw,
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
  const pillText  = TYPE_PILL_TEXT[typeKey] ?? '#4B5563'
  const TypeIcon  = TYPE_ICONS[typeKey] ?? Tag

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
        {/* Vibrant per-type gradient base */}
        <LinearGradient
          colors={[gradient[0], gradient[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.6 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Brand-red corner glow — bottom-right anchor */}
        <View style={styles.brandGlowWrap} pointerEvents="none">
          <LinearGradient
            colors={['rgba(226,12,4,0)', 'rgba(226,12,4,0.22)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        </View>

        {/* Decorative type icon watermark — rotated stamp */}
        {!isRedeemed && (
          <View style={styles.iconWatermark} pointerEvents="none">
            <TypeIcon size={96} color="rgba(255,255,255,0.16)" strokeWidth={1.5} />
          </View>
        )}

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.topRow}>
            {/* Horizontal type pill — replaces the §4 vertical sidebar */}
            <View style={styles.typePill}>
              <TypeIcon size={13} color={pillText} strokeWidth={2.4} />
              <Text style={[styles.typeLabel, { color: pillText }]} numberOfLines={1}>
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
                  size={22}
                  color="#FFF"
                  fill={isFavourited ? '#FFF' : 'none'}
                  strokeWidth={2.4}
                />
              </Pressable>
            </Animated.View>
          </View>

          {/* Hero — "Save up to" + £ amount */}
          <View style={styles.heroBlock}>
            <Text style={styles.heroLabel}>Save up to</Text>
            <Text style={styles.heroAmount}>{formatPounds(voucher.estimatedSaving)}</Text>
          </View>

          <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
            {voucher.title}
          </Text>

          {voucher.description ? (
            <Text style={styles.description} numberOfLines={2} ellipsizeMode="tail">
              {voucher.description}
            </Text>
          ) : null}

          <View style={styles.bottomRow}>
            <Text style={styles.expiry} numberOfLines={1}>
              {isRedeemed ? 'Redeemed this cycle' : (expiryLabel ?? 'No expiry')}
            </Text>
            {isRedeemed ? (
              <View style={styles.redeemedStamp}>
                <Text style={styles.redeemedStampText}>REDEEMED</Text>
              </View>
            ) : (
              <View style={styles.redeemBtn}>
                <Text style={styles.redeemBtnText}>Redeem</Text>
                <ArrowRight size={15} color={BRAND_RED} strokeWidth={2.8} />
              </View>
            )}
          </View>
        </View>

        {/* Side cutouts at mid-height — §4 ticket silhouette */}
        <View style={[styles.notch, styles.notchLeft]} pointerEvents="none" />
        <View style={[styles.notch, styles.notchRight]} pointerEvents="none" />
      </Pressable>
    </Animated.View>
  )
}

const NOTCH_SIZE = 18
const NOTCH_HALF = NOTCH_SIZE / 2
const PAGE_BG = '#FFF9F5'  // round 5 §15 — body matches identity zone top

const styles = StyleSheet.create({
  // Brand-red shadow underneath every card — every voucher casts
  // a Redeemo glow regardless of its type colour.
  cardShadow: {
    shadowColor: BRAND_RED,
    shadowOpacity: 0.24,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    borderRadius: 18,
  },
  card: {
    position: 'relative',
    minHeight: 200,
    borderRadius: 18,
    overflow: 'hidden',
  },
  cardRedeemed: {
    opacity: 0.6,
  },

  // Brand-red glow region — bottom-right corner.
  brandGlowWrap: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: '55%',
    height: '65%',
  },
  // Decorative icon stamp — rotated, low-opacity white,
  // bottom-right corner.
  iconWatermark: {
    position: 'absolute',
    right: 8,
    bottom: 4,
    transform: [{ rotate: '-15deg' }],
  },

  content: {
    padding: 18,
    flex: 1,
    justifyContent: 'space-between',
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 14,
  },
  // White-bg pill on the gradient — type label stays readable on
  // any of the eight type gradients without the §4 vertical
  // sidebar.
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    flexShrink: 1,
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  favBtn: {
    padding: 4,
  },

  heroBlock: {
    marginBottom: 10,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  heroAmount: {
    color: '#FFF',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 40,
    fontVariant: ['tabular-nums'],
  },

  title: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.15,
    lineHeight: 19,
    marginBottom: 6,
  },
  description: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.1,
    lineHeight: 18,
  },

  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 12,
  },
  expiry: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    flexShrink: 1,
  },

  // Prominent Redeem CTA — white pill with brand-red text +
  // ArrowRight. White stands out on every type's gradient (purple
  // / red / green / etc.); brand-red text keeps it distinctly
  // Redeemo. Strong shadow lifts it off the gradient surface.
  redeemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.20,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  redeemBtnText: {
    color: BRAND_RED,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  redeemedStamp: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.30)',
  },
  redeemedStampText: {
    color: '#FFF',
    fontSize: 11,
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

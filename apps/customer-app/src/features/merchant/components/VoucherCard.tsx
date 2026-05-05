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

// Round 5 §22: voucher card synthesises two references the user
// shared, with a clear distinction:
//
//   Ref 1 (coupon/ticket image) → shape only
//     - rounded card with side cutouts at mid-height
//     - "redeemable" ticket silhouette
//     (NOT copied: vertical text, rotated labels, barcode)
//
//   Ref 2 (gift-card image) → colour + finish only
//     - vibrant per-type LinearGradient (saturated premium feel)
//     - soft abstract circle blobs drifting through the bg at
//       ~8–12% white opacity, clipped at the rounded corners
//     - big distinctive per-type icon mark top-left (the
//       voucher's "brand mark", like Amazon's `a`)
//     (NOT copied: Amazon branding, gift card grid, points)
//
//   All text horizontal. Per-type illustration via the 40pt icon.
//   Kept from §21: "Save up to" qualifier, prominent white-pill
//   Redeem CTA with brand-red text, brand-red tinted shadow.
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

// Per-type illustration: the BIG icon mark top-left.
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

        {/* Abstract circle blobs (Ref 2 premium gift-card finish).
            Three soft white circles at low opacity, sized + positioned
            to drift across the card and clip at the rounded corners.
            pointerEvents none so they never block touches. */}
        <View style={[styles.circle, styles.circleA]} pointerEvents="none" />
        <View style={[styles.circle, styles.circleB]} pointerEvents="none" />
        <View style={[styles.circle, styles.circleC]} pointerEvents="none" />

        {/* Content */}
        <View style={styles.content}>
          {/* Top: BIG per-type icon mark + heart */}
          <View style={styles.topRow}>
            <TypeIcon size={40} color="#FFF" strokeWidth={2.2} />
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

          {/* Bottom row: type · expiry meta on the left + Redeem CTA
              on the right. Type label + expiry are separate Text
              nodes (joined with a dot separator) so each remains
              individually findable by tests + accessibility. */}
          <View style={styles.bottomRow}>
            {isRedeemed ? (
              <Text style={styles.metaText} numberOfLines={1}>
                Redeemed this cycle
              </Text>
            ) : (
              <View style={styles.metaRow}>
                <Text style={styles.metaText} numberOfLines={1}>{typeLabel}</Text>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.metaText} numberOfLines={1} ellipsizeMode="tail">
                  {expiryLabel ?? 'No expiry'}
                </Text>
              </View>
            )}
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

        {/* Side cutouts at mid-height — Ref 1 ticket silhouette */}
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
  // Brand-red shadow underneath every card — Redeemo glow
  // regardless of voucher type.
  cardShadow: {
    shadowColor: BRAND_RED,
    shadowOpacity: 0.24,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    borderRadius: 22,
  },
  card: {
    position: 'relative',
    minHeight: 220,
    borderRadius: 22,
    overflow: 'hidden',  // clips circles at corners + lets cutouts work
  },
  cardRedeemed: {
    opacity: 0.6,
  },

  // Abstract circle blobs (Ref 2 inspiration). Three circles of
  // varying sizes, positioned to bleed off the card edges and
  // clip at the rounded corners. White at low opacity so they
  // tint the gradient without overwhelming it.
  circle: {
    position: 'absolute',
    borderRadius: 9999,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  circleA: {
    width: 230,
    height: 230,
    right: -60,
    top: -50,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  circleB: {
    width: 150,
    height: 150,
    left: -50,
    bottom: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  circleC: {
    width: 90,
    height: 90,
    right: 70,
    top: 100,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },

  content: {
    padding: 20,
    flex: 1,
    justifyContent: 'space-between',
  },

  // Top row: 40pt icon mark on the left (the voucher's "brand
  // mark", like Amazon's `a` in Ref 2), heart on the right.
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  favBtn: {
    padding: 4,
  },

  // Hero — "Save up to" small label above big £ amount.
  heroBlock: {
    marginTop: 16,
    marginBottom: 8,
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
    marginBottom: 4,
  },
  description: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.1,
    lineHeight: 18,
  },

  // Bottom row: type · expiry meta line on left, Redeem CTA right.
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
  },
  metaText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  metaDot: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    fontWeight: '700',
    marginHorizontal: 5,
  },

  // Prominent Redeem CTA — white pill with brand-red text + arrow.
  // White stands out on every type's gradient (purple / red /
  // green / etc.); brand-red text keeps it distinctly Redeemo.
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

  // Side cutouts at mid-height — Ref 1 ticket silhouette.
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

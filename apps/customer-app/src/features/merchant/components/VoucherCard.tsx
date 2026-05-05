import React, { useCallback, type ComponentType } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
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

// Round 5 §20: voucher card redesigned per user direction:
//   • "no vertical text — everything horizontal" → vertical
//     sidebar dropped; type label moves to a horizontal pill at
//     the top.
//   • "illustration doesn't blend / text hard to read on some
//     gradients" → light pastel card + dark text (mirrors the
//     customer-web brand voucher card). Always readable
//     regardless of category. Background icon watermark dropped;
//     the type icon now sits inside the top pill.
//   • "Save up to £X (not just £X off)" → hero amount labelled
//     with "Save up to" prefix to be honest about max savings.
//   • "Redeem button must be prominent" → real CTA — solid
//     brand-red pill with white text + ArrowRight + brand-red
//     shadow.
//
// The card uses the per-type TYPE_STYLES tokens already locked
// into the customer-web brand voucher card (apps/customer-web/
// components/merchant-profile/VoucherCard.tsx). bg = palest
// pastel; border = slightly deeper pastel; stripe = saturated
// brand colour for the type icon; stripeText = deeper still for
// the hero amount.

type TypeStyle = {
  bg: string
  border: string
  stripe: string
  stripeText: string
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

const FALLBACK_STYLE: TypeStyle = { bg: '#F8F9FA', border: '#E5E7EB', stripe: '#9CA3AF', stripeText: '#4B5563' }
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
  const typeKey  = voucher.type as VoucherType
  const style    = TYPE_STYLES[typeKey] ?? FALLBACK_STYLE
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
        style={[
          styles.card,
          { backgroundColor: style.bg, borderColor: style.border },
          isRedeemed && styles.cardRedeemed,
        ]}
      >
        {/* BODY */}
        <View style={styles.body}>
          <View style={styles.topRow}>
            <View style={[styles.typePill, { borderColor: style.border }]}>
              <TypeIcon size={14} color={style.stripeText} strokeWidth={2.4} />
              <Text style={[styles.typeLabel, { color: style.stripeText }]} numberOfLines={1}>
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
                  color={style.stripe}
                  fill={isFavourited ? style.stripe : 'none'}
                  strokeWidth={2.2}
                />
              </Pressable>
            </Animated.View>
          </View>

          {/* HERO — "Save up to" + £value (per user: not misleading) */}
          <View style={styles.heroBlock}>
            <Text style={styles.heroLabel}>Save up to</Text>
            <Text style={[styles.heroAmount, { color: style.stripeText }]}>
              {formatPounds(voucher.estimatedSaving)}
            </Text>
          </View>

          <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
            {voucher.title}
          </Text>

          {voucher.description ? (
            <Text style={styles.description} numberOfLines={2} ellipsizeMode="tail">
              {voucher.description}
            </Text>
          ) : null}
        </View>

        {/* PERFORATION — dashed line between body and footer */}
        <View style={styles.perforation}>
          <View style={[styles.dashedLine, { borderTopColor: style.border }]} />
        </View>

        {/* FOOTER — expiry + prominent Redeem CTA */}
        <View style={styles.footer}>
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
              <ArrowRight size={15} color="#FFF" strokeWidth={2.6} />
            </View>
          )}
        </View>

        {/* SIDE CUTOUTS — aligned with the perforation midline */}
        <View style={[styles.notch, styles.notchLeft]} pointerEvents="none" />
        <View style={[styles.notch, styles.notchRight]} pointerEvents="none" />
      </Pressable>
    </Animated.View>
  )
}

const NOTCH_SIZE = 18
const NOTCH_HALF = NOTCH_SIZE / 2
const FOOTER_HEIGHT = 60
const PERFORATION_HEIGHT = 12
const PAGE_BG = '#FFF9F5'  // round 5 §15 — body matches identity zone top

const styles = StyleSheet.create({
  // Shadow on a wrapper so the card's borderRadius doesn't clip
  // the iOS layer shadow.
  cardShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    borderRadius: 18,
  },
  card: {
    position: 'relative',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'visible',  // notches need to overflow
    minHeight: 200,
  },
  cardRedeemed: {
    opacity: 0.6,
  },

  body: {
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 10,
  },
  // Horizontal type pill — replaces the vertical sidebar from §3
  // and earlier rounds. Dashed border echoes the perforation
  // line treatment for a coherent ticket aesthetic.
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    flexShrink: 1,
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  favBtn: {
    padding: 4,
  },

  // Hero block — "Save up to" qualifier above the £ amount, so
  // the card states max savings honestly.
  heroBlock: {
    marginBottom: 12,
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 0.1,
    marginBottom: 2,
  },
  heroAmount: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 40,
    fontVariant: ['tabular-nums'],
  },

  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#010C35',
    letterSpacing: -0.2,
    lineHeight: 21,
    marginBottom: 6,
  },
  description: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4B5563',
    letterSpacing: -0.1,
    lineHeight: 18,
  },

  // Perforation row — dashed line spanning the card width
  // (clears the notch overflow on each side).
  perforation: {
    height: PERFORATION_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: NOTCH_HALF,
  },
  dashedLine: {
    flex: 1,
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },

  // Footer fixed-height anchors the layout so the notches'
  // absolute position aligns with the perforation midline.
  footer: {
    height: FOOTER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    gap: 12,
  },
  expiry: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 0.2,
    flexShrink: 1,
  },

  // Real CTA: brand-red pill, white text, brand-red shadow.
  redeemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: BRAND_RED,
    shadowColor: BRAND_RED,
    shadowOpacity: 0.32,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  redeemBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  redeemedStamp: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  redeemedStampText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#6B7280',
    letterSpacing: 1,
  },

  // Side cutouts — bottom positioned to align with the
  // perforation midline. Perforation top is at FOOTER_HEIGHT;
  // perforation midline is at FOOTER_HEIGHT + PERFORATION_HEIGHT/2;
  // notch bottom is midline - NOTCH_HALF.
  notch: {
    position: 'absolute',
    bottom: FOOTER_HEIGHT + PERFORATION_HEIGHT / 2 - NOTCH_HALF,
    width: NOTCH_SIZE,
    height: NOTCH_SIZE,
    borderRadius: NOTCH_HALF,
    backgroundColor: PAGE_BG,
  },
  notchLeft:  { left:  -NOTCH_HALF },
  notchRight: { right: -NOTCH_HALF },
})

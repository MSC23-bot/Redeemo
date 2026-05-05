import React, { useCallback } from 'react'
import { View, Pressable, StyleSheet, Text as RNText } from 'react-native'
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

// Round 5 §23: voucher card synthesises the two latest references
// the user shared.
//
//   Ref A (current §22 design) — keep
//     • vibrant per-type LinearGradient (saturated brand feel)
//     • coupon/ticket silhouette (side cutouts at mid-height)
//     • "Save up to" qualifier above hero £ amount
//     • prominent white-pill Redeem CTA with brand-red text
//     • brand-red tinted shadow underneath every card
//
//   Ref B (older Redeemo mock-up) — apply
//     • smaller, more compact card (220pt → 168pt minHeight)
//     • single large faint illustration EMBEDDED bottom-right,
//       feels like part of the texture not a slapped-on icon
//     • voucher type label moved to TOP, prominent + readable,
//       full sentence-case names (no acronyms)
//
//   Brand watermark: instead of generic Lucide icons, the
//   embedded illustration is the Redeemo "R" mark itself,
//   rendered in the brand display font (MusticaPro-SemiBold)
//   at very low opacity, sized large enough to bleed off the
//   bottom-right corner — the R becomes part of the gradient
//   texture, not a separate decoration.
//
// All text horizontal. The 40pt top-left Lucide icon is gone.
// The 3 abstract circle blobs are gone (the R is the
// illustration). Card is leaner so 4–5 vouchers fit on screen
// instead of 2–3.

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

        {/* Embedded Redeemo R watermark — bottom-right, bleeds off
            the corner so only the upper-left shoulder of the R is
            visible. Brand display font + low opacity = part of the
            gradient texture rather than a slapped-on icon.
            pointerEvents none so it never blocks touches. */}
        <RNText
          style={styles.watermark}
          allowFontScaling={false}
          accessible={false}
          importantForAccessibility="no"
          pointerEvents="none"
        >
          R
        </RNText>

        {/* Soft glow behind the watermark area to lift it slightly
            from the gradient — keeps the R legible-as-texture
            without competing with content. */}
        <View style={styles.watermarkGlow} pointerEvents="none" />

        {/* Content */}
        <View style={styles.content}>
          {/* Top: voucher type pill on left + heart on right.
              Type label is full readable sentence-case ("Buy One
              Get One", not "BOGO") and lives in a translucent
              white pill so it reads as a chip, not a heading. */}
          <View style={styles.topRow}>
            <View style={styles.typePill}>
              <Text style={styles.typePillText} numberOfLines={1}>
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
                  size={20}
                  color="#FFF"
                  fill={isFavourited ? '#FFF' : 'none'}
                  strokeWidth={2.4}
                />
              </Pressable>
            </Animated.View>
          </View>

          {/* Hero — "Save up to" qualifier (honest about max
              savings) + big £ amount. */}
          <View style={styles.heroBlock}>
            <Text style={styles.heroLabel}>Save up to</Text>
            <Text style={styles.heroAmount}>{formatPounds(voucher.estimatedSaving)}</Text>
          </View>

          <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
            {voucher.title}
          </Text>

          {voucher.description ? (
            <Text style={styles.description} numberOfLines={1} ellipsizeMode="tail">
              {voucher.description}
            </Text>
          ) : null}

          {/* Bottom row: expiry meta on left + Redeem CTA on
              right. Type label has moved up top so this row is
              just the small expiry signal + the redeem call. */}
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
                <Text style={styles.redeemBtnText}>Redeem</Text>
                <ArrowRight size={14} color={BRAND_RED} strokeWidth={2.8} />
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

const NOTCH_SIZE = 16
const NOTCH_HALF = NOTCH_SIZE / 2
const PAGE_BG = '#FFF9F5'  // round 5 §15 — body matches identity zone top

const styles = StyleSheet.create({
  // Brand-red shadow underneath every card — Redeemo glow
  // regardless of voucher type.
  cardShadow: {
    shadowColor: BRAND_RED,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 9,
    borderRadius: 20,
  },
  // §23: 220 → 168 minHeight. ~24% slimmer card so the voucher
  // list reads as a tight stack of redeemable offers, like the
  // older Redeemo mock-up (Ref B), rather than oversized hero
  // cards (Ref A's footprint).
  card: {
    position: 'relative',
    minHeight: 168,
    borderRadius: 20,
    overflow: 'hidden',  // clips the R watermark off the corner
  },
  cardRedeemed: {
    opacity: 0.6,
  },

  // §23 embedded illustration: a single massive Redeemo "R" in
  // the brand display font, positioned to bleed off the
  // bottom-right corner. White at low opacity so it tints the
  // gradient (part of the texture) rather than competing with
  // the content layer above it. The lineHeight is forced equal
  // to fontSize so RN doesn't add line-box descender padding —
  // the glyph sits exactly where we put it.
  watermark: {
    position: 'absolute',
    right: -32,
    bottom: -56,
    fontSize: 220,
    lineHeight: 220,
    fontFamily: 'MusticaPro-SemiBold',
    color: 'rgba(255,255,255,0.13)',
    letterSpacing: -8,
    includeFontPadding: false,
  },
  // Subtle radial-ish glow under the R area to make sure the
  // watermark reads as embedded depth rather than just a paler
  // patch. White at very low opacity, large soft circle in the
  // bottom-right quadrant.
  watermarkGlow: {
    position: 'absolute',
    right: -50,
    bottom: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },

  // §23: padding 20 → 18 to match the slimmer card.
  content: {
    padding: 18,
    flex: 1,
    justifyContent: 'space-between',
  },

  // §23 top row: type pill on the left, heart on the right.
  // The type pill replaces the previous 40pt top-left icon —
  // same eye-catch position, but a readable label instead of a
  // generic icon ("Buy One Get One" vs Lucide Gift glyph).
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typePill: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    flexShrink: 1,
  },
  typePillText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  favBtn: {
    padding: 4,
  },

  // §23: hero block tightens — heroAmount 36 → 30pt to fit the
  // shorter card while staying the dominant visual.
  heroBlock: {
    marginTop: 10,
    marginBottom: 4,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginBottom: 1,
  },
  heroAmount: {
    color: '#FFF',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 34,
    fontVariant: ['tabular-nums'],
  },

  // §23: title 15 → 14pt; description 13 → 12pt + single line.
  // The card is slimmer, so we let title eat the space and
  // truncate description to one line — keeps the visual balance
  // tight without losing the offer detail.
  title: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.15,
    lineHeight: 18,
    marginBottom: 2,
  },
  description: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: -0.1,
    lineHeight: 16,
  },

  // §23 bottom row: just expiry meta on left + Redeem CTA right.
  // Type label has moved up to the top pill, so this row no
  // longer carries the type · expiry chain.
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 12,
  },
  metaText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    flexShrink: 1,
  },

  // §23: prominent Redeem CTA stays — slightly tighter padding
  // to match the slimmer card, but the visual weight (white
  // pill + brand-red text + arrow) is unchanged.
  redeemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  redeemBtnText: {
    color: BRAND_RED,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  redeemedStamp: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.30)',
  },
  redeemedStampText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  // Side cutouts at mid-height — coupon/ticket silhouette.
  // Slightly smaller than §22 (16 vs 18) to match the leaner
  // card proportions.
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

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

// Round 5 §28: corrects the §27 mistake of trying to manually
// reconstruct the brand R as SVG paths — the result looked
// disfigured and didn't read as the Redeemo logo. Reverted to
// the official PNG asset (apps/customer-app/assets/redeemo-r-
// mark.png, copied from the brand pack's "Iconic Version 1.png"
// at 1081×1080), tinted white at low opacity for a single
// faint flat watermark. No more fake internal structure.
//
// Other refinements against the on-device QA:
//
//   1. Brand R uses the OFFICIAL asset. tintColor white +
//      opacity 0.10 → recognisable Redeemo R silhouette,
//      faint, embedded as background motif. No more manual
//      reconstruction.
//
//   2. CTA returned to bottom-RIGHT (was bottom-left in §26).
//      The bottom-right is the natural action position for
//      "tap to redeem". The R is sized + placed so the
//      bottom-right is empty when the CTA arrives — they
//      don't overlap.
//
//   3. Layout — three vertical zones on the right column:
//        a) heart at top-right (16pt)
//        b) brand R at right-CENTER (100×100, fully visible)
//        c) Redeem CTA at bottom-right
//      Each zone has clean space; nothing covers the R.
//
//   4. Description font 11pt → 12pt, lineHeight 15 → 16.
//      Body text on mobile should be ≥12pt; the on-device QA
//      flagged the description as too small for normal users
//      to read at a glance. Card grows ~3pt vertically — fine
//      because readability wins over compactness.
//
//   5. Hero stays stacked ("Save up to" eyebrow above £hero)
//      from §27.
//
//   6. Type chip stays §26's dark-translucent style — strong
//      contrast on every gradient (especially FREEBIE),
//      clearly different surface from the white CTA pill.
//
//   7. Background shape character — kept the §27 subtle white
//      blobs (top-right + bottom-left, both at 0.05 opacity)
//      so the card doesn't read as a flat block of colour.
//
// Behaviour preserved across §22 → §28:
//   • side cutouts at mid-height (coupon silhouette)
//   • per-type 3-stop gradient with brand-red drop shadow
//   • horizontal text only
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

        {/* §27 subtle background shapes — kept. Two faint white
            blobs that bleed off corners. */}
        <View style={styles.shapeA} pointerEvents="none" />
        <View style={styles.shapeB} pointerEvents="none" />

        {/* §28 brand R watermark — OFFICIAL PNG asset, tinted
            white at 0.10 opacity. Single faint flat silhouette,
            recognisable as the Redeemo R. No more manual SVG
            reconstruction. Sized + positioned at right-center
            so the heart sits cleanly above and the bottom-right
            CTA sits cleanly below. */}
        <View style={styles.watermarkWrap} pointerEvents="none">
          <Image
            source={require('../../../../assets/redeemo-r-mark.png')}
            style={styles.watermark}
            resizeMode="contain"
            accessible={false}
          />
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
    minHeight: 150,
    borderRadius: 20,
    overflow: 'hidden',
  },
  cardRedeemed: {
    opacity: 0.6,
  },

  // Subtle white background blobs — premium gradient texture.
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

  // §28 brand watermark — OFFICIAL PNG asset, single flat
  // silhouette tinted white. 100×100 sits in the right-center
  // column. Heart above (top:14-30), CTA below (bottom row).
  watermarkWrap: {
    position: 'absolute',
    right: 14,
    top: 36,
    width: 100,
    height: 100,
  },
  watermark: {
    width: '100%',
    height: '100%',
    tintColor: '#FFFFFF',
    opacity: 0.10,
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

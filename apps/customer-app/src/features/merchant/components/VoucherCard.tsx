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

// Round 5 §24: refinements on §23 against the user's 10-point QA.
//
//   1.  Card height 168 → 150pt (~11% slimmer).
//   2.  Tighter internal grid: padding 18 → 14, hero block
//       baseline-aligned ("Save up to" eyebrow + £hero side by
//       side, not stacked vertically), rows packed without
//       `justifyContent: space-between` so nothing floats.
//   3.  Description goes from 1 line → 2 lines so it stops
//       truncating to garbage like `coff…`.
//   4.  Type pill strengthened: solid white-tinted bg + the
//       deep accent of the gradient as text colour. The pill
//       is now a confident type signal, colour-coded per
//       voucher type, premium feel kept.
//   5.  Redeem CTA pulled into the natural content flow (no
//       more `space-between` push to the bottom edge) so it
//       sits on the grid line under description, not floating.
//   6.  R watermark switched from a typographic Mustica `R` to
//       the actual Redeemo brand mark PNG (the ribbon-R with
//       built-in voucher notches). Tinted white, opacity 0.12,
//       sized + positioned to embed in the bottom-right rather
//       than bleed harshly off the corner. Faint same-colour
//       gradient blob underneath for the "background
//       illustration" feel the user asked for.
//   7.  Heart 20 → 17pt; unfavourited stroke at 0.85 opacity so
//       it whispers instead of shouting.
//   8.  Expiry copy: sentence-case ("No expiry", "Expires 28
//       Dec") — the previous all-caps `NO EXPIRY` is gone.
//   9.  Subtle depth: 1px white-tinted top edge highlight (a
//       soft glassy lip), and the brand-red shadow stack stays.
//  10.  Contrast: gradients now use a 3-stop curve with the
//       deep accent holding from 40% to 100% so white text is
//       readable across every voucher type, including FREEBIE
//       (the lightest start). Light starts deepened slightly
//       on FREEBIE / TIME_LIMITED / REUSABLE.
//
// Type label copy also updated for full-readable sentence-case
// per the user's brief: "Buy one, get one free", "Package
// deal", "Time limited", "Spend & save".

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
        {/* §24 contrast: 3-stop gradient — light start, then the
            deep accent holds from ~40% to 100%. White text is
            readable across the whole card on every type. */}
        <LinearGradient
          colors={[gradient[0], gradient[1], gradient[1]]}
          locations={[0, 0.45, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* §24 background illustration: soft same-colour glow in
            the bottom-right quadrant, lighter than the gradient
            so it suggests depth without competing with text.
            Sits behind the brand R watermark for a layered
            "the R is embedded in a glow" effect. */}
        <View style={[styles.bgGlow, { backgroundColor: gradient[0] }]} pointerEvents="none" />

        {/* §24 R watermark: actual Redeemo brand R (the ribbon
            mark with built-in voucher notches), tinted white at
            low opacity so it reads as embedded texture rather
            than a stamped icon. Sized + positioned so the bulk
            of the R sits inside the card's bottom-right
            quadrant, with just the bottom tail bleeding off the
            corner — more elegant than the previous typographic
            R that bled half off-screen. Wrapped in a View so we
            can put pointerEvents="none" on the wrapper (Image
            doesn't accept the prop directly). */}
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
          {/* Row 1: voucher type pill (left) + heart (right).
              Pill is solid white-tinted bg + accent text — a
              confident, premium, colour-coded type chip. */}
          <View style={styles.topRow}>
            <View style={styles.typePill}>
              <Text style={[styles.typePillText, { color: accent }]} numberOfLines={1}>
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
                  size={17}
                  color={isFavourited ? '#FFFFFF' : 'rgba(255,255,255,0.85)'}
                  fill={isFavourited ? '#FFF' : 'none'}
                  strokeWidth={2.4}
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

  // §24 background illustration: soft same-colour glow circle
  // in the bottom-right quadrant. Sits behind the R watermark
  // and lifts it from the deeper gradient end. Background-only,
  // pointerEvents none.
  bgGlow: {
    position: 'absolute',
    right: -60,
    bottom: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    opacity: 0.30,
  },

  // §24 brand watermark: the actual Redeemo R PNG, tinted white,
  // sized so the bulk sits inside the bottom-right quadrant
  // (only the bottom tail trails off the edge). 0.12 opacity so
  // the R reads as part of the gradient texture, not a stamped
  // icon. Source PNG is 1081×1080 — RN scales down cleanly.
  watermarkWrap: {
    position: 'absolute',
    right: -10,
    bottom: -22,
    width: 130,
    height: 130,
  },
  watermark: {
    width: '100%',
    height: '100%',
    tintColor: '#FFFFFF',
    opacity: 0.12,
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
  // §24 type pill: solid white-tinted bg + accent text (the
  // deep stop of the gradient). Reads confidently on every
  // gradient because the text colour matches the deepest
  // brand colour of the card.
  typePill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.95)',
    flexShrink: 1,
    alignSelf: 'flex-start',
  },
  typePillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.1,
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
  heroLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  heroAmount: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.6,
    lineHeight: 30,
    fontVariant: ['tabular-nums'],
  },

  title: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.15,
    lineHeight: 18,
    marginBottom: 2,
  },
  // §24: description gets 2 lines — fixes the §23 `coff…`
  // truncation. Line height tight so two lines stay compact.
  description: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: -0.05,
    lineHeight: 15,
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

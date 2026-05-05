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

// Round 5 §4 (impeccable polish on §3): six tightenings against
// shared design laws — typography hierarchy at 1.25×+ ratios,
// OKLCH chroma calibration on the two light-end gradients flagged
// as garish (FREEBIE / TIME_LIMITED), notch refinement (24 → 18pt
// for sharper ticket detail), sidebar wash dialed back (18 → 14%
// — more refined section break), heart fav simplified (drop the
// disconnected wash circle, just the icon), brand glow tightened
// (28 → 22% peak opacity).
//
// Round 5 §3 base notes preserved below for traceability.
// ───────────────────────────────────────────────────────────────
// Round 5 §3: voucher card colours restored to the vibrant per-
// type gradient from §1, sentence-case labels carried over from §2,
// plus a brand-red glow + brand-red shadow tying every card back to
// Redeemo identity, plus a 2-line description so the description
// never truncates mid-thought.
//
// User direction:
//   "Change the color back to what it was just before. Add our
//    branding into this voucher as well — each voucher has its own
//    unique colour but include a blend or glow of our branding.
//    The description is going out and doesn't quite fit — if it
//    needs two lines, use two lines."
//
// Design decisions:
//   • Vibrant gradients (per-type, light → deep) restored from §1.
//     White text reads as high contrast against these saturated
//     surfaces — the §2 pastel-with-dark-text approach is reverted.
//   • Sentence-case labels (from §2 / web brand) retained:
//     "Buy One Get One" / "Discount" / "Freebie" etc. Visually
//     rendered uppercase in the vertical sidebar via
//     textTransform — keeps the data side aligned with the web
//     brand while the visual rhythm matches the all-caps reference
//     design pattern.
//   • Brand-red glow: a corner-anchored linear gradient overlay
//     painted bottom-right at ~25% peak opacity. Every voucher,
//     regardless of type, gets a subtle warm bleed from the brand
//     colour — consistent identity cue without overriding the
//     type's unique gradient.
//   • Brand-red shadow: shadowColor unified to `#E20C04` across
//     all cards. The cards "cast" a brand-red glow underneath
//     them — every card looks like it belongs to Redeemo
//     regardless of its individual type.
//   • Description: numberOfLines 1 → 2, card minHeight 156 → 168
//     so the second line fits without crowding the bottom row.
//   • Smart £ formatting from §2 retained ("£5" whole, "£5.50"
//     pennies).
// Round 5 §4 OKLCH calibration: the deep ends carry the type's
// brand identity (kept saturated). The light ends are tuned so
// chroma reduces toward high lightness — impeccable's "reduce
// chroma as lightness approaches 100" rule. Two pairs flagged as
// garish in §3 audit:
//   FREEBIE light  #86EFAC (L 0.86 C 0.20) → #9DE5B6 (L 0.85 C 0.12)
//   TIME_LIMITED   #FCD34D (L 0.88 C 0.16) → #FCDD7A (L 0.88 C 0.12)
// Other light ends sit within the chroma-at-lightness ceiling.
const TYPE_GRADIENTS: Record<VoucherType, readonly [string, string]> = {
  BOGO:             ['#A78BFA', '#7C3AED'],   // purple
  DISCOUNT_FIXED:   ['#FB7185', '#E20C04'],   // red
  DISCOUNT_PERCENT: ['#FB7185', '#E20C04'],   // red
  FREEBIE:          ['#9DE5B6', '#16A34A'],   // green (light end calibrated)
  SPEND_AND_SAVE:   ['#FDBA74', '#E84A00'],   // orange
  PACKAGE_DEAL:     ['#93C5FD', '#2563EB'],   // blue
  TIME_LIMITED:     ['#FCDD7A', '#D97706'],   // amber (light end calibrated)
  REUSABLE:         ['#5EEAD4', '#0D9488'],   // teal
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

// Round 5 §3 icon watermarks. Each type gets a thematic lucide icon
// rendered large (96pt) at low opacity in the bottom-right corner —
// adds visual interest without competing with the title / hero /
// description text.
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
//   • Whole pounds → "£5"     (no decimals)
//   • Pennies      → "£5.50"  (always 2 decimals)
function formatPounds(value: number): string {
  if (Number.isInteger(value)) return `£${value}`
  return `£${value.toFixed(2)}`
}

export function VoucherCard({ voucher, isRedeemed, isFavourited, onPress, onToggleFavourite }: Props) {
  const motionScale = useMotionScale()
  const typeKey = voucher.type as VoucherType
  const gradient = TYPE_GRADIENTS[typeKey] ?? TYPE_GRADIENTS.DISCOUNT_FIXED
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
    `${typeLabel} voucher: ${voucher.title}. Save ${formatPounds(voucher.estimatedSaving)}` +
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
        {/* Vibrant per-type gradient base. */}
        <LinearGradient
          colors={[gradient[0], gradient[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.6 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Brand-red glow overlay — corner-anchored linear gradient
            sitting over the type gradient. Paints a soft warm
            bleed from the bottom-right corner that ties every
            voucher back to Redeemo identity, regardless of type.
            The gradient runs transparent → semi-opaque red, so it
            concentrates at the corner and fades into the type's
            colour toward the centre. */}
        <View style={styles.brandGlowWrap} pointerEvents="none">
          <LinearGradient
            colors={['rgba(226,12,4,0)', 'rgba(226,12,4,0.22)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        </View>

        {/* Type icon watermark — large lucide icon (96pt) in white
            at low opacity, positioned in the bottom-right corner
            (over the brand-red glow). Rendered before content so
            it sits behind the title / hero / description text.
            Adds visual interest tied to the voucher's purpose
            (Gift for BOGO, Tag for Discount, PiggyBank for Spend
            & Save, etc.) without crowding the readable content. */}
        <View style={styles.iconWatermark} pointerEvents="none">
          <TypeIcon size={96} color="rgba(255,255,255,0.16)" strokeWidth={1.5} />
        </View>

        {/* Sidebar white-wash — lightens the left 22% so the
            sidebar reads as a separate ticket-stub tone. */}
        <View style={styles.sidebarWash} pointerEvents="none" />

        {/* Sidebar/main divider. */}
        <View style={styles.sidebarDivider} pointerEvents="none" />

        {/* Vertical sentence-case label, rendered uppercase via
            textTransform for visual rhythm against the bright
            gradient — sentence case in the data, all-caps in
            the visual. */}
        <View style={styles.verticalLabelWrap} pointerEvents="none">
          <Text
            style={styles.verticalLabel}
            numberOfLines={1}
            ellipsizeMode="clip"
          >
            {typeLabel}
          </Text>
        </View>

        {/* Main content area. */}
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
                  color="#FFF"
                  fill={isFavourited ? '#FFF' : 'none'}
                  strokeWidth={2.4}
                />
              </Pressable>
            </Animated.View>
          </View>

          {/* Hero value: smart £ formatting + OFF suffix. */}
          <View style={styles.heroRow}>
            <Text style={styles.heroValue}>{formatPounds(voucher.estimatedSaving)}</Text>
            <Text style={styles.heroSuffix}>OFF</Text>
          </View>

          {/* Description: 2 lines so it doesn't truncate
              mid-thought. */}
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
              <Text style={styles.redeemedStamp}>REDEEMED</Text>
            ) : (
              <View style={styles.ctaRow}>
                <Text style={styles.ctaText}>Redeem</Text>
                <ArrowRight size={14} color="#FFF" strokeWidth={2.6} />
              </View>
            )}
          </View>
        </View>

        {/* Side cutouts. */}
        <View style={[styles.notch, styles.notchLeft]} pointerEvents="none" />
        <View style={[styles.notch, styles.notchRight]} pointerEvents="none" />
      </Pressable>
    </Animated.View>
  )
}

const SIDEBAR_FRACTION = 0.22
const SIDEBAR_WIDTH_PCT = `${SIDEBAR_FRACTION * 100}%`

// Round 5 §4: notch 24 → 18pt. 24pt cuts read as cartoonish; 18pt
// gives the perforation the proportion of a real ticket stub.
const NOTCH_SIZE = 18
const NOTCH_HALF = NOTCH_SIZE / 2
const PAGE_BG = '#FFFFFF'

const styles = StyleSheet.create({
  // Brand-red shadow unified across all cards. iOS only — Android
  // falls back to the elevation default (neutral grey).
  // Round 5 §4 shadow: brand-red unified across all cards (every
  // voucher casts a Redeemo glow). Opacity dialed to 0.24 — was
  // 0.28, a touch too smoky for the off-white body. Corner radius
  // 16 → 18 follows the notch refinement (more premium softness).
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
    minHeight: 168,
    borderRadius: 18,
    overflow: 'hidden',
  },
  cardRedeemed: {
    opacity: 0.6,
  },
  // Brand-red glow region — bottom-right corner, ~55% × 65% of the
  // card. The internal LinearGradient (transparent → 28% red, TL →
  // BR) concentrates the warm bleed in the corner and fades it
  // out toward the centre.
  brandGlowWrap: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: '55%',
    height: '65%',
  },
  // Round 5 §4: rotation -12° → -15° gives the icon stronger
  // postage-stamp character; opacity dropped to 16% (from 20%) so
  // it reads as a true watermark and doesn't crowd the description
  // text overlapping above it.
  iconWatermark: {
    position: 'absolute',
    right: 8,
    bottom: 4,
    transform: [{ rotate: '-15deg' }],
  },
  // Round 5 §4: 18% → 14% white wash. 18% read as faded-out and
  // washed; 14% is a more refined section break — present enough
  // to define the sidebar but not flattening the gradient
  // underneath.
  sidebarWash: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SIDEBAR_WIDTH_PCT,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  sidebarDivider: {
    position: 'absolute',
    top: 12,
    bottom: 12,
    left: SIDEBAR_WIDTH_PCT,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.30)',
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
    color: '#FFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2.2,
    textTransform: 'uppercase',
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
  // Round 5 §4 typography hierarchy (impeccable's ≥1.25× rule):
  //   hero £value 32pt 900   — primary
  //   title       15pt 700   — secondary  (32 / 15 ≈ 2.13×)
  //   description 12pt 500   — tertiary   (15 / 12 = 1.25×)
  //   expiry      10pt 700   — quaternary  (12 / 10 = 1.20×, but
  //     differentiated by weight + uppercase letter-spacing
  //     instead, matching the impeccable advice that hierarchy
  //     can land via weight + size combined)
  // Title up from 14 → 15pt closes the formerly flat 14/12 gap.
  title: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.15,
    lineHeight: 19,
  },
  // Round 5 §4: dropped the wash-circle bg. The heart icon at 22pt
  // with 2.4 stroke reads cleanly against any gradient + brand-red
  // glow combination; the bg circle was visual noise that
  // disconnected the icon from the card surface.
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
    marginTop: 6,
    marginBottom: 4,
  },
  // Round 5 §4: tabular-nums via fontVariant so "£5" / "£5.50" /
  // "£12" line up at consistent widths if the same merchant has
  // multiple cards on screen — a small typographic correctness
  // detail that elevates the surface.
  heroValue: {
    color: '#FFF',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 36,
    fontVariant: ['tabular-nums'],
  },
  heroSuffix: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  // Round 5 §19 (impeccable typography pass): description bumped
  // 12 → 13pt with lineHeight 16 → 18 (1.38) for prose breathing.
  // letterSpacing -0.1 tightens body text for refinement.
  description: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    letterSpacing: -0.1,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 10,
  },
  // Round 5 §4: expiry differentiated from description by WEIGHT
  // + letter-spacing, not just size. 10pt 700 with tracked uppercase
  // letterSpacing reads as a "stamp date" badge, distinct in role
  // from the descriptive 12pt 500 description above.
  // Round 5 §19: expiry bumped 10 → 11pt for readability while
  // keeping its uppercase-tracked "stamp date" treatment.
  expiry: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
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
  // Round 5 §19: CTA bumped 12 → 13pt — "Redeem" reads as a real
  // call-to-action, not a tiny pill label.
  ctaText: {
    color: '#FFF',
    fontSize: 13,
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

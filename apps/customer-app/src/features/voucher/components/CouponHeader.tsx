import React from 'react'
import { View, Pressable, StyleSheet, Platform } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import {
  ArrowLeft, Heart, Share2, Tag, Gift, Percent, Clock, Package, RefreshCw, Coins,
} from 'lucide-react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { lightHaptic } from '@/design-system/haptics'
import type { VoucherType } from '@/lib/api/voucher'
import { voucherGradient, voucherTypeLabel, formatPounds } from '../utils/voucherTheme'

type Props = {
  type: VoucherType
  title: string
  description: string | null
  estimatedSaving: number
  /** Top safe-area inset (status bar / notch). */
  insetTop: number
  /**
   * Nav callbacks. The NavRow lives INSIDE the header so it scrolls
   * away with the hero (per v4 mockup). Scrolling to the top shows
   * the nav; scrolling past the hero hides it.
   */
  onBack:  () => void
  onShare: () => void
  onFav:   () => void
  isFavourited: boolean
  /**
   * Driven by the parent screen's `useAnimatedScrollHandler`. The
   * hero NavRow opacity is interpolated INVERSELY to the
   * CollapsedHeader's opacity so they crossfade across the same
   * scroll range. Optional — if absent, hero NavRow is always opaque
   * (used by tests / fallback rendering).
   */
  scrollY?: SharedValue<number>
  /**
   * Inverse-opacity range. Hero NavRow stays opaque from scrollY=0
   * to `fadeStart`, fades 1→0 across [fadeStart, fadeEnd], stays at
   * 0 above. Optional sibling of `scrollY`.
   */
  fadeStart?: number
  fadeEnd?:   number
  /**
   * JS state derived from `useAnimatedReaction(scrollY > HANDOFF_AT)`
   * in the parent. When TRUE, the collapsed header is the tappable
   * nav and this hero NavRow is non-tappable. When FALSE, this hero
   * NavRow is the tappable nav. Single threshold ⇒ no scroll range
   * with both layers tappable, no scroll range with neither tappable.
   * Optional — defaults to false (NavRow tappable).
   */
  collapsedActive?: boolean
  /**
   * PR-B T8h fix — selective hero dim for the redeemed-this-cycle
   * state. When TRUE, applies opacity 0.55 to the gradient backdrop +
   * type badge + title + description + save badge so the voucher
   * reads as visibly "stamped redeemed". The nav row (back / share /
   * favourite) is INTENTIONALLY excluded from the dim so action
   * controls stay full opacity and tappable-looking.
   *
   * Replaces the previous wrapping `<View style={heroDimmed}>` in
   * VoucherDetailScreen which dimmed the entire CouponHeader subtree
   * including the nav buttons (owner-reported device QA: "navigation
   * buttons are washed out").
   */
  dimmed?: boolean
  /**
   * M4d hero-mounted status block — TIME_LIMITED only. When `type ===
   * 'TIME_LIMITED'` AND this prop is provided, the description slot is
   * replaced by statusBlock. For non-TL voucher types this prop is
   * ignored (description renders unchanged). When type IS TIME_LIMITED
   * but statusBlock is null/undefined (e.g. transient Phase G-not-yet-
   * wired state), the description slot is suppressed entirely — no
   * fallback to description copy. Spec D6(C) lock + Phase B/C wiring.
   */
  statusBlock?: React.ReactNode
}

const typeIcon = (type: VoucherType) => {
  switch (type) {
    case 'BOGO':             return Gift
    case 'DISCOUNT_FIXED':
    case 'DISCOUNT_PERCENT': return Percent
    case 'FREEBIE':          return Gift
    case 'SPEND_AND_SAVE':   return Coins
    case 'PACKAGE_DEAL':     return Package
    case 'TIME_LIMITED':     return Clock
    case 'REUSABLE':         return RefreshCw
    default:                 return Tag
  }
}

const WHITE     = '#FFFFFF'
const WHITE_92  = 'rgba(255,255,255,0.92)'
const WHITE_80  = 'rgba(255,255,255,0.80)'

// Vertical room reserved for the NavRow rendered at the top of the
// header (44pt button + 8pt offset + 16pt breathing). Larger than the
// previous 58pt to give the title meaningful clear space below the
// nav on iPhone Pro Max + match v4 mockup's 100px top padding.
const NAV_ROOM = 68

/**
 * Top of the coupon — type-coloured gradient hero with the frosted
 * NavRow scrolled into the hero (per v4 mockup §vd-topnav, which
 * absolutely-positions the nav INSIDE the .coupon-header so it
 * scrolls away when the user scrolls past the hero).
 *
 * Sizing target: iPhone 17 Pro Max (440pt logical width) — content
 * sized to feel proportionally similar to v4's 390pt reference
 * device. Scale-ups vs v4: title 26→30pt, save badge 80→92pt,
 * type badge 11→12pt, description 13→15pt, min-height 260→300.
 */
export function CouponHeader({
  type,
  title,
  description,
  estimatedSaving,
  insetTop,
  onBack,
  onShare,
  onFav,
  isFavourited,
  scrollY,
  fadeStart,
  fadeEnd,
  collapsedActive = false,
  dimmed = false,
  statusBlock,
}: Props) {
  const gradient  = voucherGradient(type)
  const typeLabel = voucherTypeLabel(type)
  const Icon      = typeIcon(type)
  const reducedMotion = useReducedMotion()

  const paddingTop = insetTop + NAV_ROOM

  // PR-B T8h fix — selective hero dim for the redeemed-this-cycle
  // state.  When `dimmed` is true, opacity 0.55 applies to the
  // gradient backdrop + content + saveBadge ONLY.  The navRow NEVER
  // receives the dim so the back / share / favourite controls stay
  // full opacity and tappable-looking (owner-locked at T8h: "navigation
  // buttons are washed out").  The flat-opacity treatment is the
  // approved Voucher Detail hero behaviour — the more elaborate
  // "premium washed-out gradient" experiment from T8h was reverted
  // at T8i because it was applied to the wrong surface.
  const dimStyle = dimmed ? styles.dimmed : null

  // Hero NavRow opacity — interpolated INVERSELY to CollapsedHeader
  // (which fades IN across the same range). When scrollY/fadeStart/
  // fadeEnd are absent (legacy / test usage) the NavRow stays opaque
  // at all scroll positions.
  const navAnimStyle = useAnimatedStyle(() => {
    if (!scrollY || fadeStart === undefined || fadeEnd === undefined) {
      return { opacity: 1 }
    }
    if (reducedMotion) {
      return { opacity: scrollY.value >= fadeEnd ? 0 : 1 }
    }
    return {
      opacity: interpolate(
        scrollY.value,
        [fadeStart, fadeEnd],
        [1, 0],
        Extrapolation.CLAMP,
      ),
    }
  })

  return (
    <View style={[styles.root, { paddingTop }]} testID="coupon-header">
      {/* Base type gradient — dimmed when the voucher is stamped
          redeemed (PR-B T8h fix). */}
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFillObject, dimStyle]}
        testID="coupon-header-gradient"
      />
      {/* Vertical vignette — slight darken at top + bottom for depth.
          Also dimmed alongside the base gradient. */}
      <LinearGradient
        colors={['rgba(0,0,0,0.10)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.30)']}
        locations={[0, 0.4, 1]}
        style={[StyleSheet.absoluteFillObject, dimStyle]}
        pointerEvents="none"
      />
      {/* Highlight wash (approximated radial via diagonal). */}
      <LinearGradient
        colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']}
        start={{ x: 0.2, y: 0.85 }}
        end={{ x: 0.85, y: 0.2 }}
        style={[StyleSheet.absoluteFillObject, dimStyle]}
        pointerEvents="none"
      />

      {/* NavRow lives INSIDE the hero so it scrolls away with it.
          Wrapped in Animated.View so its opacity crossfades inversely
          to the CollapsedHeader. `pointerEvents` driven by
          collapsedActive (single-threshold JS state in parent) so
          there's never a scroll range where both nav layers — or
          neither — are tappable. */}
      <Animated.View
        style={[styles.navRow, { top: insetTop + 8 }, navAnimStyle]}
        pointerEvents={collapsedActive ? 'none' : 'box-none'}
        accessibilityElementsHidden={collapsedActive}
        importantForAccessibility={collapsedActive ? 'no-hide-descendants' : 'auto'}
      >
        <FrostedNavButton onPress={onBack} accessibilityLabel="Go back">
          <ArrowLeft size={20} color={WHITE} strokeWidth={2.4} />
        </FrostedNavButton>

        <View style={styles.navRight} pointerEvents="box-none">
          <FrostedNavButton onPress={onShare} accessibilityLabel="Share voucher">
            <Share2 size={19} color={WHITE} strokeWidth={2.2} />
          </FrostedNavButton>
          <FrostedNavButton
            onPress={onFav}
            accessibilityLabel={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
          >
            <Heart
              size={19}
              color={WHITE}
              fill={isFavourited ? WHITE : 'none'}
              strokeWidth={2.2}
            />
          </FrostedNavButton>
        </View>
      </Animated.View>

      <View style={[styles.content, dimStyle]} testID="coupon-header-content">
        <View style={styles.typeBadge}>
          <Icon size={15} color={WHITE_92} strokeWidth={2} />
          <Text variant="label.md" style={styles.typeBadgeText} numberOfLines={1} ellipsizeMode="tail">
            {typeLabel}
          </Text>
        </View>

        <Text variant="heading.lg" style={styles.title} numberOfLines={3} ellipsizeMode="tail">
          {title}
        </Text>

        {/* Description renders in-column for non-TL voucher types only.
            TIME_LIMITED voucher hero renders the statusBlock (HeroStatusBlock)
            OUTSIDE this content View — see the statusBlockSlot below — so it
            can span the full hero content-box width without being constrained
            by content's paddingRight (which reserves space for the save badge
            in the title's column). Spec D6(C) lock + on-device QA fix
            2026-05-11 ("statusBlock should be bigger but not overlap save badge"). */}
        {type !== 'TIME_LIMITED' && description ? (
          <Text variant="body.sm" style={styles.description} numberOfLines={3} ellipsizeMode="tail">
            {description}
          </Text>
        ) : null}
      </View>

      {/* TIME_LIMITED statusBlock slot — outside content so it spans the
          full hero content-box width. Save badge is positioned absolute
          at the top of the hero (above the typeBadge + title vertically),
          so the statusBlock can extend horizontally under the save-badge
          column without visual overlap — they're at different y ranges.
          Dimmed alongside content + saveBadge when the voucher is
          stamped redeemed (PR-B T8h parity). */}
      {type === 'TIME_LIMITED' && statusBlock ? (
        <View style={[styles.statusBlockSlot, dimStyle]} testID="coupon-header-status-block-slot">
          {statusBlock}
        </View>
      ) : null}

      {/* Save badge — circular dashed top-right. Anchored just below
          the NavRow so it doesn't collide with the heart button.
          Round-7 stress-test: `adjustsFontSizeToFit` on the amount
          allows large values like £100, £250, £1,000 to shrink to
          fit without overflowing the circle. minimumFontScale=0.55
          keeps it readable down to ~11pt at smallest.  PR-B T8h:
          dimmed alongside the rest of the voucher visual layer. */}
      <View
        style={[styles.saveBadge, { top: insetTop + NAV_ROOM - 8 }, dimStyle]}
        testID="coupon-header-save-badge"
        accessible
        accessibilityLabel={`Save ${formatPounds(estimatedSaving)}`}
      >
        <Text variant="label.md" style={styles.saveLabel}>SAVE</Text>
        <Text
          variant="heading.sm"
          style={styles.saveAmount}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.55}
        >
          {formatPounds(estimatedSaving)}
        </Text>
      </View>
    </View>
  )
}

// ── Frosted nav button ───────────────────────────────────────────────────────

function FrostedNavButton({
  onPress,
  accessibilityLabel,
  children,
}: {
  onPress: () => void
  accessibilityLabel: string
  children: React.ReactNode
}) {
  return (
    <Pressable
      onPress={() => {
        lightHaptic()
        onPress()
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={10}
      style={({ pressed }) => [styles.navBtn, pressed && styles.navBtnPressed]}
    >
      {Platform.OS === 'android' ? (
        <View style={[StyleSheet.absoluteFillObject, styles.navBtnFallback]} />
      ) : (
        <BlurView intensity={32} tint="dark" style={StyleSheet.absoluteFillObject} />
      )}
      <View style={styles.navBtnInner}>{children}</View>
    </Pressable>
  )
}

const NAV_BTN_SIZE = 42

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    minHeight: 300,
    paddingBottom: 36,
    paddingHorizontal: 22,
    overflow: 'hidden',
  },
  // PR-B T8h fix — selective dim applied to gradient + content +
  // saveBadge ONLY (never to navRow).  See CouponHeader's `dimmed`
  // prop comment for the rationale.
  dimmed: {
    opacity: 0.55,
  },
  // ── NavRow inside hero ────────────────────────────────────────────
  navRow: {
    position: 'absolute',
    left: 22,
    right: 22,
    zIndex: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navRight: {
    flexDirection: 'row',
    gap: 10,
  },
  navBtn: {
    width: NAV_BTN_SIZE,
    height: NAV_BTN_SIZE,
    borderRadius: NAV_BTN_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  navBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  navBtnFallback: {
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
  navBtnInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Hero content ──────────────────────────────────────────────────
  content: {
    position: 'relative',
    zIndex: 1,
    // Round-7 stress-test: replace maxWidth: '68%' with explicit
    // paddingRight that reserves the save-badge footprint
    // (badge width 92 + right inset 22 + 12pt gap = 126pt). On any
    // device width, the title/description column stops 126pt before
    // the screen's right edge, so long titles wrap before colliding
    // with the badge. Combined with numberOfLines=3 + ellipsizeMode
    // tail, this ensures arbitrary backend titles never overlap.
    paddingRight: 126,
  },
  // ── TIME_LIMITED statusBlock slot ──────────────────────────────────
  // Sibling of `content`; sits below typeBadge + title vertically.
  // No paddingRight — statusBlock fills the full hero content-box width
  // (root.paddingHorizontal: 22 takes care of left/right safe margins).
  // Save badge is vertically above this slot (positioned absolute, top:
  // insetTop + NAV_ROOM - 8), so the statusBlock extending horizontally
  // under the save-badge column doesn't cause visual overlap. On-device
  // QA fix, 2026-05-11.
  statusBlockSlot: {
    position: 'relative',
    zIndex: 1,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 14,
  },
  typeBadgeText: {
    color: WHITE_92,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: WHITE,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 34,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  description: {
    color: WHITE_80,
    fontSize: 15,
    lineHeight: 21,
  },
  // ── Save badge ────────────────────────────────────────────────────
  saveBadge: {
    position: 'absolute',
    right: 22,
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.42)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  saveLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: WHITE_80,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  saveAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.4,
    marginTop: 2,
  },
})

import React from 'react'
import { View, Pressable, StyleSheet, Platform } from 'react-native'
import { BlurView } from 'expo-blur'
import { ArrowLeft, Heart, Share2 } from 'lucide-react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

type Props = {
  /** Voucher title — primary content. Truncated to one line. */
  title: string
  /**
   * Branch name from `merchant.selectedBranch.name` — drives the
   * branch-LEVEL `REDEEM AT <branch>` eyebrow row. When null
   * (selectedBranch hasn't resolved yet, or all-suspended fallback),
   * the eyebrow row is omitted gracefully — we don't fabricate.
   */
  branchName: string | null
  /** Heart fill state. */
  isFavourited: boolean
  /** Top safe-area inset (status bar / Dynamic Island height). */
  insetTop: number
  /**
   * Driven by the parent screen's `useAnimatedScrollHandler`. The
   * collapsed header opacity is interpolated against this so the
   * frosted surface fades in as the hero scrolls away. Owns the
   * `safe-area surface` per the round-5 plan §3 — when fully
   * opaque the BlurView physically protects the Dynamic Island
   * from content scrolling beneath it.
   */
  scrollY: SharedValue<number>
  /** Opacity interpolation range — start of fade in (scrollY value). */
  fadeStart: number
  /** End of fade in (collapsed surface fully opaque from this value up). */
  fadeEnd: number
  /**
   * JS state derived from `useAnimatedReaction(scrollY > HANDOFF_AT)`
   * in the parent. When false, this header has `pointerEvents='none'`
   * and the hero NavRow is the only tappable nav. When true, this
   * header is tappable and the hero NavRow is disabled. Single
   * threshold ⇒ no scroll range with both layers tappable, no scroll
   * range with neither tappable. See round-5 plan §2.
   */
  isActive: boolean

  onBack:  () => void
  onShare: () => void
  onFav:   () => void
}

/**
 * Voucher Detail collapsed top chrome — pinned safe-area frosted bar
 * that takes over from the hero NavRow once the user scrolls past
 * the coupon hero.
 *
 * Designed specifically for Voucher Detail (NOT a copy of Merchant
 * Profile's collapsed chrome):
 *   • Row 1: back + voucher title (truncated) + share + favourite.
 *     Title is the primary identity once the hero is gone.
 *   • Row 2 (eyebrow, conditional): "REDEEM AT <branchName>" — same
 *     visual language as MerchantRow's REDEEM AT panel so the user
 *     reads voucher (merchant-wide content) vs branch (action
 *     context) consistently across the screen.
 *   • No merchant logo / descriptor / distance / save badge —
 *     compact, premium, voucher-shaped.
 *
 * Motion (Emil framework): scroll-driven opacity interpolation, no
 * time-based animation. Reduced-motion path uses a step function
 * (opacity flips at fadeEnd, no fade) so iOS Reduce Motion users
 * still get the safe-area protection without the visual fade.
 */
export function CollapsedHeader({
  title,
  branchName,
  isFavourited,
  insetTop,
  scrollY,
  fadeStart,
  fadeEnd,
  isActive,
  onBack,
  onShare,
  onFav,
}: Props) {
  const reducedMotion = useReducedMotion()

  // Opacity interpolation — entire header (incl. frosted surface)
  // fades from 0 to 1 across [fadeStart, fadeEnd]. Reduced motion
  // path: step at fadeEnd (no fade, but still appears to protect
  // the safe area).
  const animStyle = useAnimatedStyle(() => {
    if (reducedMotion) {
      return { opacity: scrollY.value >= fadeEnd ? 1 : 0 }
    }
    return {
      opacity: interpolate(
        scrollY.value,
        [fadeStart, fadeEnd],
        [0, 1],
        Extrapolation.CLAMP,
      ),
    }
  })

  return (
    <Animated.View
      pointerEvents={isActive ? 'box-none' : 'none'}
      style={[styles.root, { height: insetTop + ROW_1_H + (branchName ? ROW_2_H : 0) }, animStyle]}
      accessibilityElementsHidden={!isActive}
      importantForAccessibility={isActive ? 'auto' : 'no-hide-descendants'}
      testID="collapsed-header-root"
    >
      {/* Frosted safe-area surface — this is what physically
          protects the Dynamic Island once active (round-5 plan §3). */}
      {Platform.OS === 'android' ? (
        <View style={[StyleSheet.absoluteFillObject, styles.androidFallback]} pointerEvents="none" />
      ) : (
        <BlurView intensity={32} tint="default" style={StyleSheet.absoluteFillObject} pointerEvents="none" />
      )}

      {/* Hairline separator at bottom edge */}
      <View style={styles.hairline} pointerEvents="none" />

      {/* Row 1 — back + title + share + favourite */}
      <View style={[styles.row1, { paddingTop: insetTop + 6 }]} pointerEvents="box-none">
        <NavBtn onPress={onBack} accessibilityLabel="Go back">
          <ArrowLeft size={20} color={color.navy} strokeWidth={2.4} />
        </NavBtn>

        <View style={styles.titleWrap} pointerEvents="none">
          <Text
            variant="body.md"
            style={styles.title}
            numberOfLines={1}
            ellipsizeMode="tail"
            testID="collapsed-header-title"
          >
            {title}
          </Text>
        </View>

        <View style={styles.rightActions} pointerEvents="box-none">
          <NavBtn onPress={onShare} accessibilityLabel="Share voucher">
            <Share2 size={18} color={color.navy} strokeWidth={2.2} />
          </NavBtn>
          <NavBtn
            onPress={onFav}
            accessibilityLabel={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
          >
            <Heart
              size={18}
              color={isFavourited ? color.brandRose : color.navy}
              fill={isFavourited ? color.brandRose : 'none'}
              strokeWidth={2.2}
            />
          </NavBtn>
        </View>
      </View>

      {/* Row 2 — REDEEM AT <branch> eyebrow (conditional) */}
      {branchName ? (
        <View style={styles.row2} pointerEvents="none" testID="collapsed-header-redeem-at">
          <Text variant="label.md" style={styles.redeemAtLabel} numberOfLines={1} ellipsizeMode="tail">
            <Text style={styles.redeemAtPrefix}>REDEEM AT </Text>
            {branchName.toUpperCase()}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  )
}

// ── Local nav button (lighter styling than the hero's frosted-glass) ──

function NavBtn({
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
      {children}
    </Pressable>
  )
}

const ROW_1_H = 52
const ROW_2_H = 22

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    overflow: 'hidden',
  },
  androidFallback: {
    backgroundColor: 'rgba(245,240,235,0.92)',
  },
  hairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    zIndex: 1,
  },
  // Row 1 — back / title / actions
  row1: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_1_H,
    paddingHorizontal: 14,
    gap: 10,
    zIndex: 2,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#010C35',
    letterSpacing: -0.1,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  navBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  // Row 2 — REDEEM AT <branch> eyebrow
  row2: {
    height: ROW_2_H,
    paddingHorizontal: 60, // align under the title (past back button)
    justifyContent: 'flex-start',
    zIndex: 2,
  },
  redeemAtLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
    color: color.brandRose,
  },
  redeemAtPrefix: {
    color: color.brandRose,
    opacity: 0.85,
  },
})

import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft } from 'lucide-react-native'
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

/**
 * Compact bar height (excluding the safe-area top spacer). On
 * iPhone Pro (Dynamic Island ≈ 59pt top inset) the total header
 * height is 59 + 52 = 111pt; on a notch device 47 + 52 = 99pt;
 * on SE 20 + 52 = 72pt.
 */
export const COMPACT_BAR_HEIGHT = 52

/**
 * Pixels of scroll over which the collapsed header fades from
 * opacity 0 → 1. Tight enough to feel decisive, wide enough to
 * feel smooth. Centred on `fadeEndY` (the scrollY at which the
 * sticky TabBar pins) so the fade reaches full opacity exactly
 * when the TabBar arrives at the top — single visual handoff.
 */
const FADE_WINDOW = 60

type Props = {
  /**
   * Outer ScrollView's vertical offset, exposed as a Reanimated
   * shared value. Drives the opacity interpolation directly on
   * the UI thread — no JS-bridge cost per frame.
   */
  scrollY: SharedValue<number>
  /**
   * Y position (in scroll coordinates) where the identity zone
   * ends and the TabBar's natural position begins. Captured at
   * runtime via `onLayout` on the identity zone wrapper in the
   * parent screen, NOT hardcoded — the identity zone's height
   * depends on whether the merchant has a descriptor, multi vs
   * single branch, the rating block, etc. The collapsed header
   * reaches full opacity at this scrollY (= when the TabBar
   * pins, so the stuck chrome unit appears in one motion).
   */
  fadeEndY: number
  /** Merchant business name. Single line, ellipsised tail. */
  merchantName: string
  /**
   * Branch / location line. Pre-built by the parent screen using
   * the same `branchShortName` + `city` heuristic the rest of the
   * profile uses; null when the merchant is single-branch (in
   * which case there's no branch identity to disambiguate). When
   * null, only the merchant name renders, vertically centred in
   * the 52pt content row.
   */
  branchLine: string | null
  /**
   * Branch logo URL when set (branch-aware), else merchant default.
   * Resolution happens in the parent screen so the collapsed header
   * stays presentational.
   */
  logoUrl: string | null
}

/**
 * M2 — collapsed sticky header.
 *
 * Mounted as an absolutely-positioned sibling of the outer ScrollView,
 * AFTER both `<HeroNav>` and the scrollWrap in JSX, so it sits at the
 * top of the z-stack. Stays at top: 0 with its own background and
 * safe-area top spacer.
 *
 * Three visual states keyed off `scrollY` and `fadeEndY`:
 *   • Expanded     (scrollY ≤ fadeEndY − FADE_WINDOW): opacity 0.
 *     The user sees the full hero + identity zone.
 *   • Transitioning(fadeEndY − FADE_WINDOW < scrollY < fadeEndY):
 *     opacity 0 → 1 (linear interpolate). Identity zone is
 *     scrolling past behind, gradually covered by the fading-in
 *     header. The TabBar approaches its sticky position.
 *   • Collapsed    (scrollY ≥ fadeEndY): opacity 1, TabBar pinned
 *     directly beneath the header. Cream-on-cream seam (TabBar's
 *     gradient top stop = `#FFF9F5` matches this header's bg) so
 *     the boundary is invisible.
 *
 * Locked content (owner direction 2026-05-06):
 *   • Back button (left)        — navigation affordance; mandatory
 *                                 because this screen is a Tabs route
 *                                 (no iOS swipe-back) with the bottom
 *                                 tab bar hidden.
 *   • Merchant logo             — 36pt circle, branch-aware.
 *   • Merchant name             — 15pt 700 navy, ellipsises tail.
 *   • Branch · Location line    — 13pt 500 grey, ellipsises tail.
 *
 * Excluded by owner direction (these stay in the expanded hero):
 *   share, heart, website, contact, directions, rating, open/closed
 *   status, full metadata.
 *
 * Safe-area / Dynamic Island guarantee: `useSafeAreaInsets()` is
 * read; `insets.top` is consumed as the cream-painted top spacer
 * (paddingTop). All interactive content (back button, logo, text)
 * sits BELOW that spacer, so on a Pro device the content row starts
 * at screen-y ≈ 59pt — clear of the Dynamic Island.
 *
 * Reduced motion: opacity is interpolated directly from the user's
 * scrollY (gesture-driven, not a triggered animation). Standard
 * reduced-motion targets decorative motion, not direct input
 * response, so the fade still works.
 *
 * `pointerEvents="box-none"`: the container itself never intercepts
 * taps; only the back button (its only interactive child) does.
 * When the header is at opacity 0, the visually-invisible back
 * button still occupies its area in z-stack — taps there call
 * `router.back()`, which is the same behaviour as <HeroNav>'s back
 * button at the same screen position. So invisible-but-tappable
 * here is functionally identical to visible-and-tappable; no UX
 * regression vs the expanded hero.
 */
export function CollapsedHeader({
  scrollY, fadeEndY, merchantName, branchLine, logoUrl,
}: Props) {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const containerStyle = useAnimatedStyle(() => {
    'worklet'
    const fadeStart = fadeEndY - FADE_WINDOW
    const opacity = interpolate(
      scrollY.value,
      [fadeStart, fadeEndY],
      [0, 1],
      Extrapolation.CLAMP,
    )
    return { opacity }
  })

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.container,
        { paddingTop: insets.top, height: insets.top + COMPACT_BAR_HEIGHT },
        containerStyle,
      ]}
      testID="collapsed-header"
    >
      <View style={styles.row}>
        <Pressable
          onPress={() => { lightHaptic(); router.back() }}
          style={styles.backBtn}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={20} color={color.navy} />
        </Pressable>

        <View style={styles.logoBox}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          ) : (
            <View style={styles.logoPlaceholder} />
          )}
        </View>

        <View style={styles.text}>
          <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
            {merchantName}
          </Text>
          {branchLine ? (
            <Text style={styles.branch} numberOfLines={1} ellipsizeMode="tail">
              {branchLine}
            </Text>
          ) : null}
        </View>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFF9F5',
    // zIndex above HeroNav (10) and any scroll-content elements.
    // The collapsed header is the topmost chrome on this screen
    // when visible; sheets and modals from RN's <Modal> sit even
    // higher because Modal is a system-level overlay independent
    // of our z-index scale.
    zIndex: 20,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  logoPlaceholder: {
    flex: 1,
  },
  text: {
    flex: 1,
    // Allows the merchant name + branch line to truncate cleanly
    // when long (numberOfLines:1 + ellipsizeMode:'tail' need
    // minWidth:0 on the flex parent to actually clip in RN).
    minWidth: 0,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: color.navy,
  },
  branch: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4B5563',
    marginTop: 1,
  },
})

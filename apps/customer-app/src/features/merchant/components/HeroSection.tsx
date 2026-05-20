import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, Share2, Heart, TrendingUp, Award } from 'lucide-react-native'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { spacing } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

/**
 * Banner height in points — the in-flow `<HeroBannerSpacer>` reserves
 * exactly this much space so the identity zone starts at this Y
 * coordinate from the top of the scroll container. Bumped from 224
 * to 256 (M1.2 owner direction 2026-05-06 — ~15% taller resting hero
 * for more visual presence) on a clean 8-multiple. Logo's `top: -36`
 * overlap in MerchantHeadline still produces the half-on-banner /
 * half-on-cream rule because the overlap is anchored to the boundary,
 * not the banner's height.
 */
export const HERO_HEIGHT = 256

/**
 * Stretch cap for pull-down overscroll. The backdrop's height grows
 * from HERO_HEIGHT toward `HERO_HEIGHT * STRETCH_MAX_SCALE` (=640pt
 * at 2.5×) — comfortably more than any reasonable pull distance, but
 * bounded so extreme flicks don't produce absurd geometry.
 */
const STRETCH_MAX_SCALE = 2.5

type BackdropProps = {
  bannerUrl: string | null
  isFeatured?: boolean
  isTrending?: boolean
  /**
   * Outer ScrollView's vertical offset, exposed as a Reanimated
   * shared value. Drives both the layer's translate (so the banner
   * appears to scroll despite being mounted outside the ScrollView)
   * and the height growth on overscroll.
   */
  scrollY: SharedValue<number>
  /**
   * Distance from screen top to banner rest. 0 in the common case.
   * When `<SuspendedBranchBanner>` is visible, the screen passes
   * its measured height here so the backdrop sits below the SBB
   * rather than overlapping it in z-order.
   */
  topOffset?: number
}

/**
 * Banner backdrop — image + vignette + (Featured/Trending) badges.
 *
 * Mounts as an absolutely-positioned sibling of the outer ScrollView
 * BEFORE the scroll wrap in JSX, so it sits BEHIND scroll content in
 * z-order. The merchant logo (positioned in <MerchantHeadline> with
 * `top: -36` to deliberately overlap the banner/cream boundary by
 * half) lives inside the scroll content and therefore renders ON TOP
 * of this backdrop — the half-on-banner / half-on-cream design is
 * preserved at all scroll states.
 *
 * Animation:
 *   • Normal scroll (scrollY > 0): the backdrop translates UP with
 *     the scrolling content (banner scrolls away exactly like a
 *     normal scroll child).
 *   • Overscroll (scrollY < 0): the backdrop's HEIGHT grows from
 *     HERO_HEIGHT toward HERO_HEIGHT × STRETCH_MAX_SCALE. The
 *     image inside has `contentFit="cover"` so it scales uniformly
 *     to fill the larger box — aspect ratio preserved, no
 *     rubber-band Y-only distortion. As the container grows taller,
 *     `cover` crops the image more on the left/right (vertical zoom
 *     into the image), giving the standard parallax zoom feel of
 *     Apple Music / Spotify / Twitter profile pages.
 *
 * `pointerEvents="none"` because all interactive content (back,
 * share, heart) lives in the separate <HeroNav> layer mounted ABOVE
 * the scroll. Touches in the backdrop's area pass through to the
 * scroll wrap (for pan-gesture detection) and to <HeroNav> (for
 * button taps).
 */
export function HeroBackdrop({
  bannerUrl, isFeatured, isTrending,
  scrollY, topOffset = 0,
}: BackdropProps) {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet'
    const overscroll = scrollY.value < 0 ? -scrollY.value : 0
    const positiveScroll = scrollY.value > 0 ? scrollY.value : 0
    const stretch = Math.min(overscroll, HERO_HEIGHT * (STRETCH_MAX_SCALE - 1))
    return {
      height: HERO_HEIGHT + stretch,
      transform: [{ translateY: -positiveScroll }],
    }
  })

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.backdrop, { top: topOffset }, animatedStyle]}
      testID="hero-backdrop"
    >
      {bannerUrl ? (
        <Image source={{ uri: bannerUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
      ) : (
        <LinearGradient colors={['#0a1025', '#111d3a', '#1a2d52']} style={StyleSheet.absoluteFillObject} />
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0.1)', 'transparent', 'rgba(0,0,0,0.45)']}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      {(isFeatured || isTrending) && (
        <View style={styles.badgeRow}>
          {isFeatured && (
            <View style={[styles.badge, styles.badgeFeatured]}>
              <Award size={12} color="#FFF" />
              <Text variant="label.md" style={styles.badgeLabel}>FEATURED</Text>
            </View>
          )}
          {isTrending && (
            <View style={[styles.badge, styles.badgeTrending]}>
              <TrendingUp size={12} color="#FFF" />
              <Text variant="label.md" style={styles.badgeLabel}>TRENDING</Text>
            </View>
          )}
        </View>
      )}
    </Animated.View>
  )
}

type NavProps = {
  isFavourited: boolean
  onToggleFavourite: () => void
  onShare: () => void
  scrollY: SharedValue<number>
  topOffset?: number
  // PR #112 fixup-6 (2026-05-20) — Search→Merchant→back routes through a
  // custom handler so the user returns to Search with their query
  // preserved.  When absent, the back button falls back to `router.back()`.
  // The explicit `| undefined` is load-bearing under
  // `exactOptionalPropertyTypes: true` — MerchantProfileScreen passes
  // `onBack={cond ? fn : undefined}` directly without a spread.
  onBack?: (() => void) | undefined
}

/**
 * Navigation row — back / share / heart buttons.
 *
 * Mounts as an absolutely-positioned sibling of the outer ScrollView
 * AFTER the scroll wrap in JSX, so it sits ABOVE scroll content (and
 * the backdrop) in z-order. Buttons stay tappable at all times.
 *
 * Animation:
 *   • Normal scroll: translates UP with content. Past the hero, the
 *     buttons scroll out of view — M2's collapsed sticky header will
 *     re-introduce a back button at that point.
 *   • Overscroll: stays at rest position. Standard pattern (Apple
 *     Music, Spotify): pull-down stretches the image but the nav
 *     row stays anchored at the top.
 */
export function HeroNav({
  isFavourited, onToggleFavourite, onShare,
  scrollY, topOffset = 0,
  onBack,
}: NavProps) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const handleBack = onBack ?? (() => router.back())

  const animatedStyle = useAnimatedStyle(() => {
    'worklet'
    const positiveScroll = scrollY.value > 0 ? scrollY.value : 0
    return { transform: [{ translateY: -positiveScroll }] }
  })

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.navLayer, { top: topOffset + insets.top + 8 }, animatedStyle]}
      testID="hero-nav"
    >
      <View style={styles.navRow}>
        <Pressable
          onPress={() => { lightHaptic(); handleBack() }}
          style={styles.frostedBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={18} color="#FFF" />
        </Pressable>
        <View style={styles.rightActions}>
          <Pressable
            onPress={() => { lightHaptic(); onShare() }}
            style={styles.frostedBtn}
            accessibilityRole="button"
            accessibilityLabel="Share merchant"
          >
            <Share2 size={18} color="#FFF" />
          </Pressable>
          <Pressable
            onPress={() => { lightHaptic(); onToggleFavourite() }}
            style={[styles.frostedBtn, isFavourited && styles.favActive]}
            accessibilityRole="button"
            accessibilityLabel={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
          >
            <Heart size={18} color="#FFF" fill={isFavourited ? '#E20C04' : 'none'} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  )
}

/**
 * In-flow placeholder reserving HERO_HEIGHT pixels at the position
 * the legacy <HeroSection> occupied. The actual banner renders via
 * <HeroBackdrop> + <HeroNav> as absolute siblings of the ScrollView.
 * pointerEvents="none" so the spacer never intercepts taps — they
 * pass through to the ScrollView's pan-gesture detector and (for
 * button taps in the nav-row area) to <HeroNav> above.
 */
export function HeroBannerSpacer() {
  return <View pointerEvents="none" style={styles.spacer} testID="hero-banner-spacer" />
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: HERO_HEIGHT,
    overflow: 'hidden',
  },
  navLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
  },
  spacer: {
    height: HERO_HEIGHT,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[5],
  },
  frostedBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  favActive: {
    backgroundColor: 'rgba(226,12,4,0.3)',
  },
  rightActions: {
    flexDirection: 'row',
    gap: 8,
  },
  badgeRow: {
    position: 'absolute',
    bottom: 14,
    right: spacing[5],
    zIndex: 10,
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  badgeFeatured: {
    backgroundColor: 'rgba(217,119,6,0.85)',
  },
  badgeTrending: {
    backgroundColor: 'rgba(226,12,4,0.85)',
  },
  badgeLabel: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
})

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
 * Banner height in points. Exposed so the screen can size the
 * in-flow `<HeroBannerSpacer>` to match the absolute `<HeroBanner>`
 * layer.
 */
export const HERO_HEIGHT = 224

/**
 * Stretch cap for pull-down overscroll. At extreme drags (e.g. fast
 * flick down), `scaleY` is clamped to this value so the banner does
 * not visually explode. 2.5× HERO_HEIGHT = 560pt — comfortably more
 * than any reasonable pull distance, but bounded.
 */
const STRETCH_MAX_SCALE = 2.5

type HeroBannerProps = {
  bannerUrl: string | null
  isFeatured?: boolean
  isTrending?: boolean
  isFavourited: boolean
  onToggleFavourite: () => void
  onShare: () => void
  /**
   * Reanimated shared value carrying the outer ScrollView's
   * scrollY. Used to drive the banner's translate (so the banner
   * appears to scroll despite being positioned absolutely outside
   * the ScrollView) and the inner image layer's stretch on
   * overscroll (`scrollY < 0`). Updates run on the UI thread via
   * `useAnimatedScrollHandler` — no JS-bridge cost per frame.
   */
  scrollY: SharedValue<number>
  /**
   * Distance in points from screen top to the banner's rest
   * position. Equals 0 in the default case. When the
   * `<SuspendedBranchBanner>` is visible, the screen passes its
   * measured height here so the banner sits below the SBB rather
   * than overlapping it (SBB stays a scroll child; banner is an
   * absolute sibling — without this offset, banner would render
   * on top of SBB in z-order).
   */
  topOffset?: number
}

/**
 * Banner layer — mounted as an absolutely-positioned sibling of the
 * outer ScrollView, NOT as a scroll child. Its `translateY` is
 * driven by `scrollY` so it visually appears to scroll. During
 * pull-down overscroll (`scrollY < 0`), an inner image+vignette
 * layer also scales bottom-origin to fill the exposed top area —
 * the standard "stretchy hero" pattern (Apple Music, Spotify,
 * Twitter profile, TestFlight).
 *
 * Two-layer structure intentional:
 *   • Outer (this Animated.View): `translateY` only. Handles
 *     "follow the finger" on overscroll AND "scroll away" on
 *     normal upward scroll. Positions interactive children
 *     (nav row, badges) without scaling them.
 *   • Inner (image + vignette): `scaleY` only, `transformOrigin:
 *     'bottom'`. Bottom edge stays pinned to the outer's bottom;
 *     top edge extends UP above outer's top edge during stretch.
 *     Outer's `overflow: 'visible'` lets the over-extended top
 *     render up to the screen edge, filling the pull-down void.
 *
 * Why bottom-origin: when the user pulls down, content moves
 * DOWN with their finger, exposing a void ABOVE the banner's
 * rest position. Stretching the image so its TOP extends up is
 * what fills that void — bottom-origin keeps the image's bottom
 * stitched to the outer layer (which has already translated
 * down with the finger), and grows the image upward.
 *
 * Performance: both transforms run on the UI thread via
 * `useAnimatedStyle` + Reanimated's worklet runtime. No
 * per-frame JS-bridge cost. Transforms are GPU-accelerated.
 */
export function HeroBanner({
  bannerUrl, isFeatured, isTrending,
  isFavourited, onToggleFavourite, onShare,
  scrollY, topOffset = 0,
}: HeroBannerProps) {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const outerStyle = useAnimatedStyle(() => {
    'worklet'
    return { transform: [{ translateY: -scrollY.value }] }
  })

  const innerStyle = useAnimatedStyle(() => {
    'worklet'
    if (scrollY.value < 0) {
      const overpull = -scrollY.value
      const scale = Math.min(1 + overpull / HERO_HEIGHT, STRETCH_MAX_SCALE)
      return { transform: [{ scaleY: scale }] }
    }
    return { transform: [{ scaleY: 1 }] }
  })

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.hero, { top: topOffset }, outerStyle]}
      testID="hero-banner"
    >
      <Animated.View style={[styles.imageLayer, innerStyle]} pointerEvents="none">
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
      </Animated.View>

      <View style={[styles.navRow, { top: insets.top + 8 }]}>
        <Pressable
          onPress={() => { lightHaptic(); router.back() }}
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

/**
 * In-flow placeholder that reserves `HERO_HEIGHT` pixels at the
 * position the legacy `<HeroSection>` used to occupy. The actual
 * banner renders above the ScrollView via `<HeroBanner>`. The
 * spacer guarantees the identity zone starts at the same Y
 * coordinate as before the refactor — no content shift.
 */
export function HeroBannerSpacer() {
  return <View style={styles.spacer} testID="hero-banner-spacer" />
}

const styles = StyleSheet.create({
  hero: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: HERO_HEIGHT,
    overflow: 'visible',
  },
  imageLayer: {
    ...StyleSheet.absoluteFillObject,
    transformOrigin: 'bottom',
    overflow: 'hidden',
  },
  spacer: {
    height: HERO_HEIGHT,
  },
  navRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
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

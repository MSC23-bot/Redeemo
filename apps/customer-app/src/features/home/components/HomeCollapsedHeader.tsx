import React from 'react'
import { View, Pressable, StyleSheet, useWindowDimensions } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Search, Bell } from '@/design-system/icons'
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated'
import { Text, color, elevation, useMotionScale } from '@/design-system'
import { HomeHeaderLocation } from './HomeHeaderLocation'
import { HeaderRadialGradient, type RadialStop } from './HomeHeaderWave'
import type { LocationContext } from '@/lib/api/shared/location'

export const COMPACT_BAR_HEIGHT = 50
// Exported so HomeScreen can derive the touch/accessibility `active` threshold
// from the SAME fade window the opacity uses (no magic-number drift).
export const FADE_WINDOW = 45

// Collapsed-bar surface — the SAME radial gradient recipe as the Home category
// cards (cx 70% cy 16% r 82%, light→deep), tuned to a REDDISH brand tone (owner
// direction 2026-06-05: the Food card's orange was too orange; this is the
// brand red). Distinct from the expanded header's radial flow.
const COLLAPSED_STOPS: ReadonlyArray<RadialStop> = [
  { offset: '0', color: '#EF4338' },
  { offset: '1', color: '#BE0A03' },
]
const COLLAPSED_DEEP = '#BE0A03' // base behind the radial (1-frame fallback)

type Props = {
  /** Outer ScrollView's vertical offset (UI-thread shared value). */
  scrollY: SharedValue<number>
  /** Scroll Y at which the collapsed bar reaches full opacity (captured via onLayout). */
  fadeEndY: number
  /**
   * Whether the collapsed bar is currently shown (HomeScreen drives this off
   * the scroll offset). Gates BOTH pointer events and accessibility exposure:
   * while false the bar is visually hidden at the top of the feed, so its
   * controls must not be touch-live or screen-reader-visible (otherwise they
   * shadow the expanded header's greeting/search row). See the component
   * docstring.
   */
  active: boolean
  firstName: string | null
  area: string | null
  city: string | null
  avatarUrl?: string | null
  locationContext?: LocationContext | undefined
  onSearchPress: () => void
  onAvatarPress: () => void
  onNotificationPress?: () => void
  // Tapping the GPS-on location row routes to the Your Location screen
  // (parent owns routing). Passed through to <HomeHeaderLocation>.
  onLocationPress?: (() => void) | undefined
}

/**
 * Pinned compact Home header (PR A). Absolutely-positioned sibling of the
 * feed ScrollView (top of the z-stack). It is brand chrome: a REDDISH brand
 * radial gradient (COLLAPSED_STOPS #EF4338 -> #BE0A03, the same category-card
 * recipe as the expanded header) with frosted translucent-white icon buttons,
 * a warm drop shadow + bottom hairline lifting it off the scrolling content.
 * Opacity interpolates 0->1 over the last FADE_WINDOW px before `fadeEndY`,
 * on the UI thread.
 *
 * The header's own opaque radial covers the status-bar safe-area zone once it
 * has faded in, so the expanded greeting scrolls UNDER brand chrome, never
 * under the Dynamic Island / time. (There is no separate HomeScreen mask — the
 * expanded header's own radial covers the inset before the handover.)
 *
 * Reduced motion (useMotionScale()===0): binary opacity switch at fadeEndY.
 * The fade is gesture-driven so it is RM-safe either way; the binary branch
 * honours the locked Decision #3 for when detection is reliable (§RM).
 *
 * Touch / accessibility gate (`active`, review fix): the bar's controls overlap
 * the expanded header's top band, so while the bar is hidden (scrolled to the
 * top) its children must NOT be touch-live or screen-reader-visible — otherwise
 * an invisible location/search/bell/avatar shadows the expanded greeting (a tap
 * on the greeting would route to /saved-area, and VoiceOver would announce the
 * hidden controls). HomeScreen passes `active` (true once the bar is shown):
 * the container is `pointerEvents="none"` + accessibility-hidden until then,
 * and `pointerEvents="box-none"` (children-only taps, matches
 * merchant/CollapsedHeader) once active.
 */
export function HomeCollapsedHeader({
  scrollY, fadeEndY, active, firstName, area, city, avatarUrl, locationContext,
  onSearchPress, onAvatarPress, onNotificationPress, onLocationPress,
}: Props) {
  const insets = useSafeAreaInsets()
  const { width: winW } = useWindowDimensions()
  const reduced = useMotionScale() === 0
  const avatarLetter = firstName ? firstName.charAt(0).toUpperCase() : '?'

  const containerStyle = useAnimatedStyle(() => {
    'worklet'
    if (reduced) {
      return { opacity: scrollY.value >= fadeEndY ? 1 : 0 }
    }
    const opacity = interpolate(
      scrollY.value,
      [fadeEndY - FADE_WINDOW, fadeEndY],
      [0, 1],
      Extrapolation.CLAMP,
    )
    return { opacity }
  })

  return (
    <Animated.View
      // Review fix: only intercept taps once the bar is actually shown.
      // While hidden at the top of the feed (`!active`) the container ignores
      // touches entirely, so its opacity-0 children can't shadow the expanded
      // header's greeting/search row. When shown, box-none passes through to
      // the children only.
      pointerEvents={active ? 'box-none' : 'none'}
      // Review fix: hide the hidden bar's controls from screen readers while
      // the expanded header is active, so VoiceOver/TalkBack don't announce a
      // duplicate (invisible) location/search/bell/avatar set.
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      testID="home-collapsed-header"
      style={[
        styles.container,
        { paddingTop: insets.top, height: insets.top + COMPACT_BAR_HEIGHT },
        containerStyle,
      ]}
    >
      {/* Category-card radial gradient (reddish brand) — a distinct surface
          from the expanded header so the collapsed bar reads as its own chrome. */}
      <HeaderRadialGradient
        width={winW}
        height={insets.top + COMPACT_BAR_HEIGHT}
        gid="home-collapsed-grad"
        cx="70%"
        cy="16%"
        r="82%"
        stops={COLLAPSED_STOPS}
      />

      <View style={styles.row}>
        <View style={styles.location}>
          <HomeHeaderLocation area={area} city={city} locationContext={locationContext} size="md" onPress={onLocationPress} tone="onBrand" testID="home-collapsed-location-button" />
        </View>

        <Pressable
          onPress={onSearchPress}
          testID="home-collapsed-search"
          accessibilityRole="button"
          accessibilityLabel="Search"
          hitSlop={6}
          style={({ pressed }) => [styles.searchBtn, pressed && styles.pressed]}
        >
          <Search size={18} color="#FFFFFF" />
        </Pressable>

        <Pressable
          onPress={() => onNotificationPress?.()}
          testID="home-collapsed-bell"
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          hitSlop={6}
          style={({ pressed }) => [styles.bellBtn, pressed && styles.pressed]}
        >
          <Bell size={18} color="#FFFFFF" />
        </Pressable>

        <Pressable
          onPress={onAvatarPress}
          testID="home-collapsed-avatar"
          accessibilityRole="button"
          accessibilityLabel="Profile"
          style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <LinearGradient
              colors={[color.brandRose, color.brandCoral]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarImg}
            >
              <Text variant="label.md" style={styles.avatarInitial}>
                {avatarLetter}
              </Text>
            </LinearGradient>
          )}
        </Pressable>
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
    backgroundColor: COLLAPSED_DEEP, // base behind the radial gradient
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
    zIndex: 20,
    // Warm-brand drop shadow so the pinned chrome reads as "above" the content
    // scrolling beneath it (owner direction 2026-06-05: appropriate shadow on
    // the header's bottom edge). Overrides elevation.md's navy tint + radius.
    ...elevation.md,
    shadowColor: '#6E1A0A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 12,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 10,
  },
  location: {
    flex: 1,
    minWidth: 0,
  },
  // Uniform icon button shared by search + bell — frosted translucent-white
  // surface + white glyph; reads as light chrome on the brand bar (36×36).
  searchBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.95,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 15,
  },
})

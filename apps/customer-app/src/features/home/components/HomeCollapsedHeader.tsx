import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
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
import type { LocationContext } from '@/lib/api/shared/location'

export const COMPACT_BAR_HEIGHT = 52
const FADE_WINDOW = 60

type Props = {
  /** Outer ScrollView's vertical offset (UI-thread shared value). */
  scrollY: SharedValue<number>
  /** Scroll Y at which the collapsed bar reaches full opacity (captured via onLayout). */
  fadeEndY: number
  firstName: string | null
  area: string | null
  city: string | null
  avatarUrl?: string | null
  locationContext?: LocationContext | undefined
  onSearchPress: () => void
  onAvatarPress: () => void
  onNotificationPress?: () => void
}

/**
 * Pinned compact Home header (PR A). Absolutely-positioned sibling of the
 * feed ScrollView (top of the z-stack). It is brand chrome, not a generic
 * slab: a warm cream identity-zone gradient (#FFF9F5 -> #FCF0E5) carries the
 * brand, a navy-tinted elevation.md shadow + bottom hairline lift it off the
 * scrolling content, and the search affordance is the compact form of the
 * expanded search bar (warm cream-rose surface, brand-rose hairline + glyph)
 * rather than a bare floating icon. Opacity interpolates 0->1 over the last
 * FADE_WINDOW px before `fadeEndY`, on the UI thread.
 *
 * The status-bar safe-area zone is masked separately (HomeScreen owns an
 * always-opaque mask), so the expanded greeting scrolls UNDER opaque chrome,
 * never under the Dynamic Island / time.
 *
 * Reduced motion (useMotionScale()===0): binary opacity switch at fadeEndY.
 * The fade is gesture-driven so it is RM-safe either way; the binary branch
 * honours the locked Decision #3 for when detection is reliable (§RM).
 *
 * pointerEvents="box-none": the container passes taps through; only the
 * search / bell / avatar children receive them (matches merchant/CollapsedHeader).
 */
export function HomeCollapsedHeader({
  scrollY, fadeEndY, firstName, area, city, avatarUrl, locationContext,
  onSearchPress, onAvatarPress, onNotificationPress,
}: Props) {
  const insets = useSafeAreaInsets()
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
      pointerEvents="box-none"
      testID="home-collapsed-header"
      style={[
        styles.container,
        { paddingTop: insets.top, height: insets.top + COMPACT_BAR_HEIGHT },
        containerStyle,
      ]}
    >
      {/* Warm identity-zone gradient — subtle deepening toward the content
          edge so the bar reads as brand chrome, not a white slab. */}
      <LinearGradient
        colors={['#FFF9F5', '#FCF0E5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.row}>
        <View style={styles.location}>
          <HomeHeaderLocation area={area} city={city} locationContext={locationContext} />
        </View>

        <Pressable
          onPress={onSearchPress}
          testID="home-collapsed-search"
          accessibilityRole="button"
          accessibilityLabel="Search"
          hitSlop={6}
          style={({ pressed }) => [styles.searchBtn, pressed && styles.pressed]}
        >
          <Search size={18} color={color.brandRose} />
        </Pressable>

        <Pressable
          onPress={() => onNotificationPress?.()}
          testID="home-collapsed-bell"
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          hitSlop={6}
          style={({ pressed }) => [styles.bellBtn, pressed && styles.pressed]}
        >
          <Bell size={18} color={color.navy} />
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
    backgroundColor: color.surface.body, // cream base (carries the navy shadow)
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
    zIndex: 20,
    // Navy-tinted lift so the pinned chrome reads as "above" the content
    // scrolling beneath it (DESIGN.md elevation.md — sticky chrome).
    ...elevation.md,
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
  // Compact form of the expanded search bar — warm cream-rose surface (NOT
  // stark white) + brand-rose hairline + brand-rose glyph.
  searchBtn: {
    width: 40,
    height: 36,
    borderRadius: 12,
    backgroundColor: color.surface.tint,
    borderWidth: 1,
    borderColor: 'rgba(226,12,4,0.12)', // brand-rose hairline (matches the expanded bar)
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.navy,
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  // Notification bell — same warm surface, neutral hairline + navy glyph so it
  // reads as a secondary control distinct from the brand-rose search.
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.surface.tint,
    borderWidth: 1,
    borderColor: color.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  avatarImg: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 15,
  },
})

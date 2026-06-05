import React, { useState } from 'react'
import { View, TouchableOpacity, StyleSheet, useWindowDimensions, type LayoutChangeEvent } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Bell } from '@/design-system/icons'
import { Text, color, spacing } from '@/design-system'
import { HomeHeaderLocation } from './HomeHeaderLocation'
import { HomeSearchBar } from './HomeSearchBar'
import Animated, { useAnimatedStyle, interpolate, Extrapolation, type SharedValue } from 'react-native-reanimated'
import { HomeHeaderWave, WAVE_HEIGHT, ON_BRAND_TEXT, HeaderRadialGradient, type RadialStop } from './HomeHeaderWave'
import type { LocationContext } from '@/lib/api/shared/location'

// Expanded-header surface — the SAME organic radial recipe as the collapsed bar
// (owner direction 2026-06-05: match the collapsed gradient), in the reddish
// brand tone with just a small hint of orange in the glow. No axis, no obvious
// direction.
const EXPANDED_STOPS: ReadonlyArray<RadialStop> = [
  { offset: '0', color: '#F24E2C' }, // glow — the collapsed red with a small hint of orange
  { offset: '1', color: '#BE0A03' }, // deep red — same as the collapsed bar
]
const EXPANDED_HEADER_TOP = '#BE0A03' // base behind the radial (1-frame fallback before measure)

type Props = {
  firstName: string | null
  area: string | null
  city: string | null
  avatarUrl?: string | null
  onSearchPress: () => void
  // Batch 2 M2 — avatar taps route to the Profile tab. Parent (HomeScreen)
  // owns the routing, mirroring `onSearchPress` (HomeHeader stays router-free).
  onAvatarPress: () => void
  // Notification bell — parent owns the handler (HomeScreen wires it). The
  // bell always renders; it is a no-op if no handler is provided.
  onNotificationPress?: () => void
  // Task 13 Round 3 — `locationContext` from the Home feed envelope, passed
  // through to <HomeHeaderLocation> which renders <LocationStatusLabel> when
  // GPS-on `area/city` are absent AND a context is provided.
  locationContext?: LocationContext | undefined
  // Tapping the GPS-on location row routes to the Your Location screen
  // (parent owns routing). Passed through to <HomeHeaderLocation>.
  onLocationPress?: (() => void) | undefined
  // Scroll offset (UI-thread shared value) — drives the content fade-out so the
  // greeting/location/search fade quickly while the radial background + wave
  // keep scrolling, letting the collapsed bar hand over promptly (no dead zone).
  // Optional: when absent (standalone/tests) the content stays fully visible.
  scrollY?: SharedValue<number> | undefined
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * Expanded Home header (PR A + brand-header redesign, Option A layout):
 *   • Surface    — original brand red→coral→orange gradient; a single smooth
 *                  peach wave (<HomeHeaderWave>) is its bottom edge into the body.
 *   • Top row    — greeting (Mustica display.sm, off-white, left) + bell + avatar
 *   • Location   — <HomeHeaderLocation tone="onBrand"> (off-white) below greeting
 *   • Search bar — full-width tap-through <HomeSearchBar> (cream; stays light)
 *
 * The gradient covers from the very top of the screen INCLUDING the status-bar
 * inset zone (Savings-hero pattern): the header's own `paddingTop: insets.top`
 * pushes the content below the status bar while the gradient fills the inset,
 * so there is no cream gap between the status bar and the header. When the user
 * scrolls, <HomeCollapsedHeader> (mounted by HomeScreen) takes over with the
 * compact bar. This component stays router-free; HomeScreen owns navigation.
 */
export function HomeHeader({
  firstName, area, city, locationContext, avatarUrl,
  onSearchPress, onAvatarPress, onNotificationPress, onLocationPress, scrollY,
}: Props) {
  const insets = useSafeAreaInsets()
  const { width: winW } = useWindowDimensions()
  const [headerH, setHeaderH] = useState(0)
  // Content (greeting/location/search) fades out fast as you scroll — gone by
  // ~insets.top+35px — so the collapsed bar can hand over promptly. The radial
  // background + wave sit OUTSIDE this wrapper and keep scrolling normally, so
  // the top stays red the whole way (no cream/dead-zone gap).
  const contentFadeEnd = insets.top + 35
  const contentStyle = useAnimatedStyle(() => {
    if (!scrollY) return { opacity: 1 }
    return { opacity: interpolate(scrollY.value, [8, contentFadeEnd], [1, 0], Extrapolation.CLAMP) }
  })
  const greeting = getGreeting()
  const displayName = firstName ?? 'there'
  const avatarLetter = firstName ? firstName.charAt(0).toUpperCase() : '?'

  const handleLayout = (e: LayoutChangeEvent) => {
    // Drives the radial gradient's height only (the collapse threshold is a
    // device-tuned constant in HomeScreen, not derived from this measurement).
    setHeaderH(e.nativeEvent.layout.height)
  }

  return (
    <View
      testID="home-header"
      onLayout={handleLayout}
      style={styles.root}
    >
      {/* Organic radial brand flow (no vertical direction), covering the full
          header including the status-bar inset zone (header reaches y=0, so no
          separate top block is needed). */}
      <HeaderRadialGradient
        testID="home-header-radial"
        width={winW}
        height={headerH}
        gid="home-header-grad"
        cx="70%"
        cy="16%"
        r="82%"
        stops={EXPANDED_STOPS}
      />
      {/* Single smooth peach wave = the header's bottom edge into the body. */}
      <HomeHeaderWave />

      <Animated.View style={contentStyle}>
      <View style={[styles.inner, { paddingTop: insets.top + spacing[4] }]}>
        {/* Top row: greeting (left) + bell + avatar (right) */}
        <View style={styles.topRow}>
          <View style={styles.left}>
            {/* The single Mustica display moment on Home (spec §9.1). */}
            <Text variant="display.sm" style={styles.greeting}>
              {greeting}, {displayName}
            </Text>
            <View style={styles.locationRow}>
              <HomeHeaderLocation
                area={area}
                city={city}
                locationContext={locationContext}
                onPress={onLocationPress}
                tone="onBrand"
              />
            </View>
          </View>

          <View style={styles.cluster}>
            <TouchableOpacity
              testID="home-header-bell"
              onPress={() => onNotificationPress?.()}
              accessibilityLabel="Notifications"
              accessibilityRole="button"
              style={styles.chromeBtn}
            >
              <Bell size={18} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Avatar — tappable, routes to the Profile tab via onAvatarPress
                (parent owns routing). Image when avatarUrl present; brand-rose→
                brand-coral gradient with the firstName initial otherwise. A
                white ring keeps it readable against the matching brand bg. */}
            <TouchableOpacity
              testID="home-header-avatar"
              onPress={onAvatarPress}
              accessibilityLabel="Profile"
              accessibilityRole="button"
              style={styles.avatar}
            >
              {avatarUrl ? (
                <Image
                  testID="home-header-avatar-image"
                  source={{ uri: avatarUrl }}
                  style={styles.avatarImg}
                  contentFit="cover"
                  accessibilityLabel="Profile photo"
                />
              ) : (
                <LinearGradient
                  colors={[color.brandRose, color.brandCoral]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.avatarImg}
                >
                  <Text
                    testID="home-header-avatar-initial"
                    variant="label.md"
                    style={styles.avatarInitial}
                  >
                    {avatarLetter}
                  </Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Full-width tap-through search bar (stays cream on the brand surface) */}
        <View style={styles.searchWrap}>
          <HomeSearchBar onPress={onSearchPress} />
        </View>
      </View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    // Brand base (= gradient top colour); a 1-frame fallback behind the radial
    // until onLayout measures the height. There is no separate status-bar mask —
    // the header's own radial fills the status-bar inset. paddingBottom leaves
    // room for the wave PLUS a band of red below the search bar (owner
    // direction: more red before the wave). Horizontal padding lives on `inner`
    // so the gradient + wave span edge-to-edge.
    backgroundColor: EXPANDED_HEADER_TOP,
    paddingBottom: WAVE_HEIGHT + spacing[5],
  },
  inner: {
    paddingHorizontal: 18,
    // paddingTop is applied inline (insets.top + spacing[4]) so the gradient
    // above fills the status-bar inset while the content clears it.
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: {
    flex: 1,
    marginRight: spacing[2],
  },
  greeting: {
    letterSpacing: -0.2,
    color: ON_BRAND_TEXT,
  },
  locationRow: {
    marginTop: spacing[1],
  },
  cluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  // Bell — frosted translucent-white square + white glyph; reads as light
  // chrome on the brand surface (was cream-rose on the cream header).
  chromeBtn: {
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
  searchWrap: {
    marginTop: spacing[3],
  },
})

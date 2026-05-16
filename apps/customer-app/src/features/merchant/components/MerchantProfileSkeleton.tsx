import React, { useEffect, useRef } from 'react'
import { View, StyleSheet, Animated, Dimensions } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { color, radius, spacing } from '@/design-system'
import { useMotionScale } from '@/design-system/useMotionScale'
import { HERO_HEIGHT } from './HeroSection'
import { COMPACT_BAR_HEIGHT } from './CollapsedHeader'

// §BD-3 — Merchant Profile loading skeleton.
//
// Replaces the centred `<RedeemoLoader>` that used to fire from the
// `if (isLoading || ... || isStaleNavigation)` gate in
// MerchantProfileScreen. Owner-locked 2026-05-17: the loading affordance
// must give the user a sense of where content will land instead of a
// spinner with no spatial cues. Mirrors the screen's structural
// vocabulary — banner, logo+name, meta row, tab bar, voucher cards.
//
// Palette (locked 2026-05-17 post first-round QA):
//   The skeleton echoes the real screen's identity in muted form so the
//   transition into the loaded state feels continuous rather than
//   tonally jarring.  Real-screen reference points:
//     - Default hero banner (`HeroBackdrop`) is a navy gradient
//       `['#0a1025', '#111d3a', '#1a2d52']` when `bannerUrl` is null.
//     - The page itself sits on cream `#FFF9F5`.
//     - Seeded merchant logos read warm/brown on the cream canvas.
//   The skeleton picks low-saturation cousins of those colours: a
//   muted-navy gradient on the banner, a warm-cream root, a distinctly
//   warmer tile for the logo block, and cool-grey text/tabs.  None of
//   the placeholder fills are bright — the shimmer is the only highlight.
//
// Composition over the existing shimmer primitive used by SkeletonTile:
// a looping Animated.timing on a shared horizontal translateX, with each
// placeholder block borrowing the same shimmer overlay. `useMotionScale`
// drops the animation duration to zero under reduce-motion so the
// shimmer doesn't loop for assistive-tech users.
//
// Surfaces:
//   - cold mount (existing `isLoading` branch)
//   - §BD-1 cross-merchant stale-data gate
//   - §BD-3 within-merchant branch-switch stale-data gate
//
// Accessibility:
//   - Root carries the same `accessibilityLabel` the previous
//     RedeemoLoader did ("Loading merchant profile") so existing
//     screen-reader behaviour is preserved.
//   - testID `merchant-profile-skeleton` is the canonical jest hook.

const BANNER_BLOCK_HEIGHT  = HERO_HEIGHT - COMPACT_BAR_HEIGHT
const LOGO_SIZE            = 84
const SHIMMER_DURATION_MS  = 1500

// Palette — see header comment for derivation.
//   PAGE_BG          mirrors MerchantProfileScreen's cream container.
//   BANNER_GRADIENT  desaturated cousin of the real navy banner — three
//                    stops keep a hint of the real gradient's depth.
//   LOGO_BG          warm-cream tile that pre-blocks the merchant logo
//                    spot without claiming a specific brand colour.
//   PLACEHOLDER_BG   cool-grey for text lines, pills, and tabs — sits
//                    quietly against the cream page so the warmer
//                    banner+logo carry the visual identity.
const PAGE_BG          = '#FFF9F5'
const BANNER_GRADIENT  = ['#D8DDE8', '#D0D6E2', '#C9D0DE'] as const
const LOGO_BG          = '#E8DFD3'
const PLACEHOLDER_BG   = '#E5E7EB'

function useShimmerTranslate(width: number) {
  const shimmer = useRef(new Animated.Value(0)).current
  const scale   = useMotionScale()
  useEffect(() => {
    if (scale === 0) {
      // Reduce-motion: park the value so the overlay sits off-screen.
      shimmer.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue:         1,
        duration:        SHIMMER_DURATION_MS,
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => { loop.stop() }
  }, [shimmer, scale])
  return shimmer.interpolate({ inputRange: [0, 1], outputRange: [-width, width] })
}

function ShimmerBlock({
  width,
  height,
  borderRadius = radius.sm,
  backgroundColor = PLACEHOLDER_BG,
  style,
}: {
  width: number | `${number}%`
  height: number
  borderRadius?: number
  backgroundColor?: string
  style?: any
}) {
  const screenWidth = Dimensions.get('window').width
  const translateX  = useShimmerTranslate(screenWidth)
  return (
    <View
      style={[
        { width, height, borderRadius, backgroundColor, overflow: 'hidden' },
        style,
      ]}
    >
      <Animated.View
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          transform: [{ translateX }],
          backgroundColor: 'rgba(255,255,255,0.35)',
          width: '50%',
        }}
      />
    </View>
  )
}

// Banner is a wide gradient block instead of a flat shimmer fill — the
// three-stop muted navy reproduces the real-screen banner's vertical
// depth in a low-saturation palette. The shimmer overlay still scrolls
// across it for the loading affordance.
function BannerBlock() {
  const screenWidth = Dimensions.get('window').width
  const translateX  = useShimmerTranslate(screenWidth)
  return (
    <View
      testID="merchant-profile-skeleton-banner"
      style={{
        width: '100%',
        height: BANNER_BLOCK_HEIGHT,
        overflow: 'hidden',
      }}
    >
      <LinearGradient
        colors={[...BANNER_GRADIENT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <Animated.View
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          transform: [{ translateX }],
          backgroundColor: 'rgba(255,255,255,0.18)',
          width: '50%',
        }}
      />
    </View>
  )
}

function SkeletonVoucherCard() {
  return (
    <View style={styles.voucherCard} testID="merchant-profile-skeleton-voucher-card">
      <View style={styles.voucherCardHeader}>
        <ShimmerBlock width={48} height={48} borderRadius={radius.md} />
        <View style={{ flex: 1, gap: spacing[2] }}>
          <ShimmerBlock width="70%" height={16} />
          <ShimmerBlock width="40%" height={12} />
        </View>
      </View>
      <View style={styles.voucherCardBody}>
        <ShimmerBlock width="90%" height={14} />
        <ShimmerBlock width="60%" height={14} />
      </View>
    </View>
  )
}

export function MerchantProfileSkeleton() {
  return (
    <View
      style={styles.root}
      testID="merchant-profile-skeleton"
      accessibilityLabel="Loading merchant profile"
      accessibilityRole="progressbar"
    >
      {/* Banner — muted-navy gradient strip mirroring the real
          HeroBackdrop's vertical depth in a low-saturation palette.
          Height matches HERO_HEIGHT minus the collapsed-bar reserve
          so the logo lands in roughly the right vertical position
          relative to the loaded screen. */}
      <BannerBlock />

      {/* Logo + name + descriptor cluster. Positioned to overlap the
          banner slightly, mirroring the real-screen logo card. The
          logo tile uses a warm-cream tint that hints at typical
          merchant brand colours without claiming a specific one. */}
      <View style={styles.identityCluster} testID="merchant-profile-skeleton-identity">
        <ShimmerBlock
          width={LOGO_SIZE}
          height={LOGO_SIZE}
          borderRadius={radius.lg}
          backgroundColor={LOGO_BG}
          style={styles.logoBlock}
        />
        <View style={styles.nameCluster}>
          <ShimmerBlock width="70%" height={22} borderRadius={radius.xs} />
          <ShimmerBlock width="45%" height={14} borderRadius={radius.xs} />
        </View>
      </View>

      {/* Meta row — rating pill + distance pill + open-status pill. */}
      <View style={styles.metaRow} testID="merchant-profile-skeleton-meta">
        <ShimmerBlock width={80}  height={18} borderRadius={radius.pill} />
        <ShimmerBlock width={64}  height={18} borderRadius={radius.pill} />
        <ShimmerBlock width={56}  height={18} borderRadius={radius.pill} />
      </View>

      {/* Tab bar — 4 small pills (Vouchers / About / Branches / Reviews). */}
      <View style={styles.tabBar} testID="merchant-profile-skeleton-tabs">
        <ShimmerBlock width={80}  height={28} borderRadius={radius.pill} />
        <ShimmerBlock width={64}  height={28} borderRadius={radius.pill} />
        <ShimmerBlock width={88}  height={28} borderRadius={radius.pill} />
        <ShimmerBlock width={72}  height={28} borderRadius={radius.pill} />
      </View>

      {/* Voucher card placeholders below the tab bar. Default tab is
          Vouchers, so these are what the user expects to see. Three
          cards is the same count the real Vouchers tab typically
          surfaces above the fold. */}
      <View style={styles.voucherList} testID="merchant-profile-skeleton-vouchers">
        <SkeletonVoucherCard />
        <SkeletonVoucherCard />
        <SkeletonVoucherCard />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: PAGE_BG,
  },
  identityCluster: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop:    spacing[4],
    marginTop:     -spacing[6], // overlap the banner like the real screen
  },
  logoBlock: {
    // White border (4pt) around the logo tile gives it the same
    // standalone-card feel the real logo card has, lifting it cleanly
    // off both the banner and the cream page.
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  nameCluster: {
    flex: 1,
    gap:  spacing[2],
  },
  metaRow: {
    flexDirection: 'row',
    gap:           spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop:    spacing[3],
  },
  tabBar: {
    flexDirection: 'row',
    gap:           spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop:    spacing[5],
    paddingBottom: spacing[3],
  },
  voucherList: {
    paddingHorizontal: spacing[4],
    paddingTop:        spacing[3],
    gap:               spacing[3],
  },
  voucherCard: {
    backgroundColor: '#FFFFFF',
    borderRadius:    radius.lg,
    padding:         spacing[4],
    gap:             spacing[3],
    borderWidth:     1,
    borderColor:     color.border.subtle,
  },
  voucherCardHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing[3],
  },
  voucherCardBody: {
    gap: spacing[2],
  },
})

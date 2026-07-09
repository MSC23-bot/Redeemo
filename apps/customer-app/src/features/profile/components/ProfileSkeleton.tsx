import React, { useEffect, useRef } from 'react'
import { View, StyleSheet, Animated, Dimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { radius, spacing } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'

// Profile Sub-PR 1 minors — loading skeleton (docs/deferrals/open-register.md).
//
// Replaces the `if (profileLoading || !profile) return null` gate in
// ProfileScreen, which previously rendered a blank white screen while
// `useMe()` was pending. Mirrors the canonical shimmer pattern shipped in
// `apps/customer-app/src/features/merchant/components/MerchantProfileSkeleton.tsx`
// and `apps/customer-app/src/features/savings/components/SavingsSkeleton.tsx`:
// a single horizontal translateX shimmer over cool-grey placeholder blocks,
// parked (reduce-motion) via `useMotionScale`.
//
// Structural vocabulary mirrors the loaded screen (ProfileHeader +
// ProfileSectionCard rows): identity card (avatar circle + two text lines
// + strength-bar placeholder), then four section-card shells with 2-3 row
// placeholders each — My Account, Subscription, Notifications/Settings,
// Support — so the transition into the loaded state feels continuous
// rather than a jarring blank-to-full-content pop.

const PAGE_BG        = '#FAF8F5'   // matches ProfileScreen's screen bg
const PLACEHOLDER_BG = '#E5E7EB'
const CARD_BG        = '#FFFFFF'
const AVATAR_SIZE    = 52
const SHIMMER_DURATION_MS = 1500

function useShimmerTranslate(width: number) {
  const shimmer = useRef(new Animated.Value(0)).current
  const scale   = useMotionScale()
  useEffect(() => {
    if (scale === 0) { shimmer.setValue(0); return }
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

// Identity card — avatar circle + name/email lines + strength-bar
// placeholder, mirroring ProfileHeader's card shape/padding/shadow.
function IdentityCard() {
  return (
    <View style={styles.identityCard} testID="profile-skeleton-identity">
      <ShimmerBlock width={AVATAR_SIZE} height={AVATAR_SIZE} borderRadius={radius.lg} />
      <View style={styles.identityInfo}>
        <ShimmerBlock width="55%" height={15} borderRadius={radius.xs} />
        <ShimmerBlock width="70%" height={12} borderRadius={radius.xs} style={{ marginTop: spacing[2] }} />
        <ShimmerBlock width="100%" height={5} borderRadius={3} style={{ marginTop: spacing[4] }} />
      </View>
    </View>
  )
}

function SkeletonRow({ isFirst }: { isFirst?: boolean }) {
  return (
    <View style={[styles.row, !isFirst && styles.rowBorder]}>
      <ShimmerBlock width="45%" height={13} borderRadius={radius.xs} />
      <ShimmerBlock width={16} height={16} borderRadius={radius.xs} />
    </View>
  )
}

function SectionCardShell({
  testID,
  titleWidth,
  rowCount,
}: {
  testID: string
  titleWidth: number
  rowCount: number
}) {
  return (
    <View style={styles.sectionWrapper} testID={testID}>
      <ShimmerBlock width={titleWidth} height={10} borderRadius={radius.xs} style={styles.sectionTitle} />
      <View style={styles.card}>
        {Array.from({ length: rowCount }).map((_, i) => (
          <SkeletonRow key={i} isFirst={i === 0} />
        ))}
      </View>
    </View>
  )
}

export function ProfileSkeleton() {
  const insets = useSafeAreaInsets()
  return (
    <View
      style={[styles.root, { paddingTop: insets.top }]}
      testID="profile-skeleton"
      accessibilityLabel="Loading your profile"
      accessibilityRole="progressbar"
    >
      <View style={styles.content}>
        <IdentityCard />

        <SectionCardShell testID="profile-skeleton-section-account" titleWidth={90} rowCount={4} />
        <SectionCardShell testID="profile-skeleton-section-subscription" titleWidth={110} rowCount={2} />
        <SectionCardShell testID="profile-skeleton-section-settings" titleWidth={100} rowCount={3} />
        <SectionCardShell testID="profile-skeleton-section-support" titleWidth={80} rowCount={2} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: PAGE_BG },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  identityCard: {
    backgroundColor: CARD_BG, borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1, marginBottom: 16,
  },
  identityInfo: { flex: 1, minWidth: 0 },
  sectionWrapper: { marginBottom: 16 },
  sectionTitle:   { marginBottom: 6, marginLeft: 4 },
  card: {
    backgroundColor: CARD_BG, borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F3F4F6',
  },
})

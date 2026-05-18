import React, { useEffect, useRef } from 'react'
import { Animated, Dimensions, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { radius, spacing } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'

// §Savings Rebaseline (PR-B, Revision 2): structural skeleton.
//
// Mirrors the canonical §BD-3 pattern shipped in
// `apps/customer-app/src/features/merchant/components/MerchantProfileSkeleton.tsx`
// (locked 2026-05-17).  Two-tier palette:
//   - WARM zone (page bg + hero block): muted-navy gradient on the
//     hero strip so the skeleton hints at "something rich coming" but
//     does NOT commit brand-red identity colour before the data
//     resolves the eventual State 1 / 2 / 3 branch.
//   - COOL-GREY zone (insight cards, ROI shell, row shells): each
//     content placeholder block is `#E5E7EB` text-grey on a white
//     card surface so the structural rhythm of the loaded screen is
//     visible.
//
// Shimmer is a single horizontal translateX over each block.  Reduce-
// motion (useMotionScale → 0) parks the value off-screen; placeholders
// remain visible as static muted blocks — the skeleton still reads as
// "loading" via the structural mirroring + the accessibility role.

const PAGE_BG          = '#F8F9FA'   // matches loaded SavingsScreen surface.neutral
const HERO_GRADIENT    = ['#D8DDE8', '#D0D6E2', '#C9D0DE'] as const  // muted-navy mirror of MerchantProfileSkeleton
const PLACEHOLDER_BG   = '#E5E7EB'   // cool-grey for text / pills / bars
const CARD_BG          = '#FFFFFF'   // white card surface (matches loaded insight cards)
const HERO_BLOCK_HEIGHT = 200
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

// Hero — three-stop muted-navy gradient block with a shimmer overlay.
// Content placeholders inside sketch the populated-state layout (small
// title + eyebrow + large lifetime + two chip placeholders) so the
// transition to a loaded populated state is structurally continuous.
// For free / subscriber-empty states the actual hero replaces this
// block entirely.
function HeroBlock({ topInset }: { topInset: number }) {
  const screenWidth = Dimensions.get('window').width
  const translateX  = useShimmerTranslate(screenWidth)
  return (
    <View
      testID="savings-skeleton-hero"
      style={{
        width: '100%',
        height: HERO_BLOCK_HEIGHT,
        overflow: 'hidden',
      }}
    >
      <LinearGradient
        colors={[...HERO_GRADIENT]}
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
      {/* App bar placeholder */}
      <View style={[styles.heroAppBar, { paddingTop: topInset + 10 }]}>
        <View style={styles.heroAppBarTitle} />
      </View>
      {/* Populated-state inner placeholders */}
      <View style={styles.heroInner}>
        <View style={styles.heroEyebrow} />
        <View style={styles.heroLifetime} />
        <View style={styles.heroChipRow}>
          <View style={styles.heroChip} />
          <View style={styles.heroChip} />
        </View>
      </View>
    </View>
  )
}

function InsightCardShell({
  testID,
  height,
  children,
}: {
  testID: string
  height: number
  children?: React.ReactNode
}) {
  return (
    <View testID={testID} style={[styles.cardShell, { height }]}>
      {children}
    </View>
  )
}

function TrendCardChildren() {
  // Section label + 6 vertical bars of varying heights.
  return (
    <>
      <ShimmerBlock width={120} height={10} borderRadius={radius.xs} />
      <View style={styles.trendBarRow}>
        {[40, 56, 48, 80, 64, 110].map((h, i) => (
          <ShimmerBlock key={i} width={20} height={h} borderRadius={radius.xs} />
        ))}
      </View>
    </>
  )
}

function TopBranchesCardChildren() {
  // Section label + two rows (logo tile + 2 text lines + saving amount).
  return (
    <>
      <ShimmerBlock width={110} height={10} borderRadius={radius.xs} />
      {[0, 1].map((i) => (
        <View key={i} style={styles.topBranchesRow}>
          <ShimmerBlock width={46} height={46} borderRadius={14} />
          <View style={{ flex: 1, gap: spacing[1] }}>
            <ShimmerBlock width="60%" height={12} borderRadius={radius.xs} />
            <ShimmerBlock width="40%" height={10} borderRadius={radius.xs} />
          </View>
          <ShimmerBlock width={56} height={16} borderRadius={radius.xs} />
        </View>
      ))}
    </>
  )
}

function ByCategoryCardChildren() {
  // Section label + 4 horizontal bar rows.
  return (
    <>
      <ShimmerBlock width={90} height={10} borderRadius={radius.xs} />
      <View style={{ gap: spacing[3], marginTop: spacing[3] }}>
        {[0.85, 0.55, 0.4, 0.3].map((pct, i) => (
          <View key={i} style={styles.categoryBarRow}>
            <View style={styles.categoryBarHeader}>
              <ShimmerBlock width={80}  height={10} borderRadius={radius.xs} />
              <ShimmerBlock width={40}  height={10} borderRadius={radius.xs} />
            </View>
            <ShimmerBlock width={`${pct * 100}%` as `${number}%`} height={8} borderRadius={4} />
          </View>
        ))}
      </View>
    </>
  )
}

function RoiShell() {
  return (
    <View testID="savings-skeleton-card-roi" style={styles.roiShell}>
      <ShimmerBlock width="80%" height={14} borderRadius={radius.xs} />
    </View>
  )
}

function RowShell() {
  return (
    <View style={styles.rowShell}>
      <ShimmerBlock width={46} height={46} borderRadius={14} />
      <View style={{ flex: 1, gap: spacing[1] }}>
        <ShimmerBlock width="55%" height={12} borderRadius={radius.xs} />
        <ShimmerBlock width="35%" height={10} borderRadius={radius.xs} />
      </View>
      <View style={{ alignItems: 'flex-end', gap: spacing[1] }}>
        <ShimmerBlock width={40} height={14} borderRadius={radius.xs} />
        <ShimmerBlock width={56} height={10} borderRadius={radius.xs} />
      </View>
    </View>
  )
}

export function SavingsSkeleton() {
  const insets = useSafeAreaInsets()
  return (
    <View
      style={styles.root}
      testID="savings-skeleton"
      accessibilityLabel="Loading your savings"
      accessibilityRole="progressbar"
    >
      <HeroBlock topInset={insets.top} />

      <View style={styles.cardsList}>
        <InsightCardShell testID="savings-skeleton-card-trend" height={180}>
          <TrendCardChildren />
        </InsightCardShell>

        <InsightCardShell testID="savings-skeleton-card-top-branches" height={150}>
          <TopBranchesCardChildren />
        </InsightCardShell>

        <InsightCardShell testID="savings-skeleton-card-categories" height={160}>
          <ByCategoryCardChildren />
        </InsightCardShell>

        <RoiShell />

        <View style={styles.rowsBlock} testID="savings-skeleton-rows">
          <RowShell />
          <RowShell />
          <RowShell />
        </View>
      </View>
    </View>
  )
}

// Exported separately for the month drill-down loading state inside
// SavingsScreen.  Renders just Card 2 + Card 3 shells with the same
// cool-grey placeholders.
export function InsightSkeleton() {
  return (
    <View style={styles.insightSkelContainer} testID="savings-insight-skeleton">
      <InsightCardShell testID="savings-insight-skeleton-top-branches" height={150}>
        <TopBranchesCardChildren />
      </InsightCardShell>
      <InsightCardShell testID="savings-insight-skeleton-categories" height={160}>
        <ByCategoryCardChildren />
      </InsightCardShell>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  heroAppBar: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[3],
  },
  heroAppBarTitle: {
    width: 100,
    height: 24,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  heroInner: {
    alignItems: 'center',
    paddingTop: spacing[2],
    gap: spacing[3],
  },
  heroEyebrow: {
    width: 80,
    height: 11,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  heroLifetime: {
    width: 180,
    height: 44,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  heroChipRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[2],
  },
  heroChip: {
    width: 110,
    height: 50,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  cardsList: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    gap: spacing[3],
  },
  cardShell: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: spacing[4],
    gap: spacing[3],
  },
  trendBarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 120,
    marginTop: spacing[2],
  },
  topBranchesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  categoryBarRow: {
    gap: spacing[1],
  },
  categoryBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  roiShell: {
    backgroundColor: '#FEF3C7',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(226,12,4,0.12)',
    padding: spacing[4],
    alignItems: 'center',
  },
  rowsBlock: {
    gap: spacing[2],
    marginTop: spacing[2],
  },
  rowShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: spacing[3],
  },
  insightSkelContainer: {
    gap: spacing[3],
    paddingTop: spacing[3],
  },
})

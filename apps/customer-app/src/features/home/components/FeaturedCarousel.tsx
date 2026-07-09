import React, { useRef, useState, useCallback, useMemo } from 'react'
import { View, ScrollView, StyleSheet, useWindowDimensions } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { spacing } from '@/design-system'
import { FadeInDown } from '@/design-system/motion/FadeIn'
import { FeaturedHeroCard } from './FeaturedHeroCard'
import { DotIndicator } from '@/features/shared/DotIndicator'
import { scrollActivity } from '@/design-system/motion/scrollActivity'
import type { HomeRail } from '@/lib/api/discovery'
import { RailHeader } from './RailHeader'

// 2026-06-02 design pass — Featured is paid placement, so it must stand out.
// The hero tile is now near-full-width with a deliberate PEEK of the next
// card so users see there's more to scroll (reinforcing the existing
// auto-scroll). Width = screenW − leftPad(18) − gap(12) − peek(28); the 28pt
// reveal of card N+1 is the scroll affordance. snapToInterval reads the
// computed width so the snap follows automatically.
const TILE_GAP = 12
const HERO_PEEK = 28
const AUTO_SCROLL_INTERVAL = 10000

type Props = {
  rail: HomeRail
  // Receives branch.id — call site routes to
  // /merchant/${branch.merchant.id}?branch=${branchId}&from=home.
  onBranchPress: (branchId: string) => void
  onFavourite?: (id: string) => void
}

// Perf batch 1 (2026-07-09) — React.memo'd: HomeScreen now passes a stable
// (useCallback) `onBranchPress` and the `rail` reference only changes when
// the feed's featuredRail itself changes, so this carousel (and its own
// 10s auto-advance timer — see Task 2) skips re-rendering on unrelated
// HomeScreen state churn.
export const FeaturedCarousel = React.memo(function FeaturedCarousel({ rail, onBranchPress }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const branches = rail.branches

  const { width: screenW } = useWindowDimensions()
  // Near-full-width hero with a 28pt peek of the next card (see HERO_PEEK note).
  const TILE_WIDTH = screenW - 18 - TILE_GAP - HERO_PEEK

  const startAutoScroll = useCallback(() => {
    if (branches.length <= 1) return
    timerRef.current = setInterval(() => {
      // Perf batch 1 (2026-07-09) — skip this tick while the vertical Home
      // feed is actively scrolling (module-level `scrollActivity` flag,
      // flipped by HomeScreen's scroll handlers). Reading `.value` from JS
      // inside a once-per-AUTO_SCROLL_INTERVAL callback is cheap (no
      // per-frame work); it just stops the carousel fighting a mid-fling
      // scroll with its own `scrollTo`.
      if (scrollActivity.value === 1) return
      setActiveIndex((prev) => {
        const next = (prev + 1) % branches.length
        scrollRef.current?.scrollTo({
          x: next * (TILE_WIDTH + TILE_GAP),
          animated: true,
        })
        return next
      })
    }, AUTO_SCROLL_INTERVAL)
  }, [branches.length, TILE_WIDTH])

  // Perf batch 1 (2026-07-09) — focus-gate the auto-advance timer.
  // expo-router Tabs keep Home mounted across tab switches, so the previous
  // plain `useEffect` (which only cleared on UNMOUNT) left this 10s interval
  // running forever in the background once the user left the Home tab.
  // `useFocusEffect` starts it fresh on every focus and fully clears it on
  // blur, matching the pattern the Home suites already mock (see
  // `HomeScreen.scrollReset.test.tsx`'s `expo-router` mock).
  useFocusEffect(
    useCallback(() => {
      startAutoScroll()
      return () => {
        if (timerRef.current) clearInterval(timerRef.current)
      }
    }, [startAutoScroll])
  )

  // PR #126 device-QA Halifax fixup (2026-05-23): determine whether the
  // Featured rail's NEARBY+CITY supply is genuinely IN the locality (every
  // visible branch passes the strict-locality identity ladder from
  // §6.4.1) — vs CATCHMENT/POST_TOWN tier (visible branches are nearby
  // but in different localities).  Drives the "Featured in {City}" vs
  // "Featured near {City}" copy switch on <RailHeader>.
  //
  // Ignored when scopeExpanded is true (cascade copy "Featured on Redeemo"
  // already overrides locality framing).  Returns null when locality is
  // null (defensive — RailHeader falls back to "Featured near you").
  // MUST run BEFORE the early return below — a hook called after a
  // conditional return breaks react-hooks/rules-of-hooks.
  const allBranchesInLocality = useMemo<boolean | null>(() => {
    if (!rail.meta?.locality) return null
    if (rail.meta.scopeExpanded) return null
    const targetId    = rail.meta.locality.id
    const targetLower = rail.meta.locality.name.toLowerCase()
    return branches.every((b) =>
      b.branchLocalityId === targetId ||
      b.branchLocalityName?.toLowerCase() === targetLower ||
      b.branchPostTown?.toLowerCase()     === targetLower
    )
  }, [rail.meta?.locality, rail.meta?.scopeExpanded, branches])

  // Phase C §11.6 — hide rail silently when meta is null OR no branches.
  if (!rail.meta || branches.length === 0) return null

  return (
    // 2026-06-03 — Featured sits on the plain body (owner: NO band for Featured;
    // it stands out via the editorial hero card itself). Only Popular/Trending
    // get a highlighted band.
    <View style={styles.section} testID="featured-band">
      {/* Conditional-copy header per spec §7 + §11.1 */}
      <RailHeader
        meta={rail.meta}
        railKind="featured"
        allBranchesInLocality={allBranchesInLocality}
        {...(rail.meta.scopeExpanded ? { subtitle: 'Here are the closest matches we have' } : {})}
      />

      <View style={{ marginTop: spacing[3] }} />

      {/* Horizontal scroll of tiles */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled={false}
        snapToInterval={TILE_WIDTH + TILE_GAP}
        snapToAlignment="start"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 18, gap: TILE_GAP }}
        onMomentumScrollEnd={(e) => {
          const offsetX = e.nativeEvent.contentOffset.x
          const index = Math.round(offsetX / (TILE_WIDTH + TILE_GAP))
          setActiveIndex(index)
          if (timerRef.current) clearInterval(timerRef.current)
          startAutoScroll()
        }}
      >
        {branches.map((branch, i) => {
          // Branch-keyed identity (Phase 2.3) — two branches of the same
          // merchant render as TWO distinct carousel tiles per the locked
          // §M one-pin-per-branch principle.
          const tile = (
            <FeaturedHeroCard
              key={branch.id}
              branch={branch}
              onPress={onBranchPress}
              width={TILE_WIDTH}
            />
          )
          // Batch 5 §10.1 — first 4 tiles fade-up in sequence (50ms each),
          // first-mount only (rail renders only when data exists; FadeInDown
          // animates once per mounted tile; stable branch.id keys mean an
          // in-place refetch does not re-stagger). Reduced-motion-safe.
          return i < 4
            ? <FadeInDown key={branch.id} delay={i * 50}>{tile}</FadeInDown>
            : tile
        })}
      </ScrollView>

      {/* Dot indicator */}
      {branches.length > 1 && (
        <DotIndicator count={branches.length} activeIndex={activeIndex} />
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  // Vertical rhythm now that Featured has no band — mirrors the old band padding.
  section: { paddingTop: spacing[2], paddingBottom: spacing[5] },
})

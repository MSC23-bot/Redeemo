import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { View, ScrollView, StyleSheet, useWindowDimensions } from 'react-native'
import { spacing } from '@/design-system'
import { FadeInDown } from '@/design-system/motion/FadeIn'
import { FeaturedHeroCard } from './FeaturedHeroCard'
import { DotIndicator } from '@/features/shared/DotIndicator'
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

export function FeaturedCarousel({ rail, onBranchPress }: Props) {
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

  useEffect(() => {
    startAutoScroll()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [startAutoScroll])

  // Phase C §11.6 — hide rail silently when meta is null OR no branches.
  if (!rail.meta || branches.length === 0) return null

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
}

const styles = StyleSheet.create({
  // Vertical rhythm now that Featured has no band — mirrors the old band padding.
  section: { paddingTop: spacing[2], paddingBottom: spacing[5] },
})

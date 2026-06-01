import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { View, ScrollView } from 'react-native'
import { spacing } from '@/design-system'
import { FadeInDown } from '@/design-system/motion/FadeIn'
import { BranchTile } from '@/features/shared/BranchTile'
import { DotIndicator } from '@/features/shared/DotIndicator'
import type { HomeRail } from '@/lib/api/discovery'
import { RailHeader } from './RailHeader'
import { SectionBand } from './SectionBand'

// Batch 1B Tier 3 (2026-06-01) — wider hero tile (260→284) for a more
// premium, less "underscaled" Featured rail. snapToInterval below reads
// TILE_WIDTH so the snap follows automatically.
const TILE_WIDTH = 284
const TILE_GAP = 12
const AUTO_SCROLL_INTERVAL = 10000

type Props = {
  rail: HomeRail
  // Receives branch.id — call site routes to
  // /merchant/${branch.merchant.id}?branch=${branchId}&from=home.
  onBranchPress: (branchId: string) => void
  onFavourite?: (id: string) => void
}

export function FeaturedCarousel({ rail, onBranchPress, onFavourite }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const branches = rail.branches

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
  }, [branches.length])

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
    // Batch 2 M3 — full-bleed cream identity band (Composition B §9.4).
    <SectionBand variant="cream" testID="featured-band">
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
            <BranchTile
              key={branch.id}
              branch={branch}
              onPress={onBranchPress}
              {...(onFavourite ? { onFavourite } : {})}
              showFeaturedBadge
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
    </SectionBand>
  )
}

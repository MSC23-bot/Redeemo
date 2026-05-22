import React, { useRef, useState, useEffect, useCallback } from 'react'
import { View, ScrollView } from 'react-native'
import { spacing } from '@/design-system'
import { BranchTile } from '@/features/shared/BranchTile'
import { DotIndicator } from '@/features/shared/DotIndicator'
import type { HomeRail } from '@/lib/api/discovery'
import { RailHeader } from './RailHeader'

const TILE_WIDTH = 260
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

  return (
    <View>
      {/* Conditional-copy header per spec §7 + §11.1 */}
      <RailHeader
        meta={rail.meta}
        railKind="featured"
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
        {branches.map((branch) => (
          // Branch-keyed identity (Phase 2.3) — two branches of the same
          // merchant render as TWO distinct carousel tiles per the locked
          // §M one-pin-per-branch principle.
          <BranchTile
            key={branch.id}
            branch={branch}
            onPress={onBranchPress}
            {...(onFavourite ? { onFavourite } : {})}
            showFeaturedBadge
            width={TILE_WIDTH}
          />
        ))}
      </ScrollView>

      {/* Dot indicator */}
      {branches.length > 1 && (
        <DotIndicator count={branches.length} activeIndex={activeIndex} />
      )}
    </View>
  )
}

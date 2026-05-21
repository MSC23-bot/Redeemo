import React, { useRef, useState, useEffect, useCallback } from 'react'
import { View, ScrollView, TouchableOpacity } from 'react-native'
import { Star } from 'lucide-react-native'
import { Text, color, spacing } from '@/design-system'
import { BranchTile } from '@/features/shared/BranchTile'
import { DotIndicator } from '@/features/shared/DotIndicator'
import { BranchTile as BranchTileType } from '@/lib/api/discovery'

const TILE_WIDTH = 260
const TILE_GAP = 12
const AUTO_SCROLL_INTERVAL = 10000

type Props = {
  branches: BranchTileType[]
  // Receives branch.id — call site routes to
  // /merchant/${branch.merchant.id}?branch=${branchId}&from=home.
  onBranchPress: (branchId: string) => void
  onSeeAll: () => void
  onFavourite?: (id: string) => void
}

export function FeaturedCarousel({ branches, onBranchPress, onSeeAll, onFavourite }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  if (branches.length === 0) return null

  return (
    <View>
      {/* Section header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 18,
          marginBottom: spacing[3],
        }}
      >
        <Star size={16} color="#F59E0B" fill="#F59E0B" />
        <Text
          variant="heading.sm"
          style={{ color: color.navy, marginLeft: spacing[1], flex: 1 }}
        >
          Featured
        </Text>
        <TouchableOpacity onPress={onSeeAll} accessibilityLabel="See all featured merchants">
          <Text
            variant="label.md"
            style={{
              color: color.brandRose,
              fontFamily: 'Lato-SemiBold',
              fontSize: 13,
            }}
          >
            See all
          </Text>
        </TouchableOpacity>
      </View>

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

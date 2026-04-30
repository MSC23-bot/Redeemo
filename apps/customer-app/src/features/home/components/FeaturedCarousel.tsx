import React, { useRef, useState, useEffect, useCallback } from 'react'
import { View, ScrollView, TouchableOpacity } from 'react-native'
import { Star } from 'lucide-react-native'
import { Text, color, spacing } from '@/design-system'
import { MerchantTile } from '@/features/shared/MerchantTile'
import { DotIndicator } from '@/features/shared/DotIndicator'
import { MerchantTile as MerchantTileType } from '@/lib/api/discovery'

const TILE_WIDTH = 260
const TILE_GAP = 12
const AUTO_SCROLL_INTERVAL = 10000

type Props = {
  merchants: MerchantTileType[]
  onMerchantPress: (id: string) => void
  onSeeAll: () => void
  onFavourite?: (id: string) => void
}

export function FeaturedCarousel({ merchants, onMerchantPress, onSeeAll, onFavourite }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const scrollToIndex = useCallback(
    (index: number) => {
      const clampedIndex = Math.max(0, Math.min(index, merchants.length - 1))
      scrollRef.current?.scrollTo({
        x: clampedIndex * (TILE_WIDTH + TILE_GAP),
        animated: true,
      })
      setActiveIndex(clampedIndex)
    },
    [merchants.length],
  )

  const startAutoScroll = useCallback(() => {
    if (merchants.length <= 1) return
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % merchants.length
        scrollRef.current?.scrollTo({
          x: next * (TILE_WIDTH + TILE_GAP),
          animated: true,
        })
        return next
      })
    }, AUTO_SCROLL_INTERVAL)
  }, [merchants.length])

  useEffect(() => {
    startAutoScroll()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [startAutoScroll])

  if (merchants.length === 0) return null

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
        {merchants.map((merchant) => (
          <MerchantTile
            key={merchant.id}
            merchant={merchant}
            onPress={onMerchantPress}
            {...(onFavourite ? { onFavourite } : {})}
            showFeaturedBadge
            width={TILE_WIDTH}
          />
        ))}
      </ScrollView>

      {/* Dot indicator */}
      {merchants.length > 1 && (
        <DotIndicator count={merchants.length} activeIndex={activeIndex} />
      )}
    </View>
  )
}

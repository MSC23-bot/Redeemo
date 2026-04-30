import React, { useRef, useEffect } from 'react'
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native'
import { X } from 'lucide-react-native'
import { Text, color, spacing, radius, elevation, layer, motion } from '@/design-system'
import { MerchantTile } from '@/features/shared/MerchantTile'
import { DotIndicator } from '@/features/shared/DotIndicator'
import { MerchantTile as MerchantTileType } from '@/lib/api/discovery'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const TILE_WIDTH = SCREEN_WIDTH - spacing[4] * 2

type Props = {
  merchants: MerchantTileType[]
  activeIndex: number
  onClose: () => void
  onIndexChange: (index: number) => void
  onMerchantPress: (id: string) => void
  onFavourite?: (id: string) => void
}

export function MapMerchantTile({
  merchants,
  activeIndex,
  onClose,
  onIndexChange,
  onMerchantPress,
  onFavourite,
}: Props) {
  const translateY = useRef(new Animated.Value(300)).current
  const scrollRef = useRef<ScrollView>(null)

  // Slide in on mount
  useEffect(() => {
    Animated.spring(translateY, {
      toValue: 0,
      ...motion.spring.snappy,
      useNativeDriver: true,
    }).start()
  }, [translateY])

  // Sync scroll to activeIndex when it changes externally
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: activeIndex * TILE_WIDTH, animated: true })
  }, [activeIndex])

  const handleScroll = (e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x
    const index = Math.round(offsetX / TILE_WIDTH)
    if (index !== activeIndex && index >= 0 && index < merchants.length) {
      onIndexChange(index)
    }
  }

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY }] }]}>
      {/* Close button */}
      <Pressable
        onPress={onClose}
        accessibilityLabel="Close merchant tile"
        style={styles.closeButton}
      >
        <X size={16} color={color.text.secondary} />
      </Pressable>

      {/* Snap-scrolling horizontal list */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        decelerationRate="fast"
        snapToInterval={TILE_WIDTH}
        snapToAlignment="start"
        contentContainerStyle={styles.scrollContent}
      >
        {merchants.map((merchant) => (
          <View key={merchant.id} style={[styles.tileWrapper, { width: TILE_WIDTH }]}>
            <MerchantTile
              merchant={merchant}
              onPress={onMerchantPress}
              {...(onFavourite ? { onFavourite } : {})}
              width={TILE_WIDTH}
            />
          </View>
        ))}
      </ScrollView>

      {/* Dot indicators */}
      {merchants.length > 1 && (
        <DotIndicator count={merchants.length} activeIndex={activeIndex} />
      )}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    zIndex: layer.sticky,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
  },
  closeButton: {
    alignSelf: 'flex-end',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
    ...elevation.sm,
  },
  scrollContent: {
    gap: 0,
  },
  tileWrapper: {
    paddingHorizontal: 0,
  },
})

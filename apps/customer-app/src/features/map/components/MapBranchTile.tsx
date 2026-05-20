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
import { color, spacing, radius, elevation, layer, motion } from '@/design-system'
import { MerchantTile } from '@/features/shared/MerchantTile'
import { DotIndicator } from '@/features/shared/DotIndicator'
import {
  BranchTile as BranchTileType,
  MerchantTile as MerchantTileType,
} from '@/lib/api/discovery'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const TILE_WIDTH = SCREEN_WIDTH - spacing[4] * 2

type Props = {
  branches: BranchTileType[]
  activeIndex: number
  onClose: () => void
  onIndexChange: (index: number) => void
  /**
   * Fires with the tapped CARD's branch.id (not the merchant.id).  The
   * shared `<MerchantTile>` consumer below is fed an adapted object
   * whose `id` is `branch.id`, so its `onPress(merchant.id)` callback
   * propagates the branch identity naturally.  Phase D will wire the
   * `?branch=${id}&from=map` URL contract on top of this signature.
   */
  onBranchPress: (branchId: string) => void
  onFavourite?: (id: string) => void
}

/**
 * Phase C interim adapter — turns a `BranchTile` into a
 * `MerchantTile`-shaped object so the shared `<MerchantTile>` consumer
 * can render unchanged.  The crucial swap is `id: branch.id` (not
 * `branch.merchant.id`) — this is what makes the carousel
 * branch-identity-aware.  Phase 2.5 sweep will refactor the shared
 * component to accept `BranchTile` natively and this adapter goes away.
 *
 * Branch-level fields (`distance`, `isFavourited`, `avgRating`,
 * `reviewCount`, `proximityBand`, `supplyRung`, `distanceMetres`,
 * `latitude`, `longitude`, `nearestBranchId`) are sourced from the
 * `BranchTile`; merchant-grouping fields (`businessName`, `logoUrl`,
 * `bannerUrl`, `primaryCategory`, `descriptor`, `voucherCount`,
 * `maxEstimatedSaving`, etc.) come from `branch.merchant`.
 *
 * `supplyTier` is not on `BranchTile` (the BranchTile contract uses
 * the finer-grained `supplyRung` instead).  Defaults to `'NEARBY'` —
 * the shared `<MerchantTile>` doesn't visibly render `supplyTier`
 * (used only by upstream ranking).
 */
function branchToMerchantTile(branch: BranchTileType): MerchantTileType {
  // The shared `<MerchantTile>` reads only `primaryCategory?.name`
  // for its visible UI (line 49 of MerchantTile.tsx) — the other
  // category fields are along for the type contract.  Coerce the
  // optional `pinColour` / `pinIcon` to nullable to satisfy
  // MerchantTile's stricter typing without conditional spread noise.
  const primaryCategory = branch.merchant.primaryCategory
    ? {
        id:        branch.merchant.primaryCategory.id,
        name:      branch.merchant.primaryCategory.name,
        pinColour: branch.merchant.primaryCategory.pinColour ?? null,
        pinIcon:   branch.merchant.primaryCategory.pinIcon ?? null,
      }
    : null

  return {
    id:                  branch.id,
    businessName:        branch.merchant.businessName,
    tradingName:         branch.merchant.tradingName,
    logoUrl:             branch.merchant.logoUrl,
    bannerUrl:           branch.merchant.bannerUrl,
    primaryCategory,
    primaryDescriptorTag: branch.merchant.primaryDescriptorTag,
    subcategory:         branch.merchant.subcategory,
    voucherCount:        branch.merchant.voucherCount,
    maxEstimatedSaving:  branch.merchant.maxEstimatedSaving,
    distance:            branch.distance,
    nearestBranchId:     branch.id,
    latitude:            branch.branchLatitude,
    longitude:           branch.branchLongitude,
    avgRating:           branch.avgRating,
    reviewCount:         branch.reviewCount,
    isFavourited:        branch.isFavourited,
    supplyTier:          'NEARBY',
    descriptor:          branch.merchant.descriptor,
    // `highlights` is shape-incompatible between BranchTile (lean
    // `{ highlightTagId, label }[]`) and MerchantTile (rich
    // `{ id, highlightTagId, sortOrder, tag: { id, label } }[]`).
    // The shared `<MerchantTile>` doesn't render `highlights`, so we
    // simply omit (it's optional on MerchantTile).  Phase 2.5 sweep
    // will reconcile.
    supplyRung:          branch.supplyRung,
    proximityBand:       branch.proximityBand,
    distanceMetres:      branch.distanceMetres,
  }
}

export function MapBranchTile({
  branches,
  activeIndex,
  onClose,
  onIndexChange,
  onBranchPress,
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
    if (index !== activeIndex && index >= 0 && index < branches.length) {
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
        {branches.map((branch) => (
          // Branch-keyed identity (PR-3 Phase C) — two branches of the
          // same merchant render as TWO distinct carousel cards.
          <View key={branch.id} style={[styles.tileWrapper, { width: TILE_WIDTH }]}>
            <MerchantTile
              merchant={branchToMerchantTile(branch)}
              onPress={onBranchPress}
              {...(onFavourite ? { onFavourite } : {})}
              width={TILE_WIDTH}
            />
          </View>
        ))}
      </ScrollView>

      {/* Dot indicators */}
      {branches.length > 1 && (
        <DotIndicator count={branches.length} activeIndex={activeIndex} />
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

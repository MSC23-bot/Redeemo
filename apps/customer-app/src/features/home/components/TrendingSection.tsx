import React from 'react'
import { View, ScrollView } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Flame } from 'lucide-react-native'
import { Text, color, spacing } from '@/design-system'
import { MerchantTile } from '@/features/shared/MerchantTile'
import { BranchTile } from '@/lib/api/discovery'
import { branchToMerchantTileProps } from '../utils/branchToMerchantTile'

const TILE_WIDTH = 240
const TILE_GAP = 12

type Props = {
  branches: BranchTile[]
  // Receives branch.id — call site routes to
  // /merchant/${branch.merchant.id}?branch=${branchId}&from=home.
  onBranchPress: (branchId: string) => void
  onFavourite?: (id: string) => void
}

export function TrendingSection({ branches, onBranchPress, onFavourite }: Props) {
  if (branches.length === 0) return null

  return (
    <LinearGradient
      colors={['#FFF7ED', '#FEF3C7']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ paddingVertical: spacing[5] }}
    >
      {/* Section header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 18,
          marginBottom: spacing[3],
        }}
      >
        <Flame size={16} color="#EA580C" fill="#EA580C" />
        <Text
          variant="heading.sm"
          style={{ color: color.navy, marginLeft: spacing[1] }}
        >
          Trending near you
        </Text>
      </View>

      {/* Horizontal scroll of tiles */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 18, gap: TILE_GAP }}
      >
        {branches.map((branch) => (
          // Branch-keyed identity (Phase 2.3) — same pattern as
          // FeaturedCarousel; adapter swaps `id: branch.id` so the
          // `onPress` callback receives branch identity.
          <MerchantTile
            key={branch.id}
            merchant={branchToMerchantTileProps(branch)}
            onPress={onBranchPress}
            {...(onFavourite ? { onFavourite } : {})}
            width={TILE_WIDTH}
          />
        ))}
      </ScrollView>
    </LinearGradient>
  )
}

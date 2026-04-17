import React from 'react'
import { View, ScrollView } from 'react-native'
import { Text, color, spacing } from '@/design-system'
import { MerchantTile } from '@/features/shared/MerchantTile'
import { MerchantTile as MerchantTileType } from '@/lib/api/discovery'

const TILE_WIDTH = 240
const TILE_GAP = 12

type CategorySection = {
  category: { id: string; name: string }
  merchants: MerchantTileType[]
}

type Props = {
  sections: CategorySection[]
  onMerchantPress: (id: string) => void
  onFavourite?: (id: string) => void
}

export function NearbyByCategory({ sections, onMerchantPress, onFavourite }: Props) {
  // Filter out sections with no merchants
  const visibleSections = sections.filter((s) => s.merchants.length > 0)

  if (visibleSections.length === 0) return null

  return (
    <View style={{ paddingBottom: 100, gap: spacing[6] }}>
      {visibleSections.map((section) => (
        <View key={section.category.id}>
          {/* Section heading */}
          <Text
            variant="heading.sm"
            style={{
              color: color.navy,
              paddingHorizontal: 18,
              marginBottom: spacing[3],
            }}
          >
            {section.category.name} near you
          </Text>

          {/* Horizontal scroll of tiles */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 18, gap: TILE_GAP }}
          >
            {section.merchants.map((merchant) => (
              <MerchantTile
                key={merchant.id}
                merchant={merchant}
                onPress={onMerchantPress}
                {...(onFavourite ? { onFavourite } : {})}
                width={TILE_WIDTH}
              />
            ))}
          </ScrollView>
        </View>
      ))}
    </View>
  )
}

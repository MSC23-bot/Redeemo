import React from 'react'
import { View, ScrollView, Pressable, StyleSheet } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
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
  onCategoryPress: (categoryId: string) => void
  onFavourite?: (id: string) => void
}

/**
 * Home preview rows. Each section renders the category header (tappable)
 * + a "See all ›" chip on the right (also tappable) — both route to the
 * full-interaction CategoryResultsScreen at /category/:id where the user
 * picks scope, sort, voucher type, amenities, etc.
 *
 * Per the PR B architectural intent: Home stays a preview surface; filter
 * controls live in CategoryResultsScreen.
 */
export function NearbyByCategory({ sections, onMerchantPress, onCategoryPress, onFavourite }: Props) {
  // Filter out sections with no merchants
  const visibleSections = sections.filter((s) => s.merchants.length > 0)

  if (visibleSections.length === 0) return null

  return (
    <View style={{ paddingBottom: 100, gap: spacing[6] }}>
      {visibleSections.map((section) => (
        <View key={section.category.id}>
          {/* Tappable section header (both the title and the See-all chip
              navigate to the same destination) */}
          <Pressable
            onPress={() => onCategoryPress(section.category.id)}
            style={styles.headerRow}
            accessibilityRole="button"
            accessibilityLabel={`See all ${section.category.name} merchants`}
          >
            <Text variant="heading.sm" style={styles.headerTitle}>
              {section.category.name} near you
            </Text>
            <View style={styles.seeAllChip}>
              <Text style={styles.seeAllText}>See all</Text>
              <ChevronRight size={14} color={color.brandRose} />
            </View>
          </Pressable>

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

const styles = StyleSheet.create({
  headerRow: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    paddingHorizontal: 18,
    marginBottom:     spacing[3],
  },
  headerTitle: {
    color: color.navy,
    flex:  1,
  },
  seeAllChip: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              2,
    paddingVertical:  spacing[1],
    paddingLeft:      spacing[2],
  },
  seeAllText: {
    fontSize:   12,
    fontFamily: 'Lato-SemiBold',
    color:      color.brandRose,
  },
})

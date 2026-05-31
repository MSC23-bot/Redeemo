import React from 'react'
import { View, ScrollView, Pressable, StyleSheet } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import { Text, color, spacing } from '@/design-system'
import { BranchTile } from '@/features/shared/BranchTile'
import type { HomeNearbyCategoryRail } from '@/lib/api/discovery'
import { RailHeader } from './RailHeader'

// Batch 1B Tier 3 (2026-06-01) — wider tile (240→268) for a more premium
// card scale, matching Popular + Trending.
const TILE_WIDTH = 268
const TILE_GAP = 12

type Props = {
  rails: HomeNearbyCategoryRail[]
  // Receives branch.id — call site routes to
  // /merchant/${branch.merchant.id}?branch=${branchId}&from=home.
  onBranchPress: (branchId: string) => void
  onCategoryPress: (categoryId: string) => void
  onFavourite?: (id: string) => void
}

/**
 * Home preview rows. Each section renders the category header (tappable)
 * + a "See all ›" chip on the right (also tappable) — both route to the
 * full-interaction CategoryResultsScreen at /category/:id where the user
 * picks scope, sort, voucher type, amenities, etc.
 *
 * Per the Phase E migration: consumes `rails: HomeNearbyCategoryRail[]`
 * (the new `feed.nearbyByCategoryRails` envelope). Per-category render
 * uses `<RailHeader railKind="nearbyByCategory">` for conditional copy.
 * Per-category empty rails are absent from the array in the new contract
 * (server-side filtering); the silent-hide path (`rail.meta === null`)
 * remains as a defensive guard.
 */
export function NearbyByCategory({ rails, onBranchPress, onCategoryPress, onFavourite }: Props) {
  // Filter: per spec §6.3 the server omits empty categories from the
  // array entirely. The `meta === null` guard is defensive — silently
  // hide per-category if any future contract drift slips a null-meta
  // entry through. Empty branches array → also hidden (display-side
  // guard while the server contract stabilises).
  const visibleRails = rails.filter((r) => r.meta !== null && r.branches.length > 0)

  if (visibleRails.length === 0) return null

  return (
    <View style={{ paddingBottom: 100, gap: spacing[6] }}>
      {visibleRails.map((rail) => {
        // v1.6 (PR #126 device-QA-4 owner direction 2026-05-23): hide the
        // "See all" chip on one-card rails.  A single-merchant rail with a
        // "See all" chip implies more merchants behind it; with parent-
        // category grouping a one-card rail genuinely means the parent
        // category only has one merchant nearby, so the chip is misleading.
        // Threshold locked at >= 2 — the rail header itself stays tappable
        // for completeness, just without the chevron promise.
        const showSeeAll = rail.branches.length >= 2
        return (
        <View key={rail.category.id}>
          {/* Tappable section header (both the title and the See-all chip
              navigate to the same destination) */}
          <Pressable
            onPress={() => onCategoryPress(rail.category.id)}
            style={styles.headerRow}
            accessibilityRole="button"
            accessibilityLabel={`See all ${rail.category.name} merchants`}
          >
            <View style={{ flex: 1 }}>
              <RailHeader
                meta={rail.meta}
                railKind="nearbyByCategory"
                categoryName={rail.category.name}
              />
            </View>
            {showSeeAll ? (
              <View style={styles.seeAllChip}>
                <Text style={styles.seeAllText}>See all</Text>
                <ChevronRight size={14} color={color.brandRose} />
              </View>
            ) : null}
          </Pressable>

          {/* Horizontal scroll of tiles */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 18, gap: TILE_GAP }}
          >
            {rail.branches.map((branch) => (
              // Branch-keyed identity (Phase 2.3) — same pattern as
              // FeaturedCarousel + TrendingSection.
              <BranchTile
                key={branch.id}
                branch={branch}
                onPress={onBranchPress}
                {...(onFavourite ? { onFavourite } : {})}
                width={TILE_WIDTH}
              />
            ))}
          </ScrollView>
        </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    paddingRight:     18,
    marginBottom:     spacing[3],
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

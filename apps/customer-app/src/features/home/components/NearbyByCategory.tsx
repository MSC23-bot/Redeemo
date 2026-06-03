import React from 'react'
import { View, ScrollView, Pressable, StyleSheet } from 'react-native'
import { ChevronRight } from '@/design-system/icons'
import { Text, color, spacing } from '@/design-system'
import { FadeInDown } from '@/design-system/motion/FadeIn'
import { NearbyCard, NEARBY_CARD_WIDTH } from './NearbyCard'
import type { HomeNearbyCategoryRail } from '@/lib/api/discovery'
import { RailHeader } from './RailHeader'

// 2026-06-03 — owner direction: the Nearby rails use a bespoke <NearbyCard>
// (landscape, name-beside-logo on the banner). It differs from Popular/Trending
// by STYLE + SHAPE (wider-than-tall vs portrait), and is wider than the Popular
// rail card but NOT full-width so the next card peeks (rail reads scrollable).
const TILE_WIDTH = NEARBY_CARD_WIDTH
const TILE_GAP = 12

type Props = {
  rails: HomeNearbyCategoryRail[]
  // Receives branch.id — call site routes to
  // /merchant/${branch.merchant.id}?branch=${branchId}&from=home.
  onBranchPress: (branchId: string) => void
  onCategoryPress: (categoryId: string) => void
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
export function NearbyByCategory({ rails, onBranchPress, onCategoryPress }: Props) {
  // Filter: per spec §6.3 the server omits empty categories from the
  // array entirely. The `meta === null` guard is defensive — silently
  // hide per-category if any future contract drift slips a null-meta
  // entry through. Empty branches array → also hidden (display-side
  // guard while the server contract stabilises).
  const visibleRails = rails.filter((r) => r.meta !== null && r.branches.length > 0)

  if (visibleRails.length === 0) return null

  return (
    <View style={{ paddingBottom: 100, gap: spacing[7] }}>
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
                <ChevronRight size={18} color={color.brandCoral} />
              </View>
            ) : null}
          </Pressable>

          {/* Horizontal scroll of cards. No vertical padding (matches the
              Popular/Trending rail) so there is no gap below the card. */}
          <ScrollView
            horizontal
            removeClippedSubviews
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 18, gap: TILE_GAP }}
          >
            {rail.branches.map((branch, i) => {
              // Branch-keyed identity (Phase 2.3) — same pattern as
              // FeaturedCarousel + PopularSection.
              const tile = (
                <NearbyCard key={branch.id} branch={branch} onPress={onBranchPress} width={TILE_WIDTH} />
              )
              // Batch 5 §10.1 — first 4 tiles per rail stagger-fade-up,
              // first-mount only.
              return i < 4
                ? <FadeInDown key={branch.id} delay={i * 50}>{tile}</FadeInDown>
                : tile
            })}
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
    marginBottom:     spacing[4],
  },
  seeAllChip: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              2,
    paddingVertical:  spacing[1],
    paddingLeft:      spacing[2],
  },
  seeAllText: {
    fontSize:   14,
    fontFamily: 'Lato-SemiBold',
    color:      color.brandCoral,
  },
})

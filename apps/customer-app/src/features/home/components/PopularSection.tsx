import React from 'react'
import { View, ScrollView } from 'react-native'
import { spacing } from '@/design-system'
import { BranchTile } from '@/features/shared/BranchTile'
import type { HomeRail } from '@/lib/api/discovery'
import { RailHeader } from './RailHeader'

// Task D.4 — Spec §11.7.
//
// `<PopularSection>` is the platform-wide sibling rail that fires when
// `<TrendingSection>` is empty OR when no effective location is resolved
// (mutual-exclusion invariant enforced server-side by `getHomeFeed`).
//
// Header copy is FIXED ("Popular on Redeemo") via RailHeader's `fixedCopy`
// prop — Popular is platform-claim by definition, never locality-scoped.
//
// In the no-location branch of `buildPopularRail`, tiles carry
// `supplyRung: null / proximityBand: null / distanceMetres: null`.  The
// shared `<BranchTile>` is already null-safe — `formatDistance(null)`
// returns '' (chip hidden) and `<ProximityBandChip band={null} />`
// returns null.  No new tile chrome is required here.
//
// Carousel chrome mirrors `<TrendingSection>` (horizontal ScrollView, same
// tile width + gap).

const TILE_WIDTH = 240
const TILE_GAP   = 12

type Props = {
  rail: HomeRail
  // Receives branch.id — call site routes to
  // /merchant/${branch.merchant.id}?branch=${branchId}&from=home.
  onBranchPress: (branchId: string) => void
  onFavourite?:  (id: string) => void
}

export function PopularSection({ rail, onBranchPress, onFavourite }: Props) {
  const branches = rail.branches

  // §11.6 — silent hide when meta is null OR no branches.
  if (!rail.meta || branches.length === 0) return null

  return (
    <View>
      <RailHeader fixedCopy="Popular on Redeemo" meta={rail.meta} />

      <View style={{ marginTop: spacing[3] }} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 18, gap: TILE_GAP }}
      >
        {branches.map((branch) => (
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
}

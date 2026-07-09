import React from 'react'
import { View, ScrollView } from 'react-native'
import { spacing } from '@/design-system'
import { FadeInDown } from '@/design-system/motion/FadeIn'
import { PopularCard, RAIL_TILE_WIDTH } from './PopularCard'
import type { HomeRail } from '@/lib/api/discovery'
import { RailHeader } from './RailHeader'
import { SectionBand } from './SectionBand'

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

// Shared rail-card width (see RAIL_TILE_WIDTH). Popular / Trending / Nearby all
// match; Featured hero is the one larger exception.
const TILE_WIDTH = RAIL_TILE_WIDTH
const TILE_GAP   = 12

type Props = {
  rail: HomeRail
  // Receives branch.id — call site routes to
  // /merchant/${branch.merchant.id}?branch=${branchId}&from=home.
  onBranchPress: (branchId: string) => void
  onFavourite?:  (id: string) => void
}

// Perf batch 1 (2026-07-09) — React.memo'd: HomeScreen passes a stable
// (useCallback) `onBranchPress`, and `rail` only changes when the feed's
// popularRail itself changes, so this section skips re-rendering on
// unrelated HomeScreen state churn.
export const PopularSection = React.memo(function PopularSection({ rail, onBranchPress }: Props) {
  const branches = rail.branches

  // §11.6 — silent hide when meta is null OR no branches.
  if (!rail.meta || branches.length === 0) return null

  return (
    // Batch 2 M4 — warm-tint "happening now" band (spec §9.5) + brand-coral
    // live dot + subtitle, matching <TrendingSection>.
    <SectionBand variant="warm" testID="popular-band">
      <RailHeader
        fixedCopy="Popular on Redeemo"
        meta={rail.meta}
        trendingMark
        subtitle="Most-redeemed near you"
      />

      <View style={{ marginTop: spacing[3] }} />

      <ScrollView
        horizontal
        // No removeClippedSubviews: PopularCard's logo straddles the banner
        // seam (absolute), which Android mis-clips once a card is partly
        // off-screen, blanking the logo. See HomeScreen scroll-pause note.
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 18, gap: TILE_GAP }}
      >
        {branches.map((branch, i) => {
          // Branch-keyed identity (Phase 2.3) — same pattern as
          // FeaturedCarousel + TrendingSection.
          const tile = (
            <PopularCard
              key={branch.id}
              branch={branch}
              onPress={onBranchPress}
              width={TILE_WIDTH}
            />
          )
          // Batch 5 §10.1 — first 4 tiles stagger-fade-up, first-mount only.
          return i < 4
            ? <FadeInDown key={branch.id} delay={i * 50}>{tile}</FadeInDown>
            : tile
        })}
      </ScrollView>
    </SectionBand>
  )
})

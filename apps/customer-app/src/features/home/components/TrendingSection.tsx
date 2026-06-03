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
// `<TrendingSection>` now consumes the `rail: HomeRail` envelope (matching
// the C.6 FeaturedCarousel migration pattern). Header copy stays the
// literal "Trending near you" — Trending is strict NEARBY+CITY scope
// (never cascades), so the locality-aware <RailHeader> would always
// resolve to the same fallback copy.  The literal phrase is locked by
// the Amendment C §CM regression pin.
//
// Silent-hide invariant (§11.6): the section returns null when
// `rail.meta` is null OR when `branches` is empty.  HomeScreen relies on
// this to enforce the trending↔popular swap (which fires when
// `feed.trendingRail.meta` is null).

// Shared rail-card width (see RAIL_TILE_WIDTH) — identical to Popular + Nearby.
const TILE_WIDTH = RAIL_TILE_WIDTH
const TILE_GAP   = 12

type Props = {
  rail: HomeRail
  // Receives branch.id — call site routes to
  // /merchant/${branch.merchant.id}?branch=${branchId}&from=home.
  onBranchPress: (branchId: string) => void
  onFavourite?:  (id: string) => void
}

export function TrendingSection({ rail, onBranchPress }: Props) {
  const branches = rail.branches

  if (!rail.meta || branches.length === 0) return null

  return (
    // Batch 2 M4 — warm-tint "happening now" band (spec §9.5), replacing the
    // off-palette amber gradient. Header unified on <RailHeader> (Mustica
    // 20pt) with the animated brand-coral trending flame + subtitle, matching
    // <PopularSection> — whichever rail wins the slot reads identically. The
    // old bespoke STATIC amber Flame + heading.sm header is retired in favour
    // of the Mustica title + the in-motion <TrendingFlame> mark.
    <SectionBand variant="warm" testID="trending-band">
      <RailHeader
        fixedCopy="Trending near you"
        meta={rail.meta}
        trendingMark
        subtitle="Catching on this week"
      />

      <View style={{ marginTop: spacing[3] }} />

      {/* Horizontal scroll of tiles */}
      <ScrollView
        horizontal
        // No removeClippedSubviews: the card logo straddles the banner seam
        // (absolute), which Android mis-clips once a card is partly off-screen.
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 18, gap: TILE_GAP }}
      >
        {branches.map((branch, i) => {
          // Branch-keyed identity (Phase 2.3) — same pattern as
          // FeaturedCarousel.
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
}

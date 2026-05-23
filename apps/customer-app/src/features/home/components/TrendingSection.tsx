import React from 'react'
import { View, ScrollView } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Flame } from 'lucide-react-native'
import { Text, color, spacing } from '@/design-system'
import { BranchTile } from '@/features/shared/BranchTile'
import type { HomeRail } from '@/lib/api/discovery'

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

const TILE_WIDTH = 240
const TILE_GAP   = 12

type Props = {
  rail: HomeRail
  // Receives branch.id — call site routes to
  // /merchant/${branch.merchant.id}?branch=${branchId}&from=home.
  onBranchPress: (branchId: string) => void
  onFavourite?:  (id: string) => void
}

export function TrendingSection({ rail, onBranchPress, onFavourite }: Props) {
  const branches = rail.branches

  if (!rail.meta || branches.length === 0) return null

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
          alignItems:    'center',
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
          // FeaturedCarousel.
          <BranchTile
            key={branch.id}
            branch={branch}
            onPress={onBranchPress}
            {...(onFavourite ? { onFavourite } : {})}
            width={TILE_WIDTH}
          />
        ))}
      </ScrollView>
    </LinearGradient>
  )
}

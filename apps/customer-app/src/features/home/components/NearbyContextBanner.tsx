// v1.5 — PR #126 device-QA-3 owner direction (β2 + β3, 2026-05-23).
//
// Minimal banner that renders ABOVE the NearbyByCategory section when at
// least one category rail has cascaded to platform supply (i.e. one or
// more `nearbyByCategoryRails[i].meta.scopeExpanded === true`).  Provides
// honest context that local/catchment supply is limited so the user
// understands why category rails carry `{Category} on Redeemo` headers
// + larger distances on the tile chips.
//
// Locked owner copy (β3 sample):
//   "We're still growing in {City}.  Here are the closest category
//    matches on Redeemo."
//
// Defensive fallback when `cityName` is null drops the leading clause
// entirely.  In practice the banner only fires when effLoc resolved (so
// a populated locality is expected), but defensive coding mirrors the
// pattern from <NearbySectionEmpty>.
//
// Visual baseline — intentionally minimal per β3: "Keep this minimal.
// Prefer adapting/reusing the existing nearby empty-state area rather
// than adding a big new visual system."  Same warm-tinted card surface +
// hairline border as <NearbySectionEmpty>, smaller padding, no CTAs.
// §DE (deferred) will revisit the design polish.

import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text, color, spacing, radius } from '@/design-system'

interface NearbyContextBannerProps {
  cityName?: string | null
}

export function NearbyContextBanner({ cityName }: NearbyContextBannerProps = {}) {
  const message = cityName
    ? `We're still growing in ${cityName}. Here are the closest category matches on Redeemo.`
    : `Here are the closest category matches on Redeemo.`
  return (
    <View style={styles.card} testID="home-nearby-context-banner">
      <Text style={styles.body}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal:  18,
    marginTop:         spacing[2],
    marginBottom:      spacing[2],
    paddingVertical:   spacing[3],
    paddingHorizontal: spacing[4],
    backgroundColor:   color.surface.tint,
    borderRadius:      radius.md,
    borderWidth:       1,
    borderColor:       color.border.subtle,
  },
  body: {
    fontSize:   13,
    fontFamily: 'Lato-Regular',
    color:      color.text.secondary,
    lineHeight: 18,
  },
})

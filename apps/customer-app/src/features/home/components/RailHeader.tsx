import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'

type RailMeta = {
  locality:      { id: string; name: string } | null
  scope:         'nearby' | 'city' | 'platform'
  scopeExpanded: boolean
}

export interface RailHeaderProps {
  fixedCopy?:    string
  meta:          RailMeta | null
  fallbackCopy?: string
  subtitle?:     string
  railKind?:     'featured' | 'trending' | 'popular' | 'nearbyByCategory'
  categoryName?: string
  // PR #126 device-QA Halifax fixup (2026-05-23): Featured rail honesty.
  // When the rail's NEARBY+CITY supply is genuinely IN the locality (every
  // visible branch passes the §6.4.1 strict-locality identity ladder),
  // header reads "Featured in {City}". When supply is CATCHMENT/POST_TOWN
  // tier (visible branches are nearby but in different localities), header
  // reads "Featured near {City}".  Computed + passed by <FeaturedCarousel>.
  // `scopeExpanded === true` still wins (returns "Featured on Redeemo").
  // Undefined / null falls back to the in-locality framing for backward
  // compatibility with tests + non-Featured rails.
  allBranchesInLocality?: boolean | null
}

export function RailHeader({ fixedCopy, meta, fallbackCopy, subtitle, railKind, categoryName, allBranchesInLocality }: RailHeaderProps) {
  const title = (() => {
    if (fixedCopy) return fixedCopy
    if (!meta) return fallbackCopy ?? ''
    if (railKind === 'featured') {
      if (meta.scopeExpanded) return 'Featured on Redeemo'
      if (meta.locality) {
        // `allBranchesInLocality === false` is the explicit "catchment"
        // signal (some visible branches don't pass the strict-locality
        // gate).  `true`, `null`, or `undefined` all keep the original
        // "in {City}" framing.
        return allBranchesInLocality === false
          ? `Featured near ${meta.locality.name}`
          : `Featured in ${meta.locality.name}`
      }
      return 'Featured near you'
    }
    if (railKind === 'nearbyByCategory' && categoryName) {
      // PR #126 device-QA fixup (2026-05-23): drop the per-category `near you`
      // suffix.  Owner direction — repeating `near you` on every category
      // rail header (e.g. "Restaurant near you", "Cafe & Coffee near you",
      // "Barber near you") felt clunky.  The nearbyByCategory section as a
      // whole sits inside the locality-first relevance model, and each tile
      // carries distance + proximity-band chips, so the rail-level claim is
      // preserved at the tile level without repeating "near you" six times.
      //
      // v1.5 (PR #126 device-QA-3 owner direction 2026-05-23): when the
      // category rail has cascaded to platform supply (β1 — backend signals
      // via meta.scopeExpanded=true), render the platform-honest variant
      // `{Category} on Redeemo` instead of the bare neutral name.  Mirrors
      // the Featured cascade framing.  Locality-claim rails (scopeExpanded
      // === false) continue to use the bare neutral name.
      if (meta.scopeExpanded) return `${categoryName} on Redeemo`
      return categoryName
    }
    return fallbackCopy ?? ''
  })()

  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row:      { paddingHorizontal: 18, paddingTop: 12 },
  title:    { fontSize: 20, fontFamily: 'MusticaPro-Semibold', color: '#010C35' },
  subtitle: { fontSize: 13, fontFamily: 'Lato-Regular',         color: '#6B7280', marginTop: 2 },
})

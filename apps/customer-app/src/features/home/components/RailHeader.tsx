import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import { homeCategoryRailLabel } from '../utils/homeCategoryRailLabel'

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
      // v1.6 (PR #126 device-QA-4 owner direction 2026-05-23): backend now
      // groups NearbyByCategory rails by PARENT category (e.g. "Food &
      // Drink") rather than leaf category (e.g. "Pizza Restaurant",
      // "Indian Cafe").  The per-tile `BranchTile.merchant.descriptor`
      // still carries the leaf-level differentiator so cards inside the
      // rail show "Italian Restaurant", "Barber", etc.
      //
      // The rail header MUST NOT feel like a plain duplicate of the top
      // category navigation grid (which uses bare parent names).  Apply
      // `homeCategoryRailLabel()` to produce sentence-case + " picks":
      //   "Food & Drink"      → "Food & drink picks"
      //   "Beauty & Wellness" → "Beauty & wellness picks"
      //
      // The cascade-specific `{Category} on Redeemo` variant (v1.5) is
      // RETIRED — the <NearbyContextBanner> already carries the platform-
      // claim message when any rail is cascaded.  Local + cascade rails
      // share the same label rule.
      return homeCategoryRailLabel(categoryName)
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

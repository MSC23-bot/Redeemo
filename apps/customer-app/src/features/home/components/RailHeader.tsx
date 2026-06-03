import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system'
import { TrendingFlame } from '@/design-system/motion/TrendingFlame'
import { BrandGradientPng, BrandGradientVector } from '@/design-system/components/BrandGradientGlyph'
import { RailIconMotion, type RailIconKind } from '@/design-system/motion/RailIconMotion'
import { homeCategoryRailLabel } from '../utils/homeCategoryRailLabel'

// Leading category glyph for the nearby-category rails. This is GENERIC across
// every category, not just the ones shown today: the icon is matched by name
// (so Travel, Pet, Auto, Family … all resolve), tinted a SINGLE consistent
// brand colour, and rendered at a fixed HEIGHT with its natural WIDTH.
//
// 2026-06-03: these point at `category-icons/RAIL/` — a TRIMMED copy of the
// icons made for this rail header only (sharp, internal transparent padding
// removed). The originals in `category-icons/all/` stay PADDED because the
// "Explore all" capsule (HomeCategoryGrid) and the All Categories screen are
// laid out around that padding — do NOT trim `all/`. Each rail icon's tight
// aspect ratio (`ar` = trimmed width ÷ height) is recorded here and used to
// size the width for a fixed height, so the glyph sits right next to the title.
// `scale` is an optional per-icon optical-size nudge: tall/narrow or square
// glyphs (Food, Beauty) read smaller than the wider ones at the same height, so
// they get a small boost to look the same size.
// `motion` = the logical LOOPING gesture each glyph plays continuously (see
// <RailIconMotion>). Chosen to fit the category's meaning and to stay distinct
// from the Popular/Trending flame's flicker.
const CATEGORY_ICONS: { match: (n: string) => boolean; icon: number; ar: number; scale?: number; motion: RailIconKind }[] = [
  { match: (n) => n.includes('food') || n.includes('drink'),       icon: require('../../../../assets/category-icons/rail/food-drink-icon.png'),          ar: 0.7614, scale: 1.18, motion: 'food' },
  { match: (n) => n.includes('beauty') || n.includes('wellness'),  icon: require('../../../../assets/category-icons/rail/beauty-wellness-icon.png'),     ar: 1.0128, scale: 1.08, motion: 'beauty' },
  // 'medical' MUST precede 'health' — "Health & Medical" also contains "health",
  // so without this first it would wrongly grab the Health & Fitness icon.
  { match: (n) => n.includes('medical'),                           icon: require('../../../../assets/category-icons/rail/health-medical-icon.png'),     ar: 1.0000, motion: 'medical' },
  { match: (n) => n.includes('health') || n.includes('fitness'),   icon: require('../../../../assets/category-icons/rail/health-fitness-icon.png'),      ar: 1.0995, motion: 'fitness' },
  { match: (n) => n.includes('out') || n.includes('about'),        icon: require('../../../../assets/category-icons/rail/out-about-icon.png'),           ar: 1.1189, motion: 'outabout' },
  { match: (n) => n.includes('shop'),                              icon: require('../../../../assets/category-icons/rail/shopping-icon.png'),            ar: 1.0906, motion: 'shopping' },
  { match: (n) => n.includes('home') || n.includes('local'),       icon: require('../../../../assets/category-icons/rail/home-local-services-icon.png'), ar: 0.9987, motion: 'homeservices' },
  { match: (n) => n.includes('travel') || n.includes('hotel'),     icon: require('../../../../assets/category-icons/rail/travel-hotels-icon.png'),       ar: 1.0516, motion: 'travel' },
  { match: (n) => n.includes('family') || n.includes('kid'),       icon: require('../../../../assets/category-icons/rail/family-kids-icon.png'),         ar: 1.1457, motion: 'family' },
  { match: (n) => n.includes('auto') || n.includes('garage'),      icon: require('../../../../assets/category-icons/rail/auto-garage-icon.png'),         ar: 1.1688, motion: 'auto' },
  { match: (n) => n.includes('pet'),                               icon: require('../../../../assets/category-icons/rail/pet-services-icon.png'),        ar: 1.0490, motion: 'pets' },
]
const CAT_FALLBACK: { icon: number; ar: number; scale?: number; motion: RailIconKind } = { icon: require('../../../../assets/category-icons/rail/unmapped-screenshot-icon.png'), ar: 1.1457, motion: 'default' }
// Every rail glyph (category icons + flame + star) is filled with the brand
// red->orange gradient (color.brandGradient) to match the Explore-all round
// arrow button — owner direction 2026-06-03. Fixed render height; width follows
// each icon's aspect ratio.
const CATEGORY_ICON_HEIGHT = 22
// lucide "star" path — filled with the brand gradient for the Featured mark.
const STAR_PATH =
  'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'
// Optical centre of the 23pt / 28lh title from the row's content top — used to
// vertically centre each mark on the title regardless of the mark's height.
const TITLE_CENTER = 14
// Popular/Trending flame + Featured star marks, sized to sit in line with the
// category icons (one consistent mark scale across all rail headers).
const MARK_SIZE = 24

function categoryVisual(name: string): { icon: number; ar: number; scale?: number; motion: RailIconKind } {
  const n = name.toLowerCase()
  return CATEGORY_ICONS.find((v) => v.match(n)) ?? CAT_FALLBACK
}

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
  // Batch 2 M4 — animated brand-coral "trending" flame before the title for
  // the Popular / Trending "happening now" rails (spec §9.5): an ICON in
  // motion (<TrendingFlame>), deliberately NOT a pulse/dot (the pulse is used
  // widely elsewhere in the app and wouldn't read as distinctively
  // "trending" here). Reduced-motion-safe (static flame when reduce-motion
  // is on).
  trendingMark?: boolean
}

export function RailHeader({ fixedCopy, meta, fallbackCopy, subtitle, railKind, categoryName, allBranchesInLocality, trendingMark }: RailHeaderProps) {
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

  const isCategoryRail = railKind === 'nearbyByCategory' && !!categoryName
  const catVisual = isCategoryRail ? categoryVisual(categoryName as string) : null
  // Per-icon optical size + centring (height × optional scale; width follows ar).
  const catH = catVisual ? Math.round(CATEGORY_ICON_HEIGHT * (catVisual.scale ?? 1)) : 0
  const catW = catVisual ? Math.round(catH * catVisual.ar) : 0
  const catMarkTop = Math.round(TITLE_CENTER - catH / 2)
  const markTop = Math.round(TITLE_CENTER - MARK_SIZE / 2)

  return (
    // Mark sits to the LEFT of a title+subtitle column so the subtitle aligns
    // with the TITLE (not the mark). Fixes the misaligned "Most-redeemed near
    // you" under "🔥 Popular on Redeemo".
    <View style={styles.row}>
      <View style={styles.inner}>
        {trendingMark ? (
          <TrendingFlame color={color.brandCoral} gradient={color.brandGradient} size={MARK_SIZE} style={[styles.mark, { marginTop: markTop }]} testID="rail-trending-mark" />
        ) : null}
        {/* Featured rails get a brand-gradient star mark, consistent with the
            flame + category glyphs (owner direction 2026-06-03). It rotates
            continuously (the RailIconMotion 'featured' loop). */}
        {railKind === 'featured' ? (
          <RailIconMotion kind="featured" style={[styles.mark, { marginTop: markTop }]} testID="rail-featured-mark">
            <BrandGradientVector path={STAR_PATH} size={MARK_SIZE} />
          </RailIconMotion>
        ) : null}
        {catVisual ? (
          <RailIconMotion kind={catVisual.motion} style={[styles.catMark, { marginTop: catMarkTop }]} testID="rail-category-mark">
            <BrandGradientPng source={catVisual.icon} width={catW} height={catH} />
          </RailIconMotion>
        ) : null}
        <View style={styles.textCol}>
          {/* Category rails de-emphasise the generic " picks" suffix so the
              category name leads (typographic refinement). */}
          <Text style={styles.title}>
            {isCategoryRail && title.endsWith(' picks') ? (
              <>
                {title.slice(0, -' picks'.length)}
                <Text style={styles.titlePicks}> picks</Text>
              </>
            ) : title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row:      { paddingHorizontal: 18, paddingTop: 12 },
  inner:    { flexDirection: 'row', alignItems: 'flex-start' },
  // marginTop for marks is applied inline (centred per the mark's own height).
  mark:     { marginRight: 8 },
  // Custom brand category glyph (white PNG, single brand-coral tint), trimmed so
  // there's no internal whitespace gap to the title. marginTop applied inline.
  catMark:  { marginRight: 8 },
  textCol:  { flex: 1 },
  // Section titles in navy — the typographic spine. Mustica Pro 23pt with tight
  // tracking for a confident, premium header (owner direction: improve heading
  // typography). The generic " picks" suffix recedes via `titlePicks`.
  title:    { fontSize: 23, lineHeight: 28, fontFamily: 'MusticaPro-Semibold', color: color.navy, letterSpacing: -0.5 },
  titlePicks: { color: color.text.tertiary, fontFamily: 'MusticaPro-Semibold' },
  // Subtitle nudged up for readability (owner direction), kept well under the
  // 21pt title. Single shared style → all rail subtitles stay consistent.
  subtitle: { fontSize: 14, lineHeight: 19, fontFamily: 'Lato-Regular', color: '#6B7280', marginTop: 3 },
})

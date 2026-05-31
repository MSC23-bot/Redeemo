import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { X } from 'lucide-react-native'
import { Text, color, radius, spacing, elevation } from '@/design-system'
import { PressableScale } from '@/design-system/motion/PressableScale'
// import { ProximityBandChip } from '@/design-system/components/ProximityBandChip'   // RETIRED Batch 1B
import { FavouriteHeart } from '@/features/favourites/components/FavouriteHeart'
import { BranchTile as BranchTileType } from '@/lib/api/discovery'
import type { ProximityBand } from '@/lib/api/discovery'
import { formatDistanceCompact } from '@/design-system/utils/formatters'
import { SavePill } from './SavePill'
import { VoucherCountPill } from './VoucherCountPill'
import { StarRating } from './StarRating'
import { composeInfoLine } from './infoLine'
// NOTE: `OpenStatusBadge` was previously rendered with a hardcoded
// `isOpen={true}` value. Removed in PR B M4 audit because the backend
// BranchTile contract does NOT expose an isOpen / isOpenNow field on
// list responses (only on merchant detail + branch list responses). Showing
// a green "Open" badge on every tile was misleading. Re-enable when the
// backend extends the tile contract to include per-tile open state.

// Batch 1B Tier 3 (2026-06-01, owner direction) — the dense shared
// `<BranchTile>` (Home Featured / Trending / Popular / NearbyByCategory,
// Search Category Results, AND the Map carousel via `MapBranchTile`) now
// renders the COMPACT distance ("0.4 mi") via `formatDistanceCompact`.
// The info hierarchy splits onto two lines (`descriptor · locality` then
// `distance · proximity`); the compact "mi" keeps line 2 short enough
// that the proximity clause is never tail-truncated.  Search-side
// `<SearchResultItem>` keeps the long-form "X miles away" — the two
// surfaces intentionally diverge on distance copy.  Still miles-only,
// never metres (preserves the PR #112 fixup-6 single-unit trust rule).
function formatDistance(metres: number | null): string {
  return formatDistanceCompact(metres) ?? ''
}

// Batch 1B (2026-06-01) — semantic-coloured proximity clause inside the
// info line. Mapping mirrors the retired ProximityBandChip's BAND_STYLE
// (PR #126 v1.8 owner-locked direction) so the visual signal carries
// across the chip-to-inline-clause flip:
//
//   IN_YOUR_AREA       → reassuring sage / success-green tone
//   A_LITTLE_FURTHER   → warm amber / warning tone
//   NEAREST_ON_REDEEMO → brand-rose tone (existing baseline)
//   NEARBY / null      → not rendered
//
// NOTE — NEAREST_ON_REDEEMO band colour:
// The brand-rose tone on NEAREST_ON_REDEEMO is a preservation of the
// existing PR #126 v1.8 semantic-colour baseline, NOT a fresh Batch 1B
// design decision. Batch 1B intentionally does NOT change band-colour
// semantics — it only flips the carrier from a standalone chip to a
// nested <Text> child. If owner wants lower brand-rose density at the
// "Nearest match on Redeemo" tier in future, the band can be moved to
// color.text.secondary in a separate, explicit design decision; that
// change is out of scope here.
const BAND_COLOUR: Record<ProximityBand, string | null> = {
  NEARBY:             null,
  IN_YOUR_AREA:       color.success,
  A_LITTLE_FURTHER:   color.warning,
  NEAREST_ON_REDEEMO: color.brandRose,
}

type Props = {
  branch: BranchTileType
  onPress: (id: string) => void
  showFeaturedBadge?: boolean
  showClose?: boolean
  onClose?: () => void
  width?: number
}

// Phase 3C.1g M2.7 — the `onFavourite?: (id) => void` callback prop
// is GONE.  Hearts now route entirely through `<FavouriteHeart>` (spec
// §7.2.1) which calls `useFavourite()` internally + invalidates the
// `['favouriteBranches']` cache key on success.  Rails / list parents
// no longer participate in heart wiring.

export function BranchTile({
  branch,
  onPress,
  showFeaturedBadge,
  showClose,
  onClose,
  width,
}: Props) {
  const distanceStr = formatDistance(branch.distance)
  // Prefer the Plan-1 descriptor ("Italian Restaurant", "Boutique Hotel")
  // when present; fall back to the category name. Avoids showing just
  // "Restaurant" on a merchant tagged as Italian.
  const labelText = branch.merchant.descriptor ?? branch.merchant.primaryCategory?.name ?? ''
  // §DH Tier 1 always-show (locked 2026-05-31 after PR #137; order
  // refined post-device-QA 2026-05-31 per owner direction) — surface
  // branch locality in the info row so multi-branch merchants are
  // distinguishable when the same merchant surfaces twice on the same
  // rail (canonical case: Covelum Brightlingsea vs Covelum Colchester
  // on the Brightlingsea Featured rail).  Wire fallback per the
  // backend `branchTileSchema`: branchLocalityName > branchPostTown >
  // branchCity.
  //
  // Order: descriptor → locality (line 1), then distance → proximity
  // (line 2).  Owner-locked rationale: the category/subcategory
  // descriptor tells users WHAT the place is; the locality DISAMBIGUATES
  // which branch when the merchant has multiple; distance + proximity
  // qualify HOW FAR / HOW NEAR and sit together on their own line.
  //
  // Batch 1B Tier 3 (2026-06-01) — the info hierarchy is now TWO lines
  // (Layout B), not one.  Each line is `numberOfLines={1}`; line 1 may
  // tail-ellipsis a very long descriptor/locality, but that NEVER starves
  // line 2 — distance + proximity live on their own protected line, so
  // the high-value proximity clause is always visible (it previously got
  // truncated off the single combined line on dense rail cards).
  // Accessibility label mirrors the visual order (name, descriptor,
  // locality — distance/proximity stay visible-only per §11.3).  Pure
  // presentation change — wire fields were already exposed by Plan 4 M1;
  // no backend / schema / other-component touchpoints.
  const localityStr = branch.branchLocalityName ?? branch.branchPostTown ?? branch.branchCity ?? ''
  const { primary: infoPrimary, distance: infoDistance, proximity: proximityClause } = composeInfoLine({
    descriptor: labelText,
    locality:   localityStr,
    distance:   distanceStr,
    band:       branch.proximityBand,
  })
  const proximityColour = branch.proximityBand ? BAND_COLOUR[branch.proximityBand] : null

  const accessibilityLabel = localityStr
    ? `${branch.merchant.businessName}, ${labelText}, ${localityStr}`
    : `${branch.merchant.businessName}, ${labelText}`

  return (
    <PressableScale
      onPress={() => onPress(branch.id)}
      accessibilityLabel={accessibilityLabel}
      style={[styles.card, width ? { width } : undefined]}
    >
      {/* Banner */}
      <View style={styles.banner}>
        {branch.merchant.bannerUrl ? (
          <Image
            testID="branch-tile-banner-image"
            source={{ uri: branch.merchant.bannerUrl }}
            style={styles.bannerImage}
            contentFit="cover"
            transition={180}
            recyclingKey={branch.id}
          />
        ) : (
          <LinearGradient
            testID="branch-tile-banner-fallback"
            colors={['#667EEA', '#764BA2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bannerImage}
          />
        )}

        {/* FEATURED badge */}
        {showFeaturedBadge && (
          <LinearGradient
            colors={[color.brandRose, color.brandCoral]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.featuredBadge}
          >
            <Text variant="label.md" style={styles.featuredText}>
              FEATURED
            </Text>
          </LinearGradient>
        )}

        {/* Favourite heart — M2.7 routes through shared component. */}
        <View style={styles.heartButton}>
          <FavouriteHeart
            entity="branch"
            id={branch.id}
            initialIsFavourited={branch.isFavourited}
            tone="on-gradient"
            size={16}
            testID={`branch-tile-${branch.id}-heart`}
          />
        </View>

        {/* Close button (Map tile) */}
        {showClose && onClose && (
          <Pressable
            onPress={onClose}
            accessibilityLabel="Close"
            style={styles.closeButton}
          >
            <X size={14} color="#FFFFFF" />
          </Pressable>
        )}

      </View>

      {/* Logo overlay — Batch 1B Tier 3: lifted OUT of the banner to card
          level. The banner carries `overflow: 'hidden'` (to clip its image
          to the rounded top corners), which previously SLICED the lower
          half of this straddling logo. As a direct child of the
          (non-clipping) card it now overhangs the banner/content seam
          cleanly. zIndex keeps it above the content View. */}
      <View style={styles.logoWrapper}>
        {branch.merchant.logoUrl ? (
          <Image
            testID="branch-tile-logo-image"
            source={{ uri: branch.merchant.logoUrl }}
            style={styles.logo}
            contentFit="cover"
            transition={180}
            recyclingKey={`${branch.id}-logo`}
          />
        ) : (
          <View style={[styles.logo, { backgroundColor: color.navy }]}>
            <Text
              variant="label.md"
              style={{ color: '#FFF', fontSize: 18, fontFamily: 'Lato-Bold' }}
            >
              {branch.merchant.businessName.charAt(0)}
            </Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Text variant="body.sm" style={styles.name} numberOfLines={1}>
            {branch.merchant.businessName}
          </Text>
          <StarRating rating={branch.avgRating} count={branch.reviewCount} />
        </View>
        {(infoPrimary || infoDistance || proximityClause) ? (
          <View style={styles.infoBlock}>
            {/* Line 1 — descriptor · locality */}
            {infoPrimary ? (
              <Text variant="label.md" style={styles.infoPrimary} numberOfLines={1}>
                {infoPrimary}
              </Text>
            ) : null}
            {/* Line 2 — distance · proximity (proximity carries band colour) */}
            {(infoDistance || proximityClause) ? (
              <Text variant="label.md" style={styles.infoSecondary} numberOfLines={1}>
                {infoDistance}
                {proximityClause && proximityColour ? (
                  <>
                    {infoDistance ? ' · ' : ''}
                    <Text style={{ color: proximityColour, fontFamily: 'Lato-SemiBold' }}>
                      {proximityClause}
                    </Text>
                  </>
                ) : null}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={styles.pillRow}>
          <VoucherCountPill count={branch.merchant.voucherCount} />
          <SavePill amount={branch.merchant.maxEstimatedSaving} />
          {/* ProximityBandChip retired Batch 1B 2026-06-01 — proximity now renders
              as an inline coloured clause inside the info line above; see
              composeInfoLine() helper. */}
          {/* OpenStatusBadge intentionally omitted — backend tile contract
              does not include isOpen state. See follow-up notes. */}
        </View>
      </View>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    // overflow: 'hidden' REMOVED Batch 1B — the pill row may wrap to a
    // second row at Dynamic Type Largest; clipping that wrap with overflow
    // would silently hide pills. Banner image is bounded by its own
    // container (styles.banner) so the rounded corners stay clean
    // without card-level clipping.
    ...elevation.sm,
  },
  // Batch 1B Tier 3 — taller hero banner (80→104) for a more premium,
  // less "underscaled" card. `overflow:'hidden'` clips the image to the
  // rounded top corners; the logo is NO LONGER a child of this View
  // (lifted to card level) so it is no longer sliced by this clip.
  banner: { height: 104, position: 'relative', overflow: 'hidden', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  // §CV Phase A — cream (#FFF6EE) placeholder paints under the expo-image
  // banner while it loads, giving a calm "growing in" feel instead of a
  // blank rectangle.  Matches the warm app surface (color.cream token).
  bannerImage: { width: '100%', height: '100%', backgroundColor: '#FFF6EE' },
  featuredBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    borderRadius: radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  featuredText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontFamily: 'Lato-Bold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heartButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Batch 1B Tier 3 — logo lifted to card level (was a banner child with
  // `bottom:-17`, which the banner's overflow:hidden sliced). Now anchored
  // from the card top: `top:80` against a 104pt banner straddles the seam
  // (logo spans y 80–124, overhanging the content top by ~20pt). zIndex
  // keeps it above the content View that follows in flow.
  logoWrapper: { position: 'absolute', top: 80, left: 14, zIndex: 2 },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    // §CV Phase A — cream placeholder under the logo image during load.
    // The initials-block path (logoUrl===null) overrides backgroundColor
    // to color.navy via the inline style below.
    backgroundColor: '#FFF6EE',
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.sm,
  },
  // Batch 1B Tier 3 — paddingTop 18→28 clears the larger straddling logo
  // (logo bottom ≈ 124, content top = 104, so the name starts ~8pt below
  // the logo). Horizontal/bottom padding + inter-row gap nudged up for a
  // more generous, premium rhythm.
  content: {
    paddingTop: 28,
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 6,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    fontSize: 18,
    // Explicit lineHeight — overriding the variant fontSize up to 18
    // without this can clip SemiBold ascenders/descenders at the line box
    // (the §seal-clipping lesson). 24 ≈ 1.33× gives comfortable headroom.
    lineHeight: 24,
    fontFamily: 'Lato-SemiBold',
    color: color.text.primary,
    flex: 1,
    marginRight: spacing[1],
  },
  // Batch 1B Tier 3 — two-line info block (Layout B). Lines sit 2pt apart
  // so they read as one cohesive block, separated from the pill row by the
  // content `gap`.
  infoBlock: { gap: 2 },
  // Line 1 (descriptor · locality) uses the slightly darker secondary tone
  // so the category/locality is clearly visible (owner direction).
  infoPrimary: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Lato-Regular',
    color: color.text.secondary,
  },
  // Line 2 (distance · proximity). Distance is tertiary; the proximity
  // clause overrides to its band colour inline in the JSX.
  infoSecondary: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Lato-Regular',
    color: color.text.tertiary,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,        // No spacing token = 6 (closest are spacing[1]=4 + spacing[2]=8). Locked — pillRow.test.tsx identifies this row by gap===6.
    marginTop: 6,  // Batch 1B Tier 3 — a touch more breathing room above the pills.
    flexWrap: 'wrap',   // Batch 1B — Dynamic Type Largest wraps to second row instead of clipping.
  },
})

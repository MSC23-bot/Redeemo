import React from 'react'
import { View, TouchableOpacity, StyleSheet, Image } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
import { formatDistance, formatGbp } from '@/design-system/utils/formatters'
import { BranchTile } from '@/lib/api/discovery'
import type { ProximityBand } from '@/lib/api/discovery'

// Discovery Rebaseline PR-2 (Phase 2.1) — prop shape switches from
// `MerchantTile` to `BranchTile`.  One tile per BRANCH (Covelum bug fix):
// multi-branch merchants now render as separate Search rows sharing one
// merchant identity.  Render hierarchy per Spec §3.3 — merchant.businessName
// primary, branch locality secondary, descriptor tertiary.
//
// PR-2 device-QA polish (2026-05-19) — owner-flagged blockers from
// screenshots:
//   1. Locality duplication ("Huddersfield, Huddersfield" /
//      "Holmfirth, Holmfirth").  Fixed via `formatBranchLine` below —
//      case-insensitive trimmed equality test.
//   2. Visual hierarchy too loose — bumped name/branch/meta type scale,
//      tightened spacing, polished save pill + fallback logo per the
//      owner's "stronger hierarchy / better spacing/padding/scale /
//      polished fallback logo" direction.
type Props = {
  tile: BranchTile
  query: string
  onPress: (branchId: string, merchantId: string) => void
}

// PR #112 device-QA fix (2026-05-19) — distance formatting now goes
// through the shared `formatDistance` at `@/design-system/utils/
// formatters.ts`.  Locked rule: <500m → "{n} metres away"; ≥500m →
// "{miles.toFixed(1)} miles away".  Cross-surface (Search / Map /
// Home / Category) consistency lives in the shared helper; Phase 2.x
// surfaces import the same function.

/**
 * De-dupes the locality segment when it matches the branch name.
 * Owner-observed screenshots: Karaara branch in Huddersfield rendered as
 * "Huddersfield, Huddersfield" because `branchName === 'Huddersfield'`
 * AND `branchLocalityName === 'Huddersfield'`.  Same for Polish Nail
 * Studio at Holmfirth.
 *
 * Comparison is case-insensitive + trim-normalised so "Huddersfield "
 * / "huddersfield" / "HUDDERSFIELD" all collapse to a single segment.
 *
 * Exported for direct unit testing (see SearchResultItem.locality.test.tsx).
 */
export function formatBranchLine(branchName: string, locality: string | null): string {
  const trimmedName     = branchName.trim()
  const trimmedLocality = locality?.trim() ?? ''
  if (trimmedLocality.length === 0) return trimmedName
  if (trimmedName.toLowerCase() === trimmedLocality.toLowerCase()) {
    // Branch name IS the locality — show one segment, prefer the
    // branchName-as-typed (preserves the merchant's chosen casing).
    return trimmedName
  }
  return `${trimmedName}, ${trimmedLocality}`
}

// PR #112 fixup-5 (2026-05-19) — proximity cue is a SEPARATE muted row.
//
// Owner direction (latest device screenshot): inline meta-line treatment
// from fixup-4 was wrong because it blended a "WHY this result is shown"
// cue with normal metadata AND wrapped badly ("Closest / match" split on
// 166mi cards).  Cue must now sit on its own compact muted-pill row
// below the meta line.
//
// Copy:
//   IN_YOUR_AREA       → 'In your area'
//   A_LITTLE_FURTHER   → 'A short trip'
//   NEAREST_ON_REDEEMO → 'Closest available match'  (was 'Closest match' —
//                                                    owner-locked clearer copy)
//   NEARBY             → null  (no row; already nearby, no explanation needed)
//
// Exported for unit testing.
export function proximityRowLabel(band: ProximityBand | null | undefined): string | null {
  switch (band) {
    case 'IN_YOUR_AREA':       return 'In your area'
    case 'A_LITTLE_FURTHER':   return 'A short trip'
    case 'NEAREST_ON_REDEEMO': return 'Closest available match'
    case 'NEARBY':             return null
    default:                    return null
  }
}

// Back-compat alias — `proximityMetaLabel` was the fixup-4 helper name.
// Kept as a deprecation hook so any external import keeps building; new
// consumers should use `proximityRowLabel`.
export const proximityMetaLabel = proximityRowLabel

// PR #112 fixup-4 (2026-05-19) — owner-locked voucher pluralisation.
// Replaces `formatVoucherCount` ("N offers" wording) on the Search card.
// Redeemo provides VOUCHERS — copy must reflect the product.
//
// Exported for unit testing.
export function formatVouchersWord(count: number | null | undefined): string | null {
  if (count == null || count <= 0) return null
  return count === 1 ? '1 voucher' : `${count} vouchers`
}

function HighlightedName({ name, query }: { name: string; query: string }) {
  if (!query.trim()) return <Text style={styles.merchantName}>{name}</Text>
  const lower = name.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const idx = lower.indexOf(lowerQuery)
  if (idx === -1) return <Text style={styles.merchantName}>{name}</Text>
  return (
    <Text style={styles.merchantName} numberOfLines={1}>
      {name.slice(0, idx)}
      <Text style={[styles.merchantName, styles.highlightMatch]}>{name.slice(idx, idx + query.length)}</Text>
      {name.slice(idx + query.length)}
    </Text>
  )
}

export function SearchResultItem({ tile, query, onPress }: Props) {
  // Primary identity: merchant business name (Spec §3.3).
  const displayName = tile.merchant.businessName
  const distanceStr = formatDistance(tile.distance)

  // Secondary line: branch name + locality fallback chain
  // (branchLocalityName ?? branchPostTown ?? branchCity).  De-duped when
  // the locality matches the branch name (owner-flagged Huddersfield /
  // Holmfirth screenshots).
  const locality =
    tile.branchLocalityName ??
    tile.branchPostTown ??
    tile.branchCity ??
    null
  const branchLine = formatBranchLine(tile.branchName, locality)

  // Tertiary meta line: ONLY descriptor + distance.
  // PR #112 fixup-5: proximity cue moves OFF the meta line and onto its own
  // muted-pill row below (`proximityRowLabel` → <View style={styles.proximityRow}>).
  // Owner direction: a "why this result is shown" cue is meaningful context,
  // not metadata — it must read as visually separate AND must never wrap
  // ("Closest / match" was the bad-wrap regression).
  const descriptor =
    (tile.merchant.descriptor && tile.merchant.descriptor.trim().length > 0)
      ? tile.merchant.descriptor
      : tile.merchant.primaryCategory?.name ?? null
  const metaParts: string[] = []
  if (descriptor)  metaParts.push(descriptor)
  if (distanceStr) metaParts.push(distanceStr)
  const proximityLabel = proximityRowLabel(tile.proximityBand)

  // PR #112 fixup-4 (2026-05-19) — owner-locked save badge anatomy.
  // Hierarchy:
  //   Primary   = SAVING AMOUNT (commercial hook)
  //   Secondary = voucher count (context)
  //
  // State machine:
  //   voucherCount === 0                              → badge hidden
  //   voucherCount === 1 + maxEstimatedSaving > 0     → "Save up to £X.XX" + "1 voucher"
  //   voucherCount === 1 + maxEstimatedSaving null/0  → "1 voucher" only (no saving figure)
  //   voucherCount >= 2 + totalEstimatedSaving > 0    → "Save £X.XX"      + "across N vouchers"
  //   voucherCount >= 2 + totalEstimatedSaving null/0 → "N vouchers" only
  //
  // Locked copy rules (owner direction):
  //   - Word is "voucher(s)", NEVER "offer(s)".
  //   - Word "Save" must be present and prominent.
  //   - For ≥ 2 vouchers, the saving sum is the headline; voucher count is context.
  //
  // Backend: `merchant.totalEstimatedSaving` = sum of estimatedSaving across
  // active+approved vouchers; `maxEstimatedSaving` continues to drive 1-voucher
  // path.  Both fields populated independently (additive contract).
  const voucherCount = tile.merchant.voucherCount ?? 0
  const showBadge    = voucherCount > 0
  const maxSaving    = tile.merchant.maxEstimatedSaving
  const totalSaving  = tile.merchant.totalEstimatedSaving

  // Compute saving headline + secondary line based on state.
  let savingHeadline: string | null = null
  let secondaryLine: string | null  = null
  if (voucherCount === 1) {
    if (maxSaving != null && maxSaving > 0) {
      savingHeadline = `Save up to ${formatGbp(maxSaving)}`
      secondaryLine  = '1 voucher'
    } else {
      secondaryLine = '1 voucher'
    }
  } else if (voucherCount >= 2) {
    if (totalSaving != null && totalSaving > 0) {
      savingHeadline = `Save ${formatGbp(totalSaving)}`
      secondaryLine  = `across ${voucherCount} vouchers`
    } else {
      secondaryLine = formatVouchersWord(voucherCount)
    }
  }

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(tile.id, tile.merchant.id)}
      accessibilityRole="button"
      accessibilityLabel={`${displayName}, ${branchLine}${metaParts.length > 0 ? `, ${metaParts.join(', ')}` : ''}`}
      activeOpacity={0.7}
    >
      {/* Logo — solid surface for image; warmer cream gradient fallback
          with tinted initial.  Bumped to 48pt for a more confident scale. */}
      <View style={styles.logoWrapper}>
        {tile.merchant.logoUrl ? (
          <Image source={{ uri: tile.merchant.logoUrl }} style={styles.logo} />
        ) : (
          <LinearGradient
            colors={['#FCEDE3', '#F6DCC9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logo}
          >
            <Text style={styles.logoInitial}>{displayName.charAt(0).toUpperCase()}</Text>
          </LinearGradient>
        )}
      </View>

      {/* Info — four-tier hierarchy.
          1. Merchant name             (heading)
          2. Branch/locality           (sub)
          3. Descriptor + distance     (meta — no proximity)
          4. Proximity cue (optional)  (muted pill, own row, never wraps) */}
      <View style={styles.info}>
        <HighlightedName name={displayName} query={query} />
        <Text style={styles.branchLine} numberOfLines={1}>{branchLine}</Text>
        {metaParts.length > 0 && (
          <Text style={styles.meta} numberOfLines={1}>{metaParts.join(' · ')}</Text>
        )}
        {proximityLabel && (
          <View style={styles.proximityRow}>
            <Text
              style={styles.proximityLabel}
              numberOfLines={1}
              ellipsizeMode="tail"
              accessibilityLabel={proximityLabel}
            >
              {proximityLabel}
            </Text>
          </View>
        )}
      </View>

      {/* Right — saving badge (PR #112 fixup-4 anatomy).
          Compact, calmer, doesn't dominate.  Hierarchy:
            - Primary:   "Save £X" / "Save up to £X"  (commercial hook)
            - Secondary: "across N vouchers" / "1 voucher" (context)
          voucherCount === 0 → badge hidden entirely. */}
      <View style={styles.right}>
        {showBadge && (
          <View style={styles.saveBadge}>
            {savingHeadline && (
              <Text style={styles.saveBadgePrimary} numberOfLines={1}>{savingHeadline}</Text>
            )}
            {secondaryLine && (
              <Text style={styles.saveBadgeSecondary} numberOfLines={1}>{secondaryLine}</Text>
            )}
          </View>
        )}
        {/*
          Open/closed badge intentionally omitted at this layout layer —
          `isOpenNow` is now available on BranchTile (was missing from
          MerchantTile pre-rebaseline). Discovery Rebaseline keeps the
          render parity baseline; surfacing the badge belongs to a
          follow-on visual pass alongside MerchantTile (PR-3/4) so both
          tile types pick up the badge consistently.
        */}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  // Card — slightly taller paint area, a touch more horizontal breathing
  // room, gentler shadow.  Stronger visual confidence than the original
  // 10/12 padding scale.
  // PR #112 fixup-4: roomier card.  Owner: badge was bulky and crushed the
  // text stack.  Increased vertical padding for breathing room, kept the 12pt
  // gap, and shrunk the badge minWidth so the info column can grow.  Card
  // shadow keeps DESIGN.md navy-tint.
  container: {
    flexDirection: 'row',
    alignItems: 'center',         // vertical centre — badge no longer top-anchored
    backgroundColor: '#FFFFFF',
    borderRadius: 16,             // rounded.lg
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 14,
    shadowColor: '#010C35',       // navy-tinted elevation.sm
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  logoWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    overflow: 'hidden',
    flexShrink: 0,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInitial: {
    fontSize: 20,
    fontFamily: 'Lato-Bold',
    color: '#8B5A3C',          // warm brand brown — reads on cream gradient
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 4,                    // tightened from 6 — pulls the three lines into a tighter stack
  },
  merchantName: {
    fontSize: 15,              // bumped from 12 — strong primary anchor
    fontFamily: 'Lato-Bold',
    color: '#010C35',          // brand navy
    lineHeight: 18,
  },
  highlightMatch: {
    color: '#E20C04',          // brand red — query token highlight
  },
  branchLine: {
    fontSize: 13,              // bumped from 11 — clear secondary
    fontFamily: 'Lato-Regular',
    color: '#1F2937',          // slightly darker than before — better hierarchy contrast
    lineHeight: 16,
  },
  meta: {
    fontSize: 12,              // readable density for the descriptor + distance line
    fontFamily: 'Lato-Regular',
    color: '#6B7280',          // text.secondary
    lineHeight: 16,
  },
  // PR #112 fixup-5 (2026-05-19) — proximity cue on its own row.
  // Owner-locked: calm, compact, MUTED.  Never bright red.  Never wraps
  // (alignSelf flex-start + numberOfLines 1 + ellipsis if absurdly narrow).
  // Smaller than merchant name + saving badge so it doesn't compete.
  proximityRow: {
    alignSelf:         'flex-start',
    backgroundColor:   '#F3F4F6',         // surface-subtle — calm muted grey
    borderRadius:      9999,              // rounded.pill
    paddingHorizontal: 8,
    paddingVertical:   3,
    marginTop:         6,                 // separates from meta line
    maxWidth:          '100%',            // never overflow into the badge
  },
  proximityLabel: {
    fontSize:      11,                    // smaller than meta — clear hierarchy
    fontFamily:    'Lato-Medium',
    color:         '#4B5563',             // text.secondary
    lineHeight:    14,
    letterSpacing: 0.1,
  },
  right: {
    alignItems: 'flex-end',
    gap: 2,
    paddingLeft: 4,
  },
  // PR #112 fixup-4 (2026-05-19) — calmer save badge.
  //   Primary:   "Save £38.50" / "Save up to £5.50"  (heading.sm Lato-SemiBold)
  //   Secondary: "across 6 vouchers" / "1 voucher"   (label.md Lato-Regular)
  // Less bulky than fixup-3: no surface tile + no border.  Saving amount stands
  // alone in deep savings-green — the data is the hero (DESIGN.md "the savings
  // amount in display.md or larger on every voucher card" — Search card is
  // dense, so we use heading.sm but keep Mustica Pro vibe via weight).
  saveBadge: {
    alignItems: 'flex-end',
    minWidth: 0,                                   // shrink-to-content; no longer dominates the card
    paddingVertical: 2,
  },
  saveBadgePrimary: {
    fontSize: 16,                                  // heading.sm — saving as the hero
    fontFamily: 'Lato-SemiBold',
    color: '#15803D',                              // deep savings-green
    lineHeight: 20,
    letterSpacing: -0.1,                           // optical tighten on bold numerals
  },
  saveBadgeSecondary: {
    fontSize: 12,                                  // label.md
    fontFamily: 'Lato-Regular',
    color: '#6B7280',                              // text.secondary muted — calm context line
    lineHeight: 16,
    marginTop: 1,
  },
})

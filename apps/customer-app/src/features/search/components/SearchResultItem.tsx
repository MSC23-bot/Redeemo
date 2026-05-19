import React from 'react'
import { View, TouchableOpacity, StyleSheet, Image } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
import { ProximityBandChip } from '@/design-system/components/ProximityBandChip'
import { formatDistance, formatGbp, formatVoucherCount } from '@/design-system/utils/formatters'
import { BranchTile } from '@/lib/api/discovery'

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

  // Tertiary meta line: merchant.descriptor (new field that wraps category +
  // descriptor tag); fall back to primaryCategory.name if descriptor empty.
  const descriptor =
    (tile.merchant.descriptor && tile.merchant.descriptor.trim().length > 0)
      ? tile.merchant.descriptor
      : tile.merchant.primaryCategory?.name ?? null
  const metaParts: string[] = []
  if (descriptor) metaParts.push(descriptor)
  if (distanceStr) metaParts.push(distanceStr)

  // Savings pill content — owner-locked PR #112 device-QA fixup-3 (2026-05-19).
  // Hierarchy reversed from fixup-2: count is now PRIMARY (large, prominent),
  // value is SECONDARY.  Multi-offer merchants surface TOTAL value across all
  // active vouchers, not the max-single-voucher saving (which was misleading).
  //
  //   voucherCount === 0                             → pill hidden.
  //   voucherCount === 1 + maxEstimatedSaving > 0   → "1 offer" + "Up to £X.XX off"
  //   voucherCount === 1 + maxEstimatedSaving null/0 → "1 offer" only
  //   voucherCount >= 2 + totalEstimatedSaving > 0  → "N offers" + "£X.XX total value"
  //   voucherCount >= 2 + totalEstimatedSaving null/0 → "N offers" only
  //
  // Backend additive: `merchant.totalEstimatedSaving` = sum of estimatedSaving
  // across active+approved vouchers; `maxEstimatedSaving` NOT overloaded.
  // `formatGbp` enforces two-decimal GBP (8.5 → £8.50); `formatVoucherCount`
  // handles 1-vs-N pluralisation.
  const voucherCount        = tile.merchant.voucherCount ?? 0
  const showPill            = voucherCount > 0
  const voucherCountText    = formatVoucherCount(voucherCount) // '1 offer' / '2 offers' / null
  const maxSaving           = tile.merchant.maxEstimatedSaving
  const totalSaving         = tile.merchant.totalEstimatedSaving
  const valueLineText: string | null =
    voucherCount === 1 && maxSaving != null && maxSaving > 0
      ? `Up to ${formatGbp(maxSaving)} off`
      : voucherCount >= 2 && totalSaving != null && totalSaving > 0
        ? `${formatGbp(totalSaving)} total value`
        : null

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

      {/* Info — three-tier hierarchy: merchant name primary, branch line
          secondary, descriptor + distance tertiary. */}
      <View style={styles.info}>
        <HighlightedName name={displayName} query={query} />
        <Text style={styles.branchLine} numberOfLines={1}>{branchLine}</Text>
        {metaParts.length > 0 && (
          <Text style={styles.meta} numberOfLines={1}>{metaParts.join(' · ')}</Text>
        )}
        {/* Plan 4 M3b — renders null for NEARBY / null / undefined.
            `proximityBand` is hoisted to BRANCH level on BranchTile. */}
        <ProximityBandChip band={tile.proximityBand} />
      </View>

      {/* Right — stacked savings pill (PR #112 device-QA fixup-3).
          Hierarchy locked:
            - primary line: "N offers" / "1 offer"  (heading.sm Lato-SemiBold)
            - secondary:    "£X.XX total value" OR "Up to £X.XX off"
                            (body.sm Lato-Regular muted savings-green)
          voucherCount === 0 → pill hidden entirely. */}
      <View style={styles.right}>
        {showPill && (
          <View style={styles.savePill}>
            {voucherCountText && (
              <Text style={styles.savePillPrimary}>{voucherCountText}</Text>
            )}
            {valueLineText && (
              <Text style={styles.savePillSecondary}>{valueLineText}</Text>
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
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,             // rounded.lg per DESIGN.md
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 12,
    // Navy-tinted elevation.sm per DESIGN.md "shadows tint toward brand" rule.
    shadowColor: '#010C35',
    shadowOpacity: 0.08,
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
    gap: 3,                    // a touch more vertical air between lines
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
    fontSize: 11,              // bumped from 10 — readable tertiary
    fontFamily: 'Lato-Regular',
    color: '#6B7280',
    lineHeight: 14,
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
    paddingTop: 0,
  },
  // Save pill — stacked anatomy, fixup-3 hierarchy reversed:
  //   primary line: "2 offers"          — heading.sm Lato-SemiBold 16/22
  //   secondary line: "£X.XX total value" or "Up to £X.XX off"
  //                                       — body.sm Lato-Regular 13pt muted
  // Savings-green tinted tile, gentle hairline border, rounded.lg.
  savePill: {
    backgroundColor: '#ECFDF5',                    // savings-green tint
    borderRadius: 16,                              // rounded.lg
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.20)',           // savings-green hairline
    alignItems: 'flex-end',
    minWidth: 116,                                 // accommodates '10 offers' + '£99.50 total value'
  },
  savePillPrimary: {
    fontSize: 16,                                  // heading.sm — owner-locked prominence
    fontFamily: 'Lato-SemiBold',
    color: '#15803D',                              // deep savings-green
    lineHeight: 20,
  },
  savePillSecondary: {
    fontSize: 12,                                  // body.sm-ish, paired with primary
    fontFamily: 'Lato-Regular',
    color: '#15803D',
    opacity: 0.78,                                 // muted hierarchy
    lineHeight: 16,
    marginTop: 2,
  },
})

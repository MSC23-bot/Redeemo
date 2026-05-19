import React from 'react'
import { View, TouchableOpacity, StyleSheet, Image } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
import { ProximityBandChip } from '@/design-system/components/ProximityBandChip'
import { BranchTile } from '@/lib/api/discovery'

// Discovery Rebaseline PR-2 (Phase 2.1) — prop shape switches from
// `MerchantTile` to `BranchTile`.  One tile per BRANCH (Covelum bug fix):
// multi-branch merchants now render as separate Search rows sharing one
// merchant identity.  Render hierarchy per Spec §3.3 — merchant.businessName
// primary, branch locality secondary, descriptor tertiary.
type Props = {
  tile: BranchTile
  query: string
  onPress: (branchId: string, merchantId: string) => void
}

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m`
  const miles = metres / 1609.34
  return `${miles.toFixed(1)} mi`
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
      <Text style={[styles.merchantName, { color: '#E20C04' }]}>{name.slice(idx, idx + query.length)}</Text>
      {name.slice(idx + query.length)}
    </Text>
  )
}

export function SearchResultItem({ tile, query, onPress }: Props) {
  // Primary identity: merchant business name (Spec §3.3).
  const displayName = tile.merchant.businessName
  const distanceStr = formatDistance(tile.distance)

  // Secondary line: branch name + locality fallback chain
  // (branchLocalityName ?? branchPostTown ?? branchCity).
  const locality =
    tile.branchLocalityName ??
    tile.branchPostTown ??
    tile.branchCity ??
    null
  const branchLine = locality
    ? `${tile.branchName}, ${locality}`
    : tile.branchName

  // Tertiary meta line: merchant.descriptor (new field that wraps category +
  // descriptor tag); fall back to primaryCategory.name if descriptor empty.
  const descriptor =
    (tile.merchant.descriptor && tile.merchant.descriptor.trim().length > 0)
      ? tile.merchant.descriptor
      : tile.merchant.primaryCategory?.name ?? null
  const metaParts: string[] = []
  if (descriptor) metaParts.push(descriptor)
  if (distanceStr) metaParts.push(distanceStr)

  const savingText = tile.merchant.maxEstimatedSaving != null && tile.merchant.maxEstimatedSaving > 0
    ? `Save £${tile.merchant.maxEstimatedSaving}`
    : null

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(tile.id, tile.merchant.id)}
      accessibilityRole="button"
      accessibilityLabel={`${displayName}, ${branchLine}${metaParts.length > 0 ? `, ${metaParts.join(', ')}` : ''}`}
      activeOpacity={0.7}
    >
      {/* Logo */}
      <View style={styles.logoWrapper}>
        {tile.merchant.logoUrl ? (
          <Image source={{ uri: tile.merchant.logoUrl }} style={styles.logo} />
        ) : (
          <LinearGradient
            colors={['#2d1810', '#4a2520']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logo}
          >
            <Text style={styles.logoInitial}>{displayName.charAt(0).toUpperCase()}</Text>
          </LinearGradient>
        )}
      </View>

      {/* Info */}
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

      {/* Right */}
      <View style={styles.right}>
        {savingText && (
          <View style={styles.savePill}>
            <Text style={styles.saveText}>{savingText}</Text>
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
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    paddingHorizontal: 12,
    marginHorizontal: 18,
    marginBottom: 6,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  logoWrapper: {
    width: 42,
    height: 42,
    borderRadius: 10,
    overflow: 'hidden',
    flexShrink: 0,
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInitial: {
    fontSize: 16,
    fontFamily: 'Lato-Bold',
    color: 'rgba(255,255,255,0.7)',
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  merchantName: {
    fontSize: 12,
    fontFamily: 'Lato-Bold',
    color: '#010C35',
  },
  branchLine: {
    fontSize: 11,
    fontFamily: 'Lato-Regular',
    color: '#374151',
  },
  meta: {
    fontSize: 10,
    fontFamily: 'Lato-Regular',
    color: '#6B7280',
  },
  right: {
    alignItems: 'flex-end',
    gap: 2,
  },
  savePill: {
    backgroundColor: '#ECFDF5',
    borderRadius: 50,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(5,150,105,0.12)',
  },
  saveText: {
    fontSize: 8,
    fontFamily: 'Lato-Bold',
    color: '#047857',
  },
})

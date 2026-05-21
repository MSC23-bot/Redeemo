import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { Heart, X } from 'lucide-react-native'
import { Text, color, radius, spacing, elevation } from '@/design-system'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { ProximityBandChip } from '@/design-system/components/ProximityBandChip'
import { BranchTile as BranchTileType } from '@/lib/api/discovery'
import { formatDistance as formatDistanceShared } from '@/design-system/utils/formatters'
import { SavePill } from './SavePill'
import { VoucherCountPill } from './VoucherCountPill'
import { StarRating } from './StarRating'
// NOTE: `OpenStatusBadge` was previously rendered with a hardcoded
// `isOpen={true}` value. Removed in PR B M4 audit because the backend
// BranchTile contract does NOT expose an isOpen / isOpenNow field on
// list responses (only on merchant detail + branch list responses). Showing
// a green "Open" badge on every tile was misleading. Re-enable when the
// backend extends the tile contract to include per-tile open state.

// PR-3 fixup-1 (2026-05-20) — local `formatDistance` helper REMOVED.
// Codex #2 finding: the shared `<BranchTile>` (used by Home Featured /
// Trending / NearbyByCategory, Search Category Results, AND the Map
// carousel via `MapBranchTile`) rendered metres for sub-1km
// (`500m`) and `mi` for >1km (`1.2 mi`), while Search-side
// `<SearchResultItem>` rendered miles-only (`0.3 miles away`).  Routing
// the shared component through the same `formatDistance` helper
// unifies the format across all 5 surfaces.  Locked PR #112 fixup-6
// rule — always miles, never metres — now applies UK-wide.  Closes
// the cross-surface portion of §BY for the surfaces using
// `<BranchTile>`.
function formatDistance(metres: number | null): string {
  return formatDistanceShared(metres) ?? ''
}

type Props = {
  branch: BranchTileType
  onPress: (id: string) => void
  onFavourite?: (id: string) => void
  showFeaturedBadge?: boolean
  showClose?: boolean
  onClose?: () => void
  width?: number
}

export function BranchTile({
  branch,
  onPress,
  onFavourite,
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
  const infoText = [labelText, distanceStr].filter(Boolean).join(' · ')

  return (
    <PressableScale
      onPress={() => onPress(branch.id)}
      accessibilityLabel={`${branch.merchant.businessName}, ${labelText}`}
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

        {/* Favourite heart */}
        {onFavourite && (
          <Pressable
            onPress={() => onFavourite(branch.id)}
            accessibilityLabel={branch.isFavourited ? 'Remove from favourites' : 'Add to favourites'}
            style={styles.heartButton}
          >
            <Heart
              size={16}
              color="#FFFFFF"
              fill={branch.isFavourited ? '#FFFFFF' : 'transparent'}
            />
          </Pressable>
        )}

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

        {/* Logo overlay */}
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
                style={{ color: '#FFF', fontSize: 14, fontFamily: 'Lato-Bold' }}
              >
                {branch.merchant.businessName.charAt(0)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Text variant="body.sm" style={styles.name} numberOfLines={1}>
            {branch.merchant.businessName}
          </Text>
          <StarRating rating={branch.avgRating} count={branch.reviewCount} />
        </View>
        <Text variant="label.md" style={styles.info} numberOfLines={1}>
          {infoText}
        </Text>
        <View style={styles.pillRow}>
          <VoucherCountPill count={branch.merchant.voucherCount} />
          <SavePill amount={branch.merchant.maxEstimatedSaving} />
          {/* Plan 4 M3b — proximity chip renders null for NEARBY /
              null / undefined; safe to mount unconditionally. */}
          <ProximityBandChip band={branch.proximityBand} />
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
    overflow: 'hidden',
    ...elevation.sm,
  },
  banner: { height: 80, position: 'relative' },
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
  logoWrapper: { position: 'absolute', bottom: -17, left: 12 },
  logo: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    // §CV Phase A — cream placeholder under the logo image during load.
    // The initials-block path (logoUrl===null) overrides backgroundColor
    // to color.navy via the inline style below.
    backgroundColor: '#FFF6EE',
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.sm,
  },
  content: {
    paddingTop: 18,
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    fontSize: 13,
    fontFamily: 'Lato-Bold',
    color: '#010C35',
    flex: 1,
    marginRight: 4,
  },
  info: { fontSize: 10.5, color: '#9CA3AF' },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
})

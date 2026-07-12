import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { Text, color } from '@/design-system'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { FavouriteHeart } from '@/features/favourites/components/FavouriteHeart'
import { VoucherValue } from '@/features/shared/VoucherValue'
import { BranchTile as BranchTileType } from '@/lib/api/discovery'
import { formatDistanceCompact } from '@/design-system/utils/formatters'
import { merchantDisplayName } from '@/lib/merchantDisplayName'

/**
 * Map Phase 2 W2b (F9) — the Map list bottom-sheet row.
 *
 * Replaces the shared `<BranchTile size="compact">` card (S4 Task 2) with a
 * compact LEDGER row: a 44x44 rounded logo tile (navy initial fallback),
 * the merchant name + a single meta line ("category · distance ·
 * Open|Closed"), and a right-hand value column (the shared `<VoucherValue>`
 * save capsule + voucher stub) with the branch-level heart at the row end.
 *
 * Branch-first cardinality (Phase C) is preserved by the caller: the
 * FlatList keys on `branch.id`, so two branches of one merchant render as
 * two rows. This component has no merchant-level dedup. Tap → onPress with
 * the BRANCH id (the `?branch=` URL contract).
 */

type Props = {
  branch:  BranchTileType
  onPress: (branchId: string) => void
}

export function MapLedgerRow({ branch, onPress }: Props) {
  const displayName = merchantDisplayName(branch.merchant)
  const category = branch.merchant.descriptor || branch.merchant.primaryCategory?.name || ''
  const distanceStr = formatDistanceCompact(branch.distance) ?? ''
  const metaLeft = [category, distanceStr].filter(Boolean).join(' · ')
  const statusWord = branch.isOpenNow ? 'Open' : 'Closed'
  const statusColour = branch.isOpenNow ? color.success : '#B54708'

  const accessibilityLabel = category ? `${displayName}, ${category}` : displayName

  return (
    <PressableScale
      onPress={() => onPress(branch.id)}
      accessibilityLabel={accessibilityLabel}
      style={styles.row}
    >
      {/* Logo tile — real logo or navy-initial fallback (shared contract). */}
      {branch.merchant.logoUrl ? (
        <Image
          testID="map-ledger-logo-image"
          source={{ uri: branch.merchant.logoUrl }}
          style={styles.logo}
          contentFit="cover"
          transition={180}
          recyclingKey={`${branch.id}-logo`}
        />
      ) : (
        <View style={[styles.logo, styles.logoFallback]}>
          <Text style={styles.logoInitial}>{displayName.charAt(0)}</Text>
        </View>
      )}

      {/* Middle — name + meta line ("category · distance · Open|Closed").
          The category/distance run and the coloured status word are
          separate Text nodes (not nested) so each stays a clean, single
          string node. */}
      <View style={styles.middle}>
        <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
        <View style={styles.metaRow}>
          {metaLeft ? (
            <Text style={styles.meta} numberOfLines={1}>{metaLeft} · </Text>
          ) : null}
          <Text style={[styles.meta, styles.metaStatus, { color: statusColour }]} numberOfLines={1}>
            {statusWord}
          </Text>
        </View>
      </View>

      {/* Right value column — save capsule + voucher stub, stacked. */}
      <VoucherValue
        saveAmount={branch.merchant.maxEstimatedSaving}
        voucherCount={branch.merchant.voucherCount}
        orientation="column"
        density="compact"
        testID="map-ledger-value"
      />

      {/* Heart — branch-level (entity="branch"), at the row end. */}
      <View style={styles.heart}>
        <FavouriteHeart
          entity="branch"
          id={branch.id}
          initialIsFavourited={branch.isFavourited}
          tone="on-light"
          size={20}
          testID={`map-ledger-${branch.id}-heart`}
        />
      </View>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             12,
    backgroundColor: '#FFFFFF',
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     '#EDE4D7',
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor:     '#010C35',
    shadowOpacity:   0.06,
    shadowRadius:    8,
    shadowOffset:    { width: 0, height: 3 },
    elevation:       2,
  },
  logo: {
    width:        44,
    height:       44,
    borderRadius: 12,
    backgroundColor: '#FFF6EE',
  },
  logoFallback: {
    backgroundColor: color.navy,
    alignItems:      'center',
    justifyContent:  'center',
  },
  logoInitial: {
    color:      '#FFFFFF',
    fontSize:   18,
    fontFamily: 'Lato-Bold',
  },
  middle: {
    flex: 1,
    gap:  3,
  },
  name: {
    fontSize:   14.5,
    lineHeight: 19,
    fontFamily: 'Lato-Bold',
    color:      color.navy,
    letterSpacing: -0.1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  meta: {
    fontSize:   12.5,
    lineHeight: 16,
    fontFamily: 'Lato-Medium',
    color:      color.text.secondary,
    flexShrink: 1,
  },
  metaStatus: {
    fontFamily: 'Lato-SemiBold',
    flexShrink: 0,
  },
  heart: {
    width:          32,
    alignItems:     'center',
    justifyContent: 'center',
  },
})

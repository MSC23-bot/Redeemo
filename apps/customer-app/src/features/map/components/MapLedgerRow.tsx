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
 * ROUND 5 (owner-approved board layout) — the side value-rail geometry
 * (rounds 3-4) is ABANDONED: any fixed right rail squeezes the meta line
 * and the distance clipped on device ("· 0...."). The row content now
 * STACKS full-width beside the logo, which cannot clip:
 *   line 1: name (the heart is a small overlay at the card's top-right);
 *   line 2: meta "Category · 0.2 mi · [dot] Open" across the full
 *           content width, standard secondary grey (round 5 also REVERTS
 *           the round-4 category-colour ring/tint: list rows stay
 *           platform-consistent; category colour lives in the FilterSheet
 *           chips and the pins, not here);
 *   line 3: the shared <VoucherValue> ("Save up to £15" capsule + the
 *           TicketMark voucher count, side by side, left-aligned).
 * Taller rows are owner-accepted.
 *
 * W2b ROUND 2 BUG 1 — the row rendered fully STACKED on device: a
 * `<PressableScale>` applies its `style` to its OUTER Animated.View while
 * children render inside the inner `Pressable` (default column layout).
 * The anatomy therefore lives on the explicit `rowInner` View (testID
 * `map-ledger-row`), pinned by a rendered-layout test.
 *
 * Branch-first cardinality (Phase C) preserved by the caller: FlatList
 * keys on `branch.id`; no merchant-level dedup here. Tap → onPress with
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
  const statusWord = branch.isOpenNow ? 'Open' : 'Closed'
  // Status dot green (Open) / amber (Closed) before the word.
  const statusColour = branch.isOpenNow ? color.success : '#B54708'

  const metaLeft = [category, distanceStr].filter(Boolean).join(' · ')

  const accessibilityLabel = category ? `${displayName}, ${category}` : displayName

  return (
    <PressableScale
      onPress={() => onPress(branch.id)}
      accessibilityLabel={accessibilityLabel}
      pressedScale={0.98}
      style={styles.card}
    >
      {/* BUG 1 (round 2) — the row anatomy lives on THIS view. */}
      <View style={styles.rowInner} testID="map-ledger-row">
        {/* Logo tile — plain (round 5 reverted the category-colour ring);
            real logo or the shared navy-initial fallback. */}
        <View testID="map-ledger-logo">
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
        </View>

        {/* Content column (flex 1, minWidth 0) — the three full-width
            lines. Nothing sits beside them, so the meta can never be
            squeezed into a mid-word clip (ellipsis stays as safety net). */}
        <View style={styles.middle} testID="map-ledger-middle">
          {/* Line 1 — name; right margin clears the heart overlay. */}
          <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">{displayName}</Text>

          {/* Line 2 — meta, full width, standard grey. */}
          <View style={styles.metaRow} testID="map-ledger-meta">
            <Text style={styles.meta} numberOfLines={1} ellipsizeMode="tail">{metaLeft}{metaLeft ? ' · ' : ''}</Text>
            <View style={[styles.statusDot, { backgroundColor: statusColour }]} />
            <Text style={[styles.metaStatus, { color: statusColour }]}>{statusWord}</Text>
          </View>

          {/* Line 3 — value: capsule + TicketMark count, left-aligned. */}
          <View style={styles.valueLine}>
            <VoucherValue
              saveAmount={branch.merchant.maxEstimatedSaving}
              voucherCount={branch.merchant.voucherCount}
              testID="map-ledger-value"
            />
          </View>
        </View>

        {/* Heart — small overlay at the card's top-right. Branch-level. */}
        <View style={styles.heart} testID="map-ledger-heart">
          <FavouriteHeart
            entity="branch"
            id={branch.id}
            initialIsFavourited={branch.isFavourited}
            tone="on-light"
            size={20}
            testID={`map-ledger-${branch.id}-heart`}
          />
        </View>
      </View>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  // White card on the cream sheet ground: warm hairline + very soft navy
  // shadow. Chrome only — layout lives on rowInner.
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     '#EDE4D7',
    shadowColor:     '#010C35',
    shadowOpacity:   0.06,
    shadowRadius:    8,
    shadowOffset:    { width: 0, height: 3 },
    elevation:       2,
  },
  rowInner: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    gap:               10,
    paddingVertical:   12,
    paddingHorizontal: 12,
  },
  logo: {
    width:        48,
    height:       48,
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
    // RN flex children need minWidth 0 for text ellipsis (the safety net);
    // with the full-width stack this should never fire for realistic
    // content.
    minWidth: 0,
    gap:  4,
  },
  name: {
    fontSize:   15,
    lineHeight: 20,
    fontFamily: 'Lato-Bold',
    color:      color.navy,
    letterSpacing: -0.1,
    // Clears the heart overlay in the corner (line 1 only; lines 2-3 run
    // the full width beneath it).
    marginRight: 26,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  meta: {
    flexShrink: 1,
    fontSize:   13,
    lineHeight: 17,
    fontFamily: 'Lato-Medium',
    color:      color.text.secondary,
  },
  statusDot: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },
  metaStatus: {
    fontSize:   13,
    lineHeight: 17,
    fontFamily: 'Lato-SemiBold',
  },
  valueLine: {
    marginTop: 2,
  },
  heart: {
    position: 'absolute',
    top:      8,
    right:    10,
  },
})

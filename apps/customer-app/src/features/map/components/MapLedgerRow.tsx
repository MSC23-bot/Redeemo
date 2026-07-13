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
 * Open|Closed"), and a right-hand rail (the shared `<VoucherValue>`
 * save capsule + voucher stub, top-aligned) with the branch-level heart
 * pinned at the row end.
 *
 * W2b ROUND 2 BUG 1 (owner device QA 2026-07-13) — the row rendered fully
 * STACKED on device. Root cause: `<PressableScale>` applies its `style`
 * prop to its OUTER Animated.View, but the children render inside the
 * INNER `Pressable`, which lays out in the default column direction: the
 * `flexDirection: 'row'` on the outer view never governed the children.
 * (Invisible in the round-1 jest assertions, which only queried text/
 * testIDs, not layout.) Fix: the card chrome stays on the PressableScale;
 * an explicit inner `rowInner` View (testID `map-ledger-row`) owns the
 * horizontal anatomy, pinned by a rendered-layout test.
 *
 * Branch-first cardinality (Phase C) is preserved by the caller: the
 * FlatList keys on `branch.id`, so two branches of one merchant render as
 * two rows. This component has no merchant-level dedup. Tap → onPress with
 * the BRANCH id (the `?branch=` URL contract).
 */

// W2b ROUND 3 ITEM 1 (owner device QA: "Indian Restaurant" cut mid-word) —
// the row's WIDTH CONTRACT. The middle column was being squeezed by the
// right value rail because the rail's width floated with its content. The
// rail now has a FIXED width so the middle column's available space is
// deterministic; the middle column carries `minWidth: 0` (RN flexbox does
// not ellipsise text inside a flex child without it) and both text lines
// ellipsise via numberOfLines={1} + ellipsizeMode="tail".
//
// Width derivation (documented: RN has no synchronous text-measurement
// API, so this is derived from font metrics rather than a live measure):
// the widest realistic rail content is the compact save capsule
// "Save up to £999" — 15 glyphs at Lato-Bold 13 (average advance ~0.52em
// → 15 x 13 x 0.52 ≈ 101pt; letterSpacing -0.1 x 15 ≈ -1.5pt → ~100pt)
// + the capsule's compact horizontal padding (8 x 2 = 16pt) ≈ 116pt,
// rounded up for safety. Pinned by a test so a future capsule copy or
// typography change forces a deliberate re-derivation.
export const VALUE_RAIL_WIDTH = 118

type Props = {
  branch:  BranchTileType
  onPress: (branchId: string) => void
}

export function MapLedgerRow({ branch, onPress }: Props) {
  const displayName = merchantDisplayName(branch.merchant)
  const category = branch.merchant.descriptor || branch.merchant.primaryCategory?.name || ''
  // List v3 (round 2) — the category segment may carry its category's
  // colour when the payload already delivers one (no tree resolution here:
  // a missing colour quietly stays secondary; colour must MEAN something,
  // never be invented).
  const categoryColour = branch.merchant.primaryCategory?.pinColour ?? null
  const distanceStr = formatDistanceCompact(branch.distance) ?? ''
  const statusWord = branch.isOpenNow ? 'Open' : 'Closed'
  const statusColour = branch.isOpenNow ? color.success : '#B54708'

  const accessibilityLabel = category ? `${displayName}, ${category}` : displayName

  return (
    <PressableScale
      onPress={() => onPress(branch.id)}
      accessibilityLabel={accessibilityLabel}
      pressedScale={0.98}
      style={styles.card}
    >
      {/* BUG 1 fix — the horizontal anatomy lives on THIS view (the direct
          parent of the four row pieces), not on the PressableScale. */}
      <View style={styles.rowInner} testID="map-ledger-row">
        {/* Logo tile — real logo or navy-initial fallback (shared contract). */}
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

        {/* Middle column (flex 1, minWidth 0) — name + meta line
            ("category · distance · Open|Closed"). Inline nested Texts keep
            it one ellipsised line; ROUND 3 ITEM 1: tail-ellipsis, never a
            mid-word cut. */}
        <View style={styles.middle} testID="map-ledger-middle">
          <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">{displayName}</Text>
          <Text style={styles.meta} numberOfLines={1} ellipsizeMode="tail">
            {category ? (
              <Text style={categoryColour ? { color: categoryColour } : null}>{category}</Text>
            ) : null}
            {category ? ' · ' : ''}
            {distanceStr ? `${distanceStr} · ` : ''}
            <Text style={[styles.metaStatus, { color: statusColour }]}>{statusWord}</Text>
          </Text>
        </View>

        {/* Right rail, top-aligned, FIXED width (ROUND 3 ITEM 1) — save
            capsule with the voucher stub beneath it (the shared
            <VoucherValue> column layout). The fixed width makes the middle
            column's available space deterministic. */}
        <View style={styles.valueRail} testID="map-ledger-value-rail">
          <VoucherValue
            saveAmount={branch.merchant.maxEstimatedSaving}
            voucherCount={branch.merchant.voucherCount}
            orientation="column"
            density="compact"
            testID="map-ledger-value"
          />
        </View>

        {/* Heart — branch-level (entity="branch"), pinned top-right. */}
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
  // White card on the cream sheet ground (List v3): warm hairline + very
  // soft navy shadow. Chrome only — layout direction lives on rowInner.
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
    gap:               12,
    paddingVertical:   10,
    paddingHorizontal: 12,
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
    // ROUND 3 ITEM 1 — RN flex children default to minWidth:'auto'; text
    // inside will push the column wide instead of ellipsising without an
    // explicit minWidth: 0.
    minWidth: 0,
    gap:  3,
    // Optically centre the two text lines against the 44pt logo.
    paddingTop: 3,
  },
  // ROUND 3 ITEM 1 — fixed-width rail (see VALUE_RAIL_WIDTH derivation).
  valueRail: {
    width:      VALUE_RAIL_WIDTH,
    alignItems: 'flex-end',
  },
  name: {
    fontSize:   14.5,
    lineHeight: 19,
    fontFamily: 'Lato-Bold',
    color:      color.navy,
    letterSpacing: -0.1,
  },
  meta: {
    fontSize:   12.5,
    lineHeight: 16,
    fontFamily: 'Lato-Medium',
    color:      color.text.secondary,
  },
  metaStatus: {
    fontFamily: 'Lato-SemiBold',
  },
  heart: {
    width:          28,
    alignItems:     'center',
    justifyContent: 'flex-start',
    paddingTop:     2,
  },
})

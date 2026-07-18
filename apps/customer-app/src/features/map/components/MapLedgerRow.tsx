import React, { useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { Text, color } from '@/design-system'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { FavouriteHeart } from '@/features/favourites/components/FavouriteHeart'
import { VoucherValue } from '@/features/shared/VoucherValue'
import { BranchTile as BranchTileType } from '@/lib/api/discovery'
import { formatDistanceCompact } from '@/design-system/utils/formatters'
import { merchantDisplayName } from '@/lib/merchantDisplayName'
import { useCategories } from '@/hooks/useCategories'
import { buildCategoryTreeIndex, resolveTopLevelPinColour } from '../utils/categoryPinGlyph'

/**
 * Map Phase 2 W2b (F9) — the Map list bottom-sheet row: a mini merchant
 * card with identity (round-4 design pass).
 *
 * Anatomy: 48px logo tile with a 2px ring in the merchant's CATEGORY
 * colour (resolved via the categoryPinGlyph colour ladder; navy fallback);
 * middle column with the name (15 Lato-Bold navy) and a meta line
 * ("category · distance" + a coloured status dot + Open/Closed); a fixed
 * right value rail (compact bold "£15" chip over the red-ticket-mark
 * "N vouchers" stub: the ticket signature stays the row's brand device);
 * the heart as a small OVERLAY at the row's top-right corner (round 4:
 * no longer a width-consuming column).
 *
 * W2b ROUND 2 BUG 1 — the row rendered fully STACKED on device: a
 * `<PressableScale>` applies its `style` to its OUTER Animated.View while
 * children render inside the inner `Pressable` (default column layout).
 * The horizontal anatomy therefore lives on the explicit `rowInner` View
 * (testID `map-ledger-row`), pinned by a rendered-layout test.
 *
 * W2b ROUND 4 DEFECT 3 — width contract v2. Round 3 clamped honestly
 * (ellipsis) but the middle column was structurally too narrow (118 rail
 * + 28 heart column on a 390pt sheet): "Indian Restaurant" still cut.
 * Round 4 frees the width instead: the heart overlay costs 0pt and the
 * rail compresses to 72pt (the "up to" wording moves to the chip's
 * accessibilityLabel; wording='amount'). The middle column keeps
 * flex:1 + minWidth:0 + single-line tail ellipsis as the safety net, and
 * `metaTextAvailableWidth` below exports the geometry so the no-ellipsis
 * arithmetic is test-pinned.
 *
 * Branch-first cardinality (Phase C) preserved by the caller: FlatList
 * keys on `branch.id`; no merchant-level dedup here. Tap → onPress with
 * the BRANCH id (the `?branch=` URL contract).
 */

// ─── Round 4 geometry constants (the row's width contract) ──────────────────
export const LOGO_TILE        = 48
export const ROW_PAD_H        = 10
export const ROW_GAP          = 8
// Fixed value rail — sized so the WIDER of its two pieces fits: the
// compact "£15" chip (~38pt) and the tightened "N vouchers" stub (icon 10
// + gap 2 + text at 11pt + padding ≈ 72pt for a single-digit count).
export const VALUE_RAIL_WIDTH = 72

/**
 * Pure width arithmetic for the meta line's TEXT zone ("category ·
 * distance") at a given screen width — exported so the round-4 test can
 * assert "Indian Restaurant · 0.2 mi" fits WITHOUT ellipsis at 390pt.
 * `statusWordWidthPt` is the estimated width of the status word (the test
 * derives it from Lato advance metrics; RN has no synchronous
 * text-measurement API).
 */
export function metaTextAvailableWidth(screenWidth: number, statusWordWidthPt: number): number {
  const SHEET_PADDING_H = 20 // BottomSheet's own content padding (spacing[5])
  const content = screenWidth - SHEET_PADDING_H * 2
  const middle = content - ROW_PAD_H * 2 - LOGO_TILE - ROW_GAP * 2 - VALUE_RAIL_WIDTH
  const DOT_AND_GAPS = 6 + 4 + 4 // status dot + the metaRow gaps around it
  return middle - DOT_AND_GAPS - statusWordWidthPt
}

type Props = {
  branch:  BranchTileType
  onPress: (branchId: string) => void
}

export function MapLedgerRow({ branch, onPress }: Props) {
  const displayName = merchantDisplayName(branch.merchant)
  const category = branch.merchant.descriptor || branch.merchant.primaryCategory?.name || ''
  const distanceStr = formatDistanceCompact(branch.distance) ?? ''
  const statusWord = branch.isOpenNow ? 'Open' : 'Closed'
  // Design pass — status dot green (Open) / amber (Closed) before the word.
  const statusColour = branch.isOpenNow ? color.success : '#B54708'

  // Round 4 design pass — the logo ring (and the meta category tint)
  // resolve through the SAME colour ladder the pins use: backend-delivered
  // pinColour → parentId walk over the already-loaded category tree →
  // null (ring falls back navy; tint falls back to the secondary text
  // colour). Never an invented hue.
  const { data: categoriesData } = useCategories()
  const treeIndex = useMemo(
    () => buildCategoryTreeIndex(categoriesData?.categories),
    [categoriesData?.categories],
  )
  const categoryColour = branch.merchant.primaryCategory
    ? resolveTopLevelPinColour(branch.merchant.primaryCategory, treeIndex)
    : null
  const ringColour = categoryColour ?? color.navy

  const accessibilityLabel = category ? `${displayName}, ${category}` : displayName

  return (
    <PressableScale
      onPress={() => onPress(branch.id)}
      accessibilityLabel={accessibilityLabel}
      pressedScale={0.98}
      style={styles.card}
    >
      {/* BUG 1 (round 2) — the horizontal anatomy lives on THIS view. */}
      <View style={styles.rowInner} testID="map-ledger-row">
        {/* Logo tile — 48px, 2px category-colour ring; real logo or
            navy-initial fallback. */}
        <View testID="map-ledger-logo" style={[styles.logoRing, { borderColor: ringColour }]}>
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

        {/* Middle column (flex 1, minWidth 0) — name + meta. The meta's
            TEXT part ("category · distance") is one tail-ellipsised line;
            the status dot + word are fixed trailing siblings. */}
        <View style={styles.middle} testID="map-ledger-middle">
          <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">{displayName}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta} numberOfLines={1} ellipsizeMode="tail">
              {category ? (
                <Text style={categoryColour ? { color: categoryColour } : null}>{category}</Text>
              ) : null}
              {category && distanceStr ? ' · ' : ''}
              {distanceStr}
            </Text>
            <View style={[styles.statusDot, { backgroundColor: statusColour }]} />
            <Text style={[styles.metaStatus, { color: statusColour }]}>{statusWord}</Text>
          </View>
        </View>

        {/* Fixed value rail (DEFECT 3) — compact "£15" chip (full "Save up
            to £15" phrasing lives on its accessibilityLabel) stacked over
            the ticket stub. Top padding clears the heart overlay above. */}
        <View style={styles.valueRail} testID="map-ledger-value-rail">
          <VoucherValue
            saveAmount={branch.merchant.maxEstimatedSaving}
            voucherCount={branch.merchant.voucherCount}
            orientation="column"
            density="compact"
            wording="amount"
            testID="map-ledger-value"
          />
        </View>

        {/* Heart — small overlay at the row's top-right corner (round 4:
            costs the middle column zero width). Branch-level. */}
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
  // shadow. Chrome only — layout direction lives on rowInner.
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
    alignItems:        'center',
    gap:               ROW_GAP,
    paddingVertical:   10,
    paddingHorizontal: ROW_PAD_H,
    minHeight:         LOGO_TILE + 20,
  },
  logoRing: {
    width:        LOGO_TILE,
    height:       LOGO_TILE,
    borderRadius: 13,
    borderWidth:  2,
    padding:      1,
  },
  logo: {
    width:        '100%',
    height:       '100%',
    borderRadius: 9,
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
    // DEFECT 3 / round 3 — RN flex children need minWidth 0 for text
    // ellipsis; without it the text pushes the column wide instead.
    minWidth: 0,
    gap:  3,
  },
  name: {
    fontSize:   15,
    lineHeight: 20,
    fontFamily: 'Lato-Bold',
    color:      color.navy,
    letterSpacing: -0.1,
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
  // DEFECT 3 — fixed rail (see the constants block). Top padding keeps
  // the chip clear of the heart overlay in the corner above it.
  valueRail: {
    width:      VALUE_RAIL_WIDTH,
    alignItems: 'flex-end',
    paddingTop: 16,
  },
  heart: {
    position: 'absolute',
    top:      4,
    right:    8,
  },
})

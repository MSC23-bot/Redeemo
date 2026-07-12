import React from 'react'
import { View, FlatList, StyleSheet } from 'react-native'
import { Text, color, spacing } from '@/design-system'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { FadeIn } from '@/design-system/motion/FadeIn'
import { BranchTile } from '@/features/shared/BranchTile'
import { BranchTile as BranchTileType } from '@/lib/api/discovery'
import { FilterState } from '@/features/search/components/FilterSheet'
import { MapListSortSelector } from './MapListSortSelector'

/**
 * Map Phase 2 S4 Task 2 — the custom `BranchRow` (coloured letter thumb,
 * no heart, no logo) is replaced by the SHARED `<BranchTile size="compact">`
 * used everywhere else (Home rails, Map carousel, Category results). This
 * brings the list into parity with the rest of the app for free:
 *   - FavouriteHeart (branch-level, `entity="branch"`) — the list previously
 *     had NO heart at all.
 *   - Real merchant logo (or the shared navy-initial fallback), banner
 *     image, descriptor, rating, open/closed, distance, and saving —
 *     instead of the bespoke category-coloured letter thumb.
 * Branch-keyed identity (Phase C) is preserved as-is: `FlatList`'s
 * `keyExtractor` reads `item.id` (the BRANCH id), so two branches of the
 * same merchant still render as two distinct rows — `<BranchTile>` itself
 * has no merchant-level dedup logic to regress this.
 *
 * Row tap → `onBranchPress(branch.id)` is unchanged: `<BranchTile>`'s
 * `onPress` signature is already `(id: string) => void`, so it wires
 * straight through with no wrapper — MapScreen's `handleBranchNavigate`
 * still resolves branch id → the `?branch=${id}&from=map` URL contract.
 */

type BranchRowProps = {
  branch: BranchTileType
  index: number
  onPress: (branchId: string) => void
}

function MapListRow({ branch, index, onPress }: BranchRowProps) {
  return (
    <FadeIn delay={index * 40} y={8}>
      <BranchTile branch={branch} onPress={onPress} size="compact" />
    </FadeIn>
  )
}

type Props = {
  visible: boolean
  branches: BranchTileType[]
  total: number
  onDismiss: () => void
  /**
   * Fires with the tapped row's `branch.id`.  Phase D wired the
   * `?branch=${id}&from=map` URL contract on top of this signature.
   */
  onBranchPress: (branchId: string) => void
  /**
   * Map Phase 2 S4 Task 3 (spec §7.8) — sort selector in the list header.
   * Lifted from MapScreen: the SAME `FilterState.sortBy` the FilterSheet
   * reads/writes (single source of truth — no separate client-side sort
   * state, no client-side re-ordering here; changing this re-fetches via
   * the S1 server-side `sortBy` param).
   */
  sortBy: FilterState['sortBy']
  onSortByChange: (sortBy: FilterState['sortBy']) => void
}

export function MapListView({
  visible,
  branches,
  total,
  onDismiss,
  onBranchPress,
  sortBy,
  onSortByChange,
}: Props) {
  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      accessibilityLabel="Nearby Merchants list"
    >
      {/* Header — Map Phase 2 S5b Task 3 (owner feedback: "is this my
          area or everything?"). Copy states its OWN scope explicitly
          ("N places in this area") rather than a bare count + a title
          that doesn't say what's being counted. `total` is the SAME
          value MapScreen already threads through (the live in-area/
          filtered result count — not a client-side re-count), so this
          is a copy fix, not a new data dependency. */}
      <View style={styles.header}>
        <Text variant="heading.md" style={styles.headerTitle}>
          {total} {total === 1 ? 'place' : 'places'} in this area
        </Text>
      </View>

      <MapListSortSelector value={sortBy} onChange={onSortByChange} />

      {/* Branch list — branch-keyed identity (PR-3 Phase C).  Two
          branches of the same merchant render as TWO distinct rows. */}
      <FlatList
        data={branches}
        keyExtractor={(item) => item.id}
        style={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <MapListRow
            branch={item}
            index={index}
            onPress={onBranchPress}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  headerTitle: {
    color: color.navy,
  },
  // Map Phase 2 S4 Task 2 — raised from 400: the shared `<BranchTile
  // size="compact">` rows are taller than the old flat BranchRow, so a
  // slightly taller scroll viewport keeps ~2-3 rows visible before
  // scrolling rather than cutting off mid-card.
  list: {
    maxHeight: 520,
  },
  separator: {
    height: spacing[3],
  },
})
